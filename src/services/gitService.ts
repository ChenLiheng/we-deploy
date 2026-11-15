import api from './serverApi'
import type { GitAuthType } from '@/types'

export interface BranchResult {
  branches: string[]
  error?: string
}

/**
 * Git 相关接口。统一走带鉴权的 serverApi：之前这里单独创建了一个不带 Authorization
 * 的 axios 实例，请求必然 401，又在失败时返回写死的假分支列表，导致用户可能选中
 * 并不存在的分支去构建。
 */
export const gitService = {
  async fetchBranches(params: {
    repoUrl: string
    authType: GitAuthType
    projectId?: string
  }): Promise<BranchResult> {
    const { data } = await api.post('/git/branches', params, { timeout: 60000 })
    return { branches: data.branches || [], error: data.error }
  },
}
