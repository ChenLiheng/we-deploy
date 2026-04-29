import axios from 'axios'
import type { GitAuthType } from '@/types'

const api = axios.create({
  baseURL: import.meta.env?.VITE_API_BASE_URL || '/api',
  timeout: 30000,
})

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

}

export const gitService = new GitService()
