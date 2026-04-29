export interface ProjectRow {
  id: string
  name: string
  description?: string
  app_id: string
  repo_url: string
  branch: string
  auth_type: string
  auth_token: string
  ssh_key_path?: string
  project_path?: string
  environments: string
  created_at: string
  updated_at: string
}

export function parseProjectEnvironments(raw: string): Record<string, any> {
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return {}
  }
}

export function toProjectResponse(row: ProjectRow) {
  const environments = parseProjectEnvironments(row.environments)
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
