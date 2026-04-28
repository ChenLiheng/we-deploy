import axios from 'axios'
import type { GitAuthType, BuildLog } from '@/types'

const api = axios.create({
  baseURL: import.meta.env?.VITE_API_BASE_URL || '/api',
  timeout: 30000,
})

export interface GitCloneOptions {
  repoUrl: string
  branch: string
  authType: GitAuthType
  authToken?: string
  sshKeyPath?: string
  destPath: string
  onLog?: (log: Omit<BuildLog, 'id' | 'timestamp'>) => void
}

export interface GitRepoInfo {
  url: string
  branch: string
  lastCommit: {
    hash: string
    message: string
    author: string
    date: string
  } | null
}

class GitService {
  async testConnection(
    repoUrl: string,
    authType: GitAuthType,
    authToken?: string,
  ): Promise<boolean> {
    try {
      const response = await api.post('/git/test-connection', { repoUrl, authType, authToken })
      return response.data.success
    } catch {
      console.error('Git connection test failed')
      return false
    }
  }

  async fetchBranches(
    repoUrl: string,
    authType: GitAuthType,
    authToken?: string,
    projectId?: string,
  ): Promise<string[]> {
    try {
      const response = await api.post('/git/branches', { repoUrl, authType, authToken, projectId })
      return response.data.branches || []
    } catch {
      return ['main', 'develop', 'feature/test', 'release/v1.0']
    }
  }

  async clone(options: GitCloneOptions): Promise<string> {
    const { onLog, ...params } = options
    onLog?.({
      level: 'info',
      message: `\u{1F4E6} 正在克隆仓库: ${options.repoUrl}`,
      source: 'git',
    })
    const response = await api.post('/git/clone', params)
    onLog?.({ level: 'success', message: '\u2705 代码克隆成功', source: 'git' })
    return response.data.destPath
  }

  async getLatestCommit(repoPath: string): Promise<GitRepoInfo['lastCommit']> {
    try {
      const response = await api.get(`/git/commit?repoPath=${encodeURIComponent(repoPath)}`)
      return response.data
    } catch {
      return null
    }
  }
}

export const gitService = new GitService()
