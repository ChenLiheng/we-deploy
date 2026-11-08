import type Database from 'better-sqlite3'
import { encryptSecret } from '../utils/secretVault.js'
import { parseProjectEnvironments } from '../mappers/projectMapper.js'
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
  sshKeyPath?: string
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
  sshKeyPath?: string
  now: string
}

function isPlainObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** 深合并 environments；值为 undefined 的字段保留旧值，null / '' 视为显式清空 */
export function mergeEnvironments(base: Record<string, any>, patch: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = { ...base }
  if (!isPlainObject(patch)) return result
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeEnvironments(result[key], value)
    } else if (value === null) {
      delete result[key]
    } else {
      result[key] = value
    }
  }
  return result
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
    INSERT INTO projects (id, name, description, app_id, repo_url, branch, auth_type, auth_token, ssh_key_path, project_path, environments, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    input.name,
    input.description || '',
    input.appId,
    input.repoUrl,
    input.branch || 'main',
    input.authType || 'token',
    encryptSecret(input.authToken || ''),
    input.sshKeyPath || '',
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
  if (input.sshKeyPath !== undefined) updates.ssh_key_path = input.sshKeyPath
  if (input.environments !== undefined) {
    // 与已有配置做合并而不是整体替换：前端只提交部分字段（或旧客户端缺字段）时，
    // 不会把 buildCommand / miniprogramRoot / robot 等未提交的配置清空。
    updates.environments = encryptEnvironmentSecrets(
      mergeEnvironments(parseProjectEnvironments(existing.environments), input.environments),
      existing.environments
    )
  }

  const setClauses = Object.keys(updates).map((key) => `${key} = ?`).join(', ')
  const values = Object.values(updates)

  db.prepare(`UPDATE projects SET ${setClauses} WHERE id = ?`).run(...values, id)
  return findProjectById(db, id)!
}

export function deleteProject(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
}
