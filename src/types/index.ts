export type EnvironmentType = 'dev' | 'prod'
export type IterationStatus = 'active' | 'building' | 'closed'
export type BuildStatus =
  | 'pending'
  | 'queued'
  | 'cloning'
  | 'installing'
  | 'building'
  | 'uploading'
  | 'success'
  | 'failed'
export type GitAuthType = 'token' | 'ssh'

export interface ProjectConfig {
  id: string
  name: string
  description?: string
  appId: string
  repoUrl: string
  branch: string
  authType: GitAuthType
  authToken?: string
  hasAuthToken?: boolean
  hasPrivateKey?: boolean
  sshKeyPath?: string
  projectPath?: string
  environments: {
    private_key?: string
    /**
     * 自定义安装依赖命令（如 'pnpm install --frozen-lockfile' / 'yarn install'）。
     * 留空时平台默认用 npm + --legacy-peer-deps 兼容老式 peer deps 项目。
     */
    installCommand?: string
    /**
     * 编译命令（如 'npm run build:weapp'）。
     * 编译型小程序框架（Taro/uni-app/Vue3）必填，原生小程序留空即可。
     */
    buildCommand?: string
    /**
     * 小程序代码根目录（即 project.config.json 所在目录），相对仓库根。
     * Taro 通常是 'dist/weapp'；原生小程序留空表示就是仓库根。
     */
    miniprogramRoot?: string
    /** 是否调用 miniprogram-ci.packNpm 构建小程序 npm，默认否 */
    npmBuild?: boolean
  } & Record<EnvironmentType, EnvironmentConfig>
  createdAt: string
  updatedAt: string
}

export interface EnvironmentConfig {
  appId?: string
  appSecret?: string
  buildPath?: string
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
  customEnv?: Record<string, string>
}

export interface Iteration {
  id: string
  projectId: string
  projectName: string
  name: string
  description?: string
  branch: string
  version: string
  environment: EnvironmentType
  status: IterationStatus
  buildId?: string
  commitHash?: string
  createdAt: string
  updatedAt: string
  closedAt?: string
  createdBy: string
}

export interface CreateIterationParams {
  projectId: string
  name: string
  description?: string
  branch: string
  version: string
  environment: EnvironmentType
}

export interface BuildRecord {
  id: string
  projectId: string
  environment: EnvironmentType
  status: BuildStatus
  version: string
  desc?: string
  qrcodeUrl?: string
  commitHash?: string
  branch: string
  logs: BuildLog[]
  startTime: string
  endTime?: string
  error?: string
  triggerBy: string
}

export interface BuildLog {
  id: string
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
  source?: string
}

export interface UploadOptions {
  version: string
  desc?: string
  robot?: number
}

export interface PreviewOptions {
  version: string
  desc?: string
}
