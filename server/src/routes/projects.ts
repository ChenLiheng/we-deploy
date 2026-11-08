import { Router, Request, Response } from 'express'
import { getDb } from '../db/init.js'
import {
  createProject,
  deleteProject,
  findProjectById,
  listProjects,
  updateProject,
} from '../repositories/projectRepository.js'
import { toProjectResponse } from '../mappers/projectMapper.js'

const router = Router()

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`
}

// GET /api/projects
router.get('/', (_req: Request, res: Response) => {
  const db = getDb()
  res.json(listProjects(db).map(toProjectResponse))
})

// GET /api/projects/:id
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb()
  const row = findProjectById(db, req.params.id)

  if (!row) {
    res.status(404).json({ error: '项目不存在' })
    return
  }

  res.json(toProjectResponse(row))
})

// POST /api/projects
router.post('/', (req: Request, res: Response) => {
  const db = getDb()
  const { name, description, appId, repoUrl, branch, authType, authToken, environments, projectPath, sshKeyPath } = req.body

  if (!name || !appId || !repoUrl) {
    res.status(400).json({ error: '名称、AppID、仓库地址为必填项' })
    return
  }

  const row = createProject(db, {
    id: generateId('proj'),
    name,
    description,
    appId,
    repoUrl,
    branch,
    authType,
    authToken,
    environments,
    projectPath,
    sshKeyPath,
    now: new Date().toISOString(),
  })

  res.status(201).json(toProjectResponse(row))
})

// PUT /api/projects/:id
router.put('/:id', (req: Request, res: Response) => {
  const db = getDb()
  const existing = findProjectById(db, req.params.id)

  if (!existing) {
    res.status(404).json({ error: '项目不存在' })
    return
  }

  const {
    name,
    description,
    appId,
    repoUrl,
    branch,
    authType,
    authToken,
    environments,
    projectPath,
    sshKeyPath,
  } = req.body || {}
  if (name !== undefined && !String(name).trim()) {
    res.status(400).json({ error: '项目名称不能为空' })
    return
  }
  const row = updateProject(db, req.params.id, existing, {
    name,
    description,
    appId,
    repoUrl,
    branch,
    authType,
    authToken,
    environments,
    projectPath,
    sshKeyPath,
    now: new Date().toISOString(),
  })

  res.json(toProjectResponse(row))
})

// DELETE /api/projects/:id
router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb()
  const existing = findProjectById(db, req.params.id)

  if (!existing) {
    res.status(404).json({ error: '项目不存在' })
    return
  }

  deleteProject(db, req.params.id)
  res.status(204).send()
})

export default router
