import { Router, Request, Response } from 'express'
import { getDb } from '../db/init.js'
import { startBuild } from '../services/buildWorker.js'
import { enqueueBuildTask } from '../services/buildQueue.js'

const router = Router()

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`
}

// GET /api/iterations
router.get('/', (req: Request, res: Response) => {
  const db = getDb()
  const { projectId } = req.query

  let rows: any[]
  if (projectId) {
    rows = db.prepare('SELECT * FROM iterations WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as any[]
  } else {
    rows = db.prepare('SELECT * FROM iterations ORDER BY created_at DESC').all() as any[]
  }

  // Resolve project names
  const projectIds = [...new Set(rows.map(r => r.project_id))]
  const projectMap: Record<string, string> = {}
  if (projectIds.length > 0) {
    const placeholders = projectIds.map(() => '?').join(',')
    const projects = db.prepare(`SELECT id, name FROM projects WHERE id IN (${placeholders})`).all(...projectIds) as any[]
    for (const p of projects) {
      projectMap[p.id] = p.name
    }
  }

  const iterations = rows.map(row => ({
    id: row.id,
    projectId: row.project_id,
    projectName: projectMap[row.project_id] || '未知项目',
    name: row.name,
    description: row.description || undefined,
    branch: row.branch,
    version: row.version,
    environment: row.environment,
    status: row.status,
    buildId: row.build_id || undefined,
    commitHash: row.commit_hash || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at || undefined,
    createdBy: row.created_by,
  }))

  res.json(iterations)
})

// POST /api/iterations
router.post('/', (req: Request, res: Response) => {
  const db = getDb()
  const { projectId, name, description, branch, version, environment } = req.body

  if (!projectId || !name || !branch || !version || !environment) {
    res.status(400).json({ error: '项目、名称、分支、版本、环境为必填项' })
    return
  }

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any
  if (!project) {
    res.status(404).json({ error: '项目不存在' })
    return
  }

  const id = generateId('iter')
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO iterations (id, project_id, name, description, branch, version, environment, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).run(id, projectId, name, description || '', branch, version, environment, '当前用户', now, now)

  const row = db.prepare('SELECT * FROM iterations WHERE id = ?').get(id) as any

  res.status(201).json({
    id: row.id,
    projectId: row.project_id,
    projectName: project.name,
    name: row.name,
    description: row.description || undefined,
    branch: row.branch,
    version: row.version,
    environment: row.environment,
    status: row.status,
    buildId: row.build_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  })
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

  const now = new Date().toISOString()
  db.prepare('UPDATE iterations SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?')
    .run('closed', now, now, req.params.id)

  const updated = db.prepare('SELECT * FROM iterations WHERE id = ?').get(req.params.id) as any
  res.json({
    id: updated.id,
    projectId: updated.project_id,
    name: updated.name,
    status: updated.status,
    closedAt: updated.closed_at,
    updatedAt: updated.updated_at,
  })
})

// DELETE /api/iterations/:id
router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM iterations WHERE id = ?').get(req.params.id)

  if (!existing) {
    res.status(404).json({ error: '迭代不存在' })
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

  const buildId = generateId('build')
  const now = new Date().toISOString()
  const projectId = iteration.project_id

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any

  const txn = db.transaction(() => {
    db.prepare(`
      INSERT INTO builds (id, project_id, iteration_id, environment, status, version, description, branch, start_time, trigger_by)
      VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)
    `).run(buildId, projectId, iteration.id, iteration.environment, iteration.version, `${iteration.environment} build`, iteration.branch, now, '当前用户')

    db.prepare('UPDATE iterations SET status = ?, build_id = ?, updated_at = ? WHERE id = ?')
      .run('building', buildId, now, iteration.id)
  })
  txn()

  // 入队后由 buildQueue 控制全局并发；真正执行时仍透传迭代上的 branch，
  // 确保 git clone 拉取用户选定的分支。
  enqueueBuildTask(buildId, db, () =>
    startBuild(buildId, project, db, {
      version: iteration.version,
      environment: iteration.environment,
      branch: iteration.branch,
    })
  )

  const build = db.prepare('SELECT * FROM builds WHERE id = ?').get(buildId) as any
  res.status(201).json(build)
})

export default router
