import { Router, Request, Response } from 'express'
import { getDb } from '../db/init.js'
import { encryptSecret } from '../utils/secretVault.js'

const router = Router()

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`
}

const DEFAULT_ENVIRONMENTS = JSON.stringify({
  dev: { robot: 1, setting: { es6: true, es7: true, minify: false } },
  prod: { robot: 2, setting: { es6: true, es7: true, minify: true } },
})

function parseEnvironments(raw: string): Record<string, any> {
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return {}
  }
}

function encryptEnvironmentSecrets(environments: any, existingRaw?: string): string {
  const next = { ...(environments || {}) }
  const existing = parseEnvironments(existingRaw || '{}')

  if (next.private_key) {
    next.private_key = encryptSecret(next.private_key)
  } else if (existing.private_key) {
    next.private_key = existing.private_key
  } else {
    delete next.private_key
  }

  for (const envName of ['dev', 'prod']) {
    if (next[envName]?.private_key) {
      next[envName] = {
        ...next[envName],
        private_key: encryptSecret(next[envName].private_key),
      }
    } else if (existing[envName]?.private_key) {
      next[envName] = {
        ...(next[envName] || {}),
        private_key: existing[envName].private_key,
      }
    }
  }

  return JSON.stringify(next)
}

function toProjectResponse(row: any) {
  const environments = parseEnvironments(row.environments)
  const hasPrivateKey = !!(
    environments.private_key ||
    environments.dev?.private_key ||
    environments.prod?.private_key
  )
  delete environments.private_key
  if (environments.dev) delete environments.dev.private_key
  if (environments.prod) delete environments.prod.private_key

  return {
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
    hasPrivateKey,
    environments,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// GET /api/projects
router.get('/', (_req: Request, res: Response) => {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as any[]

  const projects = rows.map(toProjectResponse)

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

  res.json(toProjectResponse(row))
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
  const envs = environments ? encryptEnvironmentSecrets(environments) : DEFAULT_ENVIRONMENTS

  db.prepare(`
    INSERT INTO projects (id, name, description, app_id, repo_url, branch, auth_type, auth_token, project_path, environments, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, description || '', appId, repoUrl, branch || 'main', authType || 'token', encryptSecret(authToken || ''), projectPath || '', envs, now, now)

  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any

  res.status(201).json(toProjectResponse(row))
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
  if (authToken !== undefined) updates.auth_token = encryptSecret(authToken)
  if (projectPath !== undefined) updates.project_path = projectPath
  if (environments !== undefined) updates.environments = encryptEnvironmentSecrets(environments, (existing as any).environments)

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ')
  const values = Object.values(updates)

  db.prepare(`UPDATE projects SET ${setClauses} WHERE id = ?`).run(...values, req.params.id)

  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any

  res.json(toProjectResponse(row))
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
