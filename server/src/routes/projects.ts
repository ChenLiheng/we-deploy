import { Router, Request, Response } from 'express'
import { getDb } from '../db/init.js'

const router = Router()

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`
}

const DEFAULT_ENVIRONMENTS = JSON.stringify({
  dev: { robot: 1, setting: { es6: true, es7: true, minify: false } },
  prod: { robot: 2, setting: { es6: true, es7: true, minify: true } },
})

// GET /api/projects
router.get('/', (_req: Request, res: Response) => {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as any[]

  const projects = rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    appId: row.app_id,
    repoUrl: row.repo_url,
    branch: row.branch,
    authType: row.auth_type,
    hasAuthToken: !!row.auth_token,
    sshKeyPath: row.ssh_key_path || undefined,
    projectPath: row.project_path || undefined,
    environments: JSON.parse(row.environments || '{}'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  res.json(projects)
})

// GET /api/projects/:id
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb()
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any

  if (!row) {
    res.status(404).json({ error: '项目不存在' })
    return
  }

  res.json({
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    appId: row.app_id,
    repoUrl: row.repo_url,
    branch: row.branch,
    authType: row.auth_type,
    hasAuthToken: !!row.auth_token,
    sshKeyPath: row.ssh_key_path || undefined,
    projectPath: row.project_path || undefined,
    environments: JSON.parse(row.environments || '{}'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
})

// POST /api/projects
router.post('/', (req: Request, res: Response) => {
  const db = getDb()
  const { name, description, appId, repoUrl, branch, authType, authToken, environments, projectPath } = req.body

  if (!name || !appId || !repoUrl) {
    res.status(400).json({ error: '名称、AppID、仓库地址为必填项' })
    return
  }

  const id = generateId('proj')
  const now = new Date().toISOString()
  const envs = environments ? JSON.stringify(environments) : DEFAULT_ENVIRONMENTS

  db.prepare(`
    INSERT INTO projects (id, name, description, app_id, repo_url, branch, auth_type, auth_token, project_path, environments, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, description || '', appId, repoUrl, branch || 'main', authType || 'token', authToken || '', projectPath || '', envs, now, now)

  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any

  res.status(201).json({
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    appId: row.app_id,
    repoUrl: row.repo_url,
    branch: row.branch,
    authType: row.auth_type,
    hasAuthToken: !!row.auth_token,
    environments: JSON.parse(row.environments || '{}'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
})

// PUT /api/projects/:id
router.put('/:id', (req: Request, res: Response) => {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)

  if (!existing) {
    res.status(404).json({ error: '项目不存在' })
    return
  }

  const { name, description, appId, repoUrl, branch, authType, authToken, environments, projectPath } = req.body
  const now = new Date().toISOString()

  const updates: Record<string, any> = { updated_at: now }
  if (name !== undefined) updates.name = name
  if (description !== undefined) updates.description = description
  if (appId !== undefined) updates.app_id = appId
  if (repoUrl !== undefined) updates.repo_url = repoUrl
  if (branch !== undefined) updates.branch = branch
  if (authType !== undefined) updates.auth_type = authType
  if (authToken !== undefined) updates.auth_token = authToken
  if (projectPath !== undefined) updates.project_path = projectPath
  if (environments !== undefined) updates.environments = JSON.stringify(environments)

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ')
  const values = Object.values(updates)

  db.prepare(`UPDATE projects SET ${setClauses} WHERE id = ?`).run(...values, req.params.id)

  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any

  res.json({
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    appId: row.app_id,
    repoUrl: row.repo_url,
    branch: row.branch,
    authType: row.auth_type,
    hasAuthToken: !!row.auth_token,
    environments: JSON.parse(row.environments || '{}'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
})

// DELETE /api/projects/:id
router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)

  if (!existing) {
    res.status(404).json({ error: '项目不存在' })
    return
  }

  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id)
  res.status(204).send()
})

export default router
