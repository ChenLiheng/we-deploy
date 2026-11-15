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
export type BuildKind = 'upload' | 'preview'
export type GitAuthType = 'token' | 'ssh'

export interface EnvironmentConfig {
  robot?: number
  setting?: {
    es6?: boolean
    es7?: boolean
    minify?: boolean
    minifyJS?: boolean
    minifyWXML?: boolean
    minifyWXSS?: boolean
    codeProtect?: boolean
  }
}

export interface ProjectEnvironments {
  private_key?: string
  /** 自定义安装依赖命令，留空默认 npm install --legacy-peer-deps */
  installCommand?: string
  /** 编译型框架（Taro / uni-app）的编译命令，例如 npm run build:weapp */
  buildCommand?: string
  /** 包含 project.config.json 的目录（相对仓库根），例如 dist/weapp */
  miniprogramRoot?: string
  /** 是否执行 miniprogram-ci packNpm */
  npmBuild?: boolean
  dev?: EnvironmentConfig
  prod?: EnvironmentConfig
}

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
  environments: ProjectEnvironments
  createdAt: string
  updatedAt: string
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
  lastBuildStatus?: BuildStatus
  lastBuildStart?: string
  lastBuildEnd?: string
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
  iterationId?: string
  kind: BuildKind
  sourceBuildId?: string
  environment: EnvironmentType
  status: BuildStatus
  version: string
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

export interface SystemSettings {
  maxConcurrentBuilds: string
  notifyOnSuccess: string
  notifyOnFailure: string
  webhookUrl: string
}

export interface SystemInfo {
  logRetentionDays: number
  sandboxBase: string
  qrcodeBase: string
  concurrencyFromEnv: number | null
  queue: { activeCount: number; queuedCount: number }
  nodeVersion: string
}
