import { simpleGit } from 'simple-git'
import fs from 'fs'

/**
 * Git 凭证 / SSH 工具集
 *
 * 设计目标：
 * 1. 让 Token 认证真正生效（按平台采用对应的 Basic Auth 用户名）。
 * 2. 禁止 git CLI 在子进程里弹出/等待终端凭证输入，避免 "需要输入密码" 这类
 *    交互卡住或回退到匿名访问。
 * 3. 对外日志/错误信息脱敏，避免 token 通过 build_logs / API 响应外泄。
 */

type GitProvider = 'github' | 'gitlab' | 'bitbucket' | 'coding' | 'gitea' | 'generic'

/**
 * 根据 host 推断 git 服务商。识别不出来时返回 'generic'，
 * generic 默认采用 GitLab 风格的 oauth2:<token> 凭证（最广泛兼容）。
 */
function detectGitProvider(hostname: string): GitProvider {
  const host = hostname.toLowerCase()
  if (host === 'github.com' || host.endsWith('.github.com')) return 'github'
  if (host === 'gitlab.com' || host.includes('gitlab')) return 'gitlab'
  if (host === 'bitbucket.org' || host.includes('bitbucket')) return 'bitbucket'
  if (host.endsWith('coding.net')) return 'coding'
  if (host.includes('gitea')) return 'gitea'
  return 'generic'
}

/**
 * 把 AccessToken 注入 HTTPS 仓库地址，按平台采用对应的 Basic Auth 用户名：
 * - GitHub PAT:    https://<token>@github.com/...
 * - GitLab PAT:    https://oauth2:<token>@gitlab.com/...
 * - Bitbucket APP: https://x-token-auth:<token>@bitbucket.org/...
 * - Gitea / Coding / 其它自建：默认采用 oauth2:<token>，兼容性最好
 *
 * 仅处理 http / https 协议；ssh:// 或 git@host:owner/repo 形式原样返回。
 *
 * 注意：URL setter 自身会做 percent-encode，这里不要再用 encodeURIComponent，
 * 否则含 `%`/`+`/`/` 的 token 会被双重编码导致认证失败。
 */
export function buildAuthenticatedRepoUrl(repoUrl: string, authToken?: string): string {
  if (!authToken) return repoUrl

  let url: URL
  try {
    url = new URL(repoUrl)
  } catch {
    return repoUrl
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return repoUrl
  }

  const provider = detectGitProvider(url.hostname)
  if (provider === 'github') {
    url.username = authToken
    url.password = ''
  } else if (provider === 'bitbucket') {
    url.username = 'x-token-auth'
    url.password = authToken
  } else {
    url.username = 'oauth2'
    url.password = authToken
  }
  return url.toString()
}

/**
 * 创建一个禁用所有终端 / askpass 凭证提示的 simple-git 实例：
 * - GIT_TERMINAL_PROMPT=0 关闭 git 自身的命令行提示
 * - GIT_ASKPASS / SSH_ASKPASS=echo 关闭图形化弹窗
 *
 * 这样一旦凭证错误，会直接 fail-fast 报错，而不是悬挂等待用户输入密码。
 *
 * 可选传入 sshKeyPath，当文件存在时为 SSH 链路注入 GIT_SSH_COMMAND。
 */
export function createGitClient(sshKeyPath?: string): ReturnType<typeof simpleGit> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: 'echo',
    SSH_ASKPASS: 'echo',
  }
  if (sshKeyPath && fs.existsSync(sshKeyPath)) {
    env.GIT_SSH_COMMAND = `ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no -o BatchMode=yes`
  }
  return simpleGit({ env } as any)
}

/**
 * 把 URL 中的凭证脱敏，避免 token 通过日志或错误响应泄露：
 *   https://oauth2:abc123@host/path  →  https://***:***@host/path
 *   https://ghp_xxx@github.com/...   →  https://***@github.com/...
 */
export function redactCredentials(text: string): string {
  if (!text) return text
  return text.replace(
    /(https?:\/\/)([^:@\s/]+)(?::([^@\s/]+))?@/gi,
    (_match, scheme, _user, pass) => `${scheme}${pass ? '***:***@' : '***@'}`
  )
}
