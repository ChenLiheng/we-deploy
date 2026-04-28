import axios from 'axios'
import dayjs from 'dayjs'
import type { EnvironmentType, BuildLog, UploadOptions } from '@/types'

const api = axios.create({
  baseURL: import.meta.env?.VITE_API_BASE_URL || '/api',
  timeout: 120000,
})

export interface BuildConfig {
  appId: string
  projectPath: string
  type: 'miniProgram' | 'miniProgramPlugin'
  env: EnvironmentType
  robot?: number
  setting?: {
    es6?: boolean
    es7?: boolean
    minifyJS?: boolean
    minifyWXML?: boolean
    minifyWXSS?: boolean
    autoPush?: boolean
    minify?: boolean
    codeProtect?: boolean
  }
  onLog?: (log: Omit<BuildLog, 'id' | 'timestamp'>) => void
}

export interface UploadResult {
  version: string
  desc?: string
  success: boolean
  error?: string
}

export interface PreviewResult {
  qrcodeUrl?: string
  success: boolean
  error?: string
}

export interface SourceMapDownloadResult {
  success: boolean
  localPath?: string
  error?: string
}

class WeChatCIEngine {
  async initializeProject(config: BuildConfig): Promise<void> {
    const { onLog } = config
    onLog?.({
      level: 'info',
      message: `\u{1F527} 初始化微信 CI 项目 (AppID: ${config.appId})`,
      source: 'ci',
    })
    await api.post('/ci/init', {
      appId: config.appId,
      projectPath: config.projectPath,
      type: config.type,
    })
    onLog?.({ level: 'success', message: '\u2705 微信 CI 项目初始化成功', source: 'ci' })
  }

  async upload(config: BuildConfig & UploadOptions): Promise<UploadResult> {
    const { onLog, version, desc, robot } = config
    try {
      onLog?.({
        level: 'info',
        message: `\u{1F4E4} 正在上传代码 (${config.env.toUpperCase()} 环境)...`,
        source: 'ci',
      })
      onLog?.({ level: 'info', message: `版本号: ${version}`, source: 'ci' })
      if (desc) onLog?.({ level: 'info', message: `备注: ${desc}`, source: 'ci' })

      await api.post('/ci/upload', {
        appId: config.appId,
        projectPath: config.projectPath,
        type: config.type,
        env: config.env,
        version,
        desc: desc || `${config.env} environment build`,
        robot: robot || 1,
        setting: config.setting,
      })
      onLog?.({ level: 'success', message: '\u2705 上传成功', source: 'ci' })
      return { version, desc, success: true }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '未知错误'
      onLog?.({ level: 'error', message: `\u274C 上传失败: ${errMsg}`, source: 'ci' })
      return { version, desc, success: false, error: errMsg }
    }
  }

  generateVersion(env: EnvironmentType, baseVersion?: string): string {
    const version = baseVersion || '1.0.0'
    if (env === 'dev') return `${version}-dev-${dayjs().format('YYYYMMDDHHmmss')}`
    return version
  }
}

export const wechatCIEngine = new WeChatCIEngine()
