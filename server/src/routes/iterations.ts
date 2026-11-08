import { Router, Request, Response } from 'express'
import { getDb } from '../db/init.js'
import { startBuild } from '../services/buildWorker.js'
import { enqueueBuildTask } from '../services/buildQueue.js'
import { toBuildResponse, type BuildRow } from '../mappers/buildMapper.js'

const router = Router()

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`
}

/**
 * 迭代查询统一带上项目名与最近一次构建的状态/时间，
 * 前端无需再额外请求即可展示「最近构建」列。
 */
const ITERATION_SELECT = `
  SELECT i.*, p.name AS project_name,
         b.status AS last_build_status, b.start_time AS last_build_start, b.end_time AS last_build_end
  FROM iterations i
  LEFT JOIN projects p ON p.id = i.project_id
  LEFT JOIN builds b ON b.id = NULLIF(i.build_id, '')
`

function toIterationResponse(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name || '未知项目',
    name: row.name,
    description: row.description || undefined,
    branch: row.branch,
    version: row.version,
    environment: row.environment,
    status: row.status,
    buildId: row.build_id || undefined,
    lastBuildStatus: row.last_build_status || undefined,
    lastBuildStart: row.last_build_start || undefined,
    lastBuildEnd: row.last_build_end || undefined,
    commitHash: row.commit_hash || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at || undefined,
    createdBy: row.created_by,
  }
}

function findIteration(id: string) {
  return getDb().prepare(`${ITERATION_SELECT} WHERE i.id = ?`).get(id) as any
}

// GET /api/iterations
router.get('/', (req: Request, res: Response) => {
  const db = getDb()
  const { projectId } = req.query

  const rows =
    typeof projectId === 'string' && projectId
      ? (db.prepare(`${ITERATION_SELECT} WHERE i.project_id = ? ORDER BY i.created_at DESC`).all(projectId) as any[])
      : (db.prepare(`${ITERATION_SELECT} ORDER BY i.created_at DESC`).all() as any[])

  res.json(rows.map(toIterationResponse))
})

// POST /api/iterations
router.post('/', (req: Request, res: Response) => {
  const db = getDb()
  const { projectId, name, description, branch, version, environment } = req.body || {}

  if (!projectId || !name?.trim() || !branch?.trim() || !version?.trim() || !environment) {
    res.status(400).json({ error: '项目、名称、分支、版本、环境为必填项' })
    return
  }
  if (environment !== 'dev' && environment !== 'prod') {
    res.status(400).json({ error: '环境只能是 dev 或 prod' })
    return
  }

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) {
    res.status(404).json({ error: '项目不存在' })
    return
  }

  const id = generateId('iter')
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO iterations (id, project_id, name, description, branch, version, environment, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).run(
    id,
    projectId,
    name.trim(),
    description || '',
    branch.trim(),
    version.trim(),
    environment,
    req.user?.username || '',
    now,
    now
  )

  res.status(201).json(toIterationResponse(findIteration(id)))
})

// PATCH /api/iterations/:id/close
router.patch('/:id/close', (req: Request, res: Response) => {
  const db = getDb()
  const row = db.prepare('SELECT * FROM iterations WHERE id = ?').get(req.params.id) as any

  if (!row) {
    res.status(404).json({ error: '迭代不存在' })
    return
  }
  if (row.status === 'closed') {
    res.status(400).json({ error: '迭代已关闭' })
    return
  }
  if (row.status === 'building') {
    res.status(409).json({ error: '构建进行中，请等待构建结束后再关闭' })
    return
  }

  const now = new Date().toISOString()
  db.prepare('UPDATE iterations SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?')
    .run('closed', now, now, req.params.id)

  res.json(toIterationResponse(findIteration(req.params.id)))
})

// PATCH /api/iterations/:id/reopen —— 误关闭的迭代可以重新打开
router.patch('/:id/reopen', (req: Request, res: Response) => {
  const db = getDb()
  const row = db.prepare('SELECT * FROM iterations WHERE id = ?').get(req.params.id) as any

  if (!row) {
    res.status(404).json({ error: '迭代不存在' })
    return
  }
  if (row.status !== 'closed') {
    res.status(400).json({ error: '只有已关闭的迭代可以重新打开' })
    return
  }

  const now = new Date().toISOString()
  db.prepare("UPDATE iterations SET status = 'active', closed_at = '', updated_at = ? WHERE id = ?")
    .run(now, req.params.id)

  res.json(toIterationResponse(findIteration(req.params.id)))
})

// DELETE /api/iterations/:id
router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb()
  const existing = db.prepare('SELECT status FROM iterations WHERE id = ?').get(req.params.id) as any

  if (!existing) {
    res.status(404).json({ error: '迭代不存在' })
    return
  }
  if (existing.status === 'building') {
    res.status(409).json({ error: '构建进行中，无法删除该迭代' })
    return
  }

  db.prepare('DELETE FROM iterations WHERE id = ?').run(req.params.id)
  res.status(204).send()
})

// POST /api/iterations/:id/build
router.post('/:id/build', (req: Request, res: Response) => {
  const db = getDb()
  const iteration = db.prepare('SELECT * FROM iterations WHERE id = ?').get(req.params.id) as any

  if (!iteration) {
    res.status(404).json({ error: '迭代不存在' })
    return
  }

  if (iteration.status === 'closed') {
    res.status(400).json({ error: '已关闭的迭代无法触发构建' })
    return
  }

  if (iteration.status === 'building') {
    res.status(409).json({ error: '该迭代已有正在进行的构建' })
    return
  }

  const projectId = iteration.project_id
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any
  if (!project) {
    res.status(404).json({ error: '迭代所属项目不存在' })
    return
  }

  const buildId = generateId('build')
  const now = new Date().toISOString()
  const triggerBy = req.user?.username || ''

  db.transaction(() => {
    db.prepare(`
      INSERT INTO builds (id, project_id, iteration_id, environment, status, version, description, branch, start_time, trigger_by, kind)
      VALUES (?, ?, ?, ?, 'queued', ?, '', ?, ?, ?, 'upload')
    `).run(buildId, projectId, iteration.id, iteration.environment, iteration.version, iteration.branch, now, triggerBy)

    db.prepare('UPDATE iterations SET status = ?, build_id = ?, updated_at = ? WHERE id = ?')
      .run('building', buildId, now, iteration.id)
  })()

  // 入队后由 buildQueue 控制全局并发；真正执行时仍透传迭代上的 branch，
  // 确保 git clone 拉取用户选定的分支。
  enqueueBuildTask(buildId, db, () =>
    startBuild(buildId, project, db, {
      version: iteration.version,
      environment: iteration.environment,
      branch: iteration.branch,
    })
  )

  const build = db.prepare('SELECT * FROM builds WHERE id = ?').get(buildId) as BuildRow
  res.status(201).json(toBuildResponse(build))
})

export default router
