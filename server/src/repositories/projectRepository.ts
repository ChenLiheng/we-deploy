import type Database from 'better-sqlite3'
import { encryptSecret } from '../utils/secretVault.js'
import {
  DEFAULT_ENVIRONMENTS,
  encryptEnvironmentSecrets,
  type ProjectRow,
} from '../services/projectSecrets.js'

export interface CreateProjectInput {
  id: string
  name: string
  description?: string
  appId: string
  repoUrl: string
  branch?: string
  authType?: string
  authToken?: string
  environments?: any
  projectPath?: string
  now: string
}

export interface UpdateProjectInput {
  name?: string
  description?: string
  appId?: string
  repoUrl?: string
  branch?: string
  authType?: string
  authToken?: string
  environments?: any
  projectPath?: string
  now: string
}

export function listProjects(db: Database.Database): ProjectRow[] {
  return db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as ProjectRow[]
}

export function findProjectById(db: Database.Database, id: string): ProjectRow | undefined {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
}

export function createProject(db: Database.Database, input: CreateProjectInput): ProjectRow {
  const envs = input.environments
    ? encryptEnvironmentSecrets(input.environments)
    : DEFAULT_ENVIRONMENTS

  db.prepare(`
    INSERT INTO projects (id, name, description, app_id, repo_url, branch, auth_type, auth_token, project_path, environments, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    input.name,
    input.description || '',
    input.appId,
    input.repoUrl,
    input.branch || 'main',
    input.authType || 'token',
    encryptSecret(input.authToken || ''),
    input.projectPath || '',
    envs,
    input.now,
    input.now
  )

  return findProjectById(db, input.id)!
}

export function updateProject(
  db: Database.Database,
  id: string,
  existing: ProjectRow,
  input: UpdateProjectInput
): ProjectRow {
  const updates: Record<string, any> = { updated_at: input.now }
  if (input.name !== undefined) updates.name = input.name
  if (input.description !== undefined) updates.description = input.description
  if (input.appId !== undefined) updates.app_id = input.appId
  if (input.repoUrl !== undefined) updates.repo_url = input.repoUrl
  if (input.branch !== undefined) updates.branch = input.branch
  if (input.authType !== undefined) updates.auth_type = input.authType
  if (input.authToken !== undefined) updates.auth_token = encryptSecret(input.authToken)
  if (input.projectPath !== undefined) updates.project_path = input.projectPath
  if (input.environments !== undefined) {
    updates.environments = encryptEnvironmentSecrets(input.environments, existing.environments)
  }

  const setClauses = Object.keys(updates).map((key) => `${key} = ?`).join(', ')
  const values = Object.values(updates)

  db.prepare(`UPDATE projects SET ${setClauses} WHERE id = ?`).run(...values, id)
  return findProjectById(db, id)!
}

export function deleteProject(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
}
