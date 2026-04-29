import { Router, Request, Response } from 'express'
import { simpleGit } from 'simple-git'
import { getDb } from '../db/init.js'
import {
  buildAuthenticatedRepoUrl,
  createGitClient,
  redactCredentials,
} from '../utils/gitAuth.js'
import { decryptSecret } from '../utils/secretVault.js'

const router = Router()

/**
 * 兼容原有调用：构造禁用终端凭证提示的 simple-git 实例。
 * 内部统一委托给 createGitClient（关闭 GIT_TERMINAL_PROMPT / askpass）。
 */
function gitWithOpts(sshKeyPath?: string): ReturnType<typeof simpleGit> {
  return createGitClient(sshKeyPath)
}

/**
 * 兼容原有调用：把 token 注入 HTTPS 仓库地址。
 * 内部委托给 buildAuthenticatedRepoUrl，按平台采用正确的 Basic Auth 写法，
 * 修复了原实现仅兼容 GitHub PAT、且对 token 双重 URL 编码的问题。
 */
function buildRepoUrl(repoUrl: string, authToken?: string): string {
  return buildAuthenticatedRepoUrl(repoUrl, authToken)
}

/**
 * 优先使用请求体中的 token；当只传了 projectId 时，从 DB 查出已保存的 token。
 * 这样前端在 "token 已保存" 的状态下点击「测试连接」可以不用重复输入。
 */
function getToken(req: Request): string {
  const { authToken: bodyToken, projectId } = req.body
  if (bodyToken) return bodyToken
  if (projectId) {
    const project = getDb()
      .prepare('SELECT auth_token FROM projects WHERE id = ?')
      .get(projectId) as any
    return decryptSecret(project?.auth_token || '')
  }
  return ''
}

// POST /api/git/test-connection
router.post('/test-connection', async (req: Request, res: Response) => {
  const { repoUrl, authType, sshKeyPath } = req.body

  if (!repoUrl) {
    res.status(400).json({ success: false, error: '仓库地址不能为空' })
    return
  }

  try {
    if (authType === 'ssh') {
      await gitWithOpts(sshKeyPath).listRemote([repoUrl])
    } else {
      const token = getToken(req)
      const url = buildRepoUrl(repoUrl, token)
      await gitWithOpts().listRemote([url])
    }
    res.json({ success: true })
  } catch (err: any) {
    const message = redactCredentials(String(err?.message || err)).replace(/^fatal:\s*/, '')
    res.json({ success: false, error: message })
  }
})

// POST /api/git/branches
router.post('/branches', async (req: Request, res: Response) => {
  const { repoUrl, authType, sshKeyPath } = req.body

  if (!repoUrl) {
    res.status(400).json({ error: '仓库地址不能为空' })
    return
  }

  try {
    let url = repoUrl
    if (authType !== 'ssh') {
      const token = getToken(req)
      url = buildRepoUrl(repoUrl, token)
    }
    const result = await gitWithOpts(authType === 'ssh' ? sshKeyPath : undefined)
      .listRemote(['--heads', url])
    const branches = result
      .split('\n')
      .filter(Boolean)
      .map((line: string) => {
        const ref = line.split('\t')[1] || ''
        return ref.replace('refs/heads/', '')
      })
    res.json({ branches })
  } catch {
    res.json({ branches: [] })
  }
})

export default router
