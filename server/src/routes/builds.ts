import { Router, Request, Response } from 'express'
import path from 'path'
import fs from 'fs'
import { getDb } from '../db/init.js'
import { startPreview } from '../services/buildWorker.js'
import { subscribeBuildEvents } from '../services/buildEvents.js'
import { enqueueBuildTask } from '../services/buildQueue.js'
import {
  parseBuildDescription,
  toBuildResponse,
  toLogResponse,
  type BuildRow,
} from '../mappers/buildMapper.js'

const router = Router()

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`
}

// GET /api/builds
// 列表不返回日志；支持 ?projectId= / ?iterationId= 过滤，?limit= 限制条数（默认 500）
router.get('/', (req: Request, res: Response) => {
  const db = getDb()
  const { projectId, iterationId } = req.query
  const limitRaw = Number(req.query.limit)
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 2000) : 500

  const where: string[] = []
  const params: unknown[] = []
  if (typeof projectId === 'string' && projectId) {
    where.push('project_id = ?')
    params.push(projectId)
  }
  if (typeof iterationId === 'string' && iterationId) {
    where.push('iteration_id = ?')
    params.push(iterationId)
  }
  const sql = `SELECT * FROM builds ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY start_time DESC LIMIT ?`
  const rows = db.prepare(sql).all(...params, limit) as BuildRow[]
  res.json(rows.map((row) => toBuildResponse(row)))
})

// GET /api/builds/:id
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb()
  const row = db.prepare('SELECT * FROM builds WHERE id = ?').get(req.params.id) as BuildRow | undefined

  if (!row) {
    res.status(404).json({ error: '构建记录不存在' })
    return
  }

  const logs = db
    .prepare('SELECT * FROM build_logs WHERE build_id = ? ORDER BY timestamp ASC, id ASC')
    .all(req.params.id) as any[]
  res.json(toBuildResponse(row, logs))
})

// GET /api/builds/:id/logs
// 支持 ?since=<timestamp> 做增量查询，前端轮询时只拉新增日志，
// 避免随构建进行日志条数增多导致单次响应越来越慢。
router.get('/:id/logs', (req: Request, res: Response) => {
  const db = getDb()
  const build = db.prepare('SELECT id FROM builds WHERE id = ?').get(req.params.id)

  if (!build) {
    res.status(404).json({ error: '构建记录不存在' })
    return
  }

  const sinceRaw = req.query.since as string | undefined
  const since = sinceRaw ? Number(sinceRaw) : NaN
  const useSince = Number.isFinite(since) && since > 0

  // 注意：timestamp 同毫秒内可能有多条，所以 since 用 ">"（严格大于）
  // 前端拿到的最大 timestamp 作为下一次轮询的 since，能保证不重不漏
  const sql = useSince
    ? 'SELECT * FROM build_logs WHERE build_id = ? AND timestamp > ? ORDER BY timestamp ASC, id ASC'
    : 'SELECT * FROM build_logs WHERE build_id = ? ORDER BY timestamp ASC, id ASC'
  const logs = useSince
    ? (db.prepare(sql).all(req.params.id, since) as any[])
    : (db.prepare(sql).all(req.params.id) as any[])

  res.json(logs.map(toLogResponse))
})

// GET /api/builds/:id/logs/stream
// SSE（Server-Sent Events）实时推送：连接建立后先补发历史日志，再订阅实时事件，
// build 终态后服务端主动断开。前端用浏览器原生 EventSource 即可消费。
//
// 协议：
//   event: log     data: <BuildLogEvent JSON>     id: <timestamp>
//   event: status  data: { status, endTime?, error? }
//   event: end     data: {}                       (终态后服务端主动发，并 close 连接)
//   :heartbeat\n\n                                (每 30s 一次，防代理 idle 断开)
//
// 断线重连：
//   浏览器 EventSource 默认 3s 自动重连，并自动带上最后一条事件的 id 作为
//   `Last-Event-ID` header。服务端把它当作 since 参数补发缺失日志，做到不丢不重。
router.get('/:id/logs/stream', (req: Request, res: Response) => {
  const db = getDb()
  const buildId = req.params.id
  const build = db.prepare('SELECT id, status, end_time FROM builds WHERE id = ?').get(buildId) as any
  if (!build) {
    res.status(404).json({ error: '构建记录不存在' })
    return
  }

  // 1) SSE 必需的响应头
  //    Content-Type: text/event-stream     SSE 协议
  //    Cache-Control: no-cache             禁缓存
  //    Connection: keep-alive              长连接
  //    X-Accel-Buffering: no               强制 nginx/网关关 buffer（双重保险）
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  // 关闭 Express/Node 写入缓冲，新数据立刻 flush 到客户端
  res.flushHeaders()

  // 2) 解析 since 游标：优先用 ?since=<ts>（首次连接前端可能传），
  //    其次 Last-Event-ID（重连时浏览器自动带，event id 我们写的就是 timestamp）
  const sinceRaw =
    (req.query.since as string | undefined) ||
    (req.headers['last-event-id'] as string | undefined)
  const sinceTs = sinceRaw && Number.isFinite(Number(sinceRaw)) ? Number(sinceRaw) : 0

  // SSE 推送原语
  const sendLog = (log: any) => {
    res.write(`id: ${log.timestamp}\n`)
    res.write(`event: log\n`)
    res.write(`data: ${JSON.stringify(log)}\n\n`)
  }
  const sendStatus = (status: string, endTime?: string, error?: string) => {
    res.write(`event: status\n`)
    res.write(`data: ${JSON.stringify({ status, endTime, error })}\n\n`)
  }
  const sendEnd = () => {
    res.write(`event: end\n`)
    res.write(`data: {}\n\n`)
  }

  // 3) 同步补发历史日志（better-sqlite3 同步 API，期间没有新 emit 会被遗漏）
  const history = db
    .prepare(
      'SELECT * FROM build_logs WHERE build_id = ? AND timestamp > ? ORDER BY timestamp ASC, id ASC'
    )
    .all(buildId, sinceTs) as any[]
  let lastSentTs = sinceTs
  for (const log of history) {
    sendLog(toLogResponse(log))
    if (log.timestamp > lastSentTs) lastSentTs = log.timestamp
  }
  sendStatus(build.status, build.end_time || undefined)

  // 4) 已经终态：补发完历史就直接结束，无需订阅
  if (build.status === 'success' || build.status === 'failed') {
    sendEnd()
    res.end()
    return
  }

  // 5) 订阅实时事件
  let heartbeat: NodeJS.Timeout | null = null
  let closed = false
  const cleanup = () => {
    if (closed) return
    closed = true
    unsubscribe()
    if (heartbeat) clearInterval(heartbeat)
    try {
      res.end()
    } catch {
      /* 客户端已断开 */
    }
  }

  const unsubscribe = subscribeBuildEvents(buildId, {
    onLog: (log) => {
      // 历史 + 实时之间理论上 better-sqlite3 同步执行不会有窗口期，
      // 但加 lastSentTs 检查作为保险（极端竞态下也不会重复发送）
      if (log.timestamp <= lastSentTs) return
      lastSentTs = log.timestamp
      sendLog(log)
    },
    onStatus: ({ status, endTime, error }) => {
      sendStatus(status, endTime, error)
      if (status === 'success' || status === 'failed') {
        sendEnd()
        cleanup()
      }
    },
  })

  // 6) 30s 一次心跳（注释行不会被 EventSource 当事件触发，仅维持连接活跃）
  heartbeat = setInterval(() => {
    res.write(`: heartbeat ${Date.now()}\n\n`)
  }, 30_000)

  // 7) 客户端主动断开（关页面 / 路由切换）时及时回收
  req.on('close', cleanup)
  req.on('aborted', cleanup)
  res.on('close', cleanup)
})

// POST /api/builds/:id/preview — 基于某次构建的分支/版本生成预览二维码
// 预览会新建一条 kind='preview' 的构建记录，而不是复用原记录：
//  - 原上传构建的状态 / 耗时 / 日志保持不变
//  - 预览失败不会把一次成功的上传覆盖成失败
router.post('/:id/preview', (req: Request, res: Response) => {
  const db = getDb()
  const source = db.prepare('SELECT * FROM builds WHERE id = ?').get(req.params.id) as BuildRow | undefined

  if (!source) {
    res.status(404).json({ error: '构建记录不存在' })
    return
  }

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(source.project_id) as any
  if (!project) {
    res.status(404).json({ error: '项目不存在' })
    return
  }

  const { pagePath } = req.body || {}
  const buildId = generateId('build')
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO builds (id, project_id, iteration_id, environment, status, version, description, branch, start_time, trigger_by, kind)
    VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, 'preview')
  `).run(
    buildId,
    source.project_id,
    source.iteration_id || '',
    source.environment,
    source.version,
    JSON.stringify({ sourceBuildId: source.id }),
    source.branch || '',
    now,
    req.user?.username || ''
  )

  // 预览也走同一队列，避免 preview 与 upload 构建同时打满机器资源。
  // 透传原构建记录的 branch，保证预览拉取的分支与最初构建时一致。
  enqueueBuildTask(buildId, db, () =>
    startPreview(buildId, project, db, {
      environment: source.environment,
      pagePath: typeof pagePath === 'string' && pagePath.trim() ? pagePath.trim() : undefined,
      branch: source.branch,
    })
  )

  const row = db.prepare('SELECT * FROM builds WHERE id = ?').get(buildId) as BuildRow
  res.status(201).json(toBuildResponse(row))
})

// GET /api/builds/:id/qrcode — serve QR code image
router.get('/:id/qrcode', (req: Request, res: Response) => {
  const db = getDb()
  const row = db.prepare('SELECT * FROM builds WHERE id = ?').get(req.params.id) as any

  if (!row) {
    res.status(404).json({ error: '构建记录不存在' })
    return
  }

  const descData = parseBuildDescription(row.description)
  if (!descData.qrcodePath || !fs.existsSync(descData.qrcodePath)) {
    res.status(404).json({ error: '二维码不存在' })
    return
  }

  res.sendFile(path.resolve(descData.qrcodePath))
})

export default router
