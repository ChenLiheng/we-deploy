import { Router, Request, Response } from 'express'
import path from 'path'
import fs from 'fs'
import { getDb } from '../db/init.js'
import { startPreview } from '../services/buildWorker.js'

const router = Router()

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`
}

function parseBuildDescription(description: string): { qrcodePath?: string } {
  try {
    return JSON.parse(description || '{}')
  } catch {
    return {}
  }
}

// GET /api/builds
router.get('/', (req: Request, res: Response) => {
  const db = getDb()
  const { projectId } = req.query

  let rows: any[]
  if (projectId) {
    rows = db.prepare('SELECT * FROM builds WHERE project_id = ? ORDER BY start_time DESC').all(projectId) as any[]
  } else {
    rows = db.prepare('SELECT * FROM builds ORDER BY start_time DESC').all() as any[]
  }

  const builds = rows.map(row => {
    const descData = parseBuildDescription(row.description)
    return {
      id: row.id,
      projectId: row.project_id,
      iterationId: row.iteration_id || undefined,
      environment: row.environment,
      status: row.status,
      version: row.version,
      desc: row.description || undefined,
      qrcodeUrl: descData.qrcodePath ? `/api/builds/${row.id}/qrcode` : undefined,
      commitHash: row.commit_hash || undefined,
      branch: row.branch,
      logs: [],
      startTime: row.start_time,
      endTime: row.end_time || undefined,
      error: row.error || undefined,
      triggerBy: row.trigger_by,
    }
  })

  res.json(builds)
})

// GET /api/builds/:id
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb()
  const row = db.prepare('SELECT * FROM builds WHERE id = ?').get(req.params.id) as any

  if (!row) {
    res.status(404).json({ error: '构建记录不存在' })
    return
  }

  const logs = db.prepare('SELECT * FROM build_logs WHERE build_id = ? ORDER BY timestamp ASC').all(req.params.id) as any[]

  const descData = parseBuildDescription(row.description)

  res.json({
    id: row.id,
    projectId: row.project_id,
    iterationId: row.iteration_id || undefined,
    environment: row.environment,
    status: row.status,
    version: row.version,
    desc: row.description || undefined,
    qrcodeUrl: descData.qrcodePath ? `/api/builds/${row.id}/qrcode` : undefined,
    commitHash: row.commit_hash || undefined,
    branch: row.branch,
    logs: logs.map(l => ({
      id: l.id,
      timestamp: l.timestamp,
      level: l.level,
      message: l.message,
      source: l.source || undefined,
    })),
    startTime: row.start_time,
    endTime: row.end_time || undefined,
    error: row.error || undefined,
    triggerBy: row.trigger_by,
  })
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

  res.json(
    logs.map((l) => ({
      id: l.id,
      timestamp: l.timestamp,
      level: l.level,
      message: l.message,
      source: l.source || undefined,
    }))
  )
})

// POST /api/builds/:id/preview — trigger preview build
router.post('/:id/preview', (req: Request, res: Response) => {
  const db = getDb()
  const row = db.prepare('SELECT * FROM builds WHERE id = ?').get(req.params.id) as any

  if (!row) {
    res.status(404).json({ error: '构建记录不存在' })
    return
  }

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(row.project_id) as any
  if (!project) {
    res.status(404).json({ error: '项目不存在' })
    return
  }

  const { pagePath } = req.body || {}

  // Start preview in background
  // 透传 builds 表中记录的 branch，保证预览拉取的分支与最初构建时一致
  startPreview(req.params.id, project, db, {
    environment: row.environment,
    pagePath,
    branch: row.branch,
  }).catch((err) => console.error('Preview failed:', err))

  res.json({ message: '预览构建已触发', buildId: req.params.id })
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
