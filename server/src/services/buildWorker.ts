import type Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import {
  buildAuthenticatedRepoUrl,
  createGitClient,
  redactCredentials,
} from '../utils/gitAuth.js'

/**
 * sandbox 根目录：所有 git clone 出来的临时代码、二维码图片都放在这里。
 * 部署到 Linux 服务器时建议通过环境变量挂到独立卷，避免占满系统盘 /tmp。
 */
const SANDBOX_BASE = process.env.SANDBOX_BASE || '/tmp/we-deploy/builds'
const QRCODE_BASE = process.env.QRCODE_BASE || '/tmp/we-deploy/qrcodes'

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`
}

interface ProjectRow {
  id: string
  name: string
  app_id: string
  repo_url: string
  branch: string
  auth_type: string
  auth_token: string
  ssh_key_path?: string
  project_path: string
  environments: string
}

/**
 * 项目级 environments JSON 解析后的形状。
 * 这些字段是直接 JSON.stringify 进 environments 的，schema 里 environments 是 TEXT，
 * 所以新增字段不需要数据库迁移。
 */
interface EnvironmentsConfig {
  /** 微信 CI 私钥（dev/prod 共用，也允许在子环境里再次覆盖） */
  private_key?: string
  /**
   * 自定义安装依赖的命令。留空时使用平台默认（npm ci/install + --legacy-peer-deps）。
   * 适用场景：
   *  - 项目使用 pnpm/yarn：填 'pnpm install --frozen-lockfile' 或 'yarn install --frozen-lockfile'
   *  - 需要更激进的兼容：'npm install --force'
   *  - 想跳过装包：'true'（shell 内置，立即返回成功）
   */
  installCommand?: string
  /**
   * 编译型框架（Taro / uni-app / Vue3 等）必填：执行框架自身的编译命令，
   * 例如 'npm run build:weapp'。原生小程序留空。
   */
  buildCommand?: string
  /**
   * 编译产物所在的相对目录（相对于 git 仓库根），即包含 project.config.json 的小程序根目录，
   * 例如 'dist/weapp'。原生小程序留空表示就是仓库根。
   */
  miniprogramRoot?: string
  /**
   * 是否调用 miniprogram-ci.packNpm 构建小程序的 miniprogram_npm（用了 npm 包时需要）。
   */
  npmBuild?: boolean
  dev?: EnvironmentEntry
  prod?: EnvironmentEntry
}

interface EnvironmentEntry {
  private_key?: string
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

function logInfo(db: Database.Database, buildId: string, msg: string, src: string) {
  db.prepare('INSERT INTO build_logs (id, build_id, timestamp, level, message, source) VALUES (?, ?, ?, ?, ?, ?)')
    .run(generateId('log'), buildId, Date.now(), 'info', msg, src)
}

function logSuccess(db: Database.Database, buildId: string, msg: string, src: string) {
  db.prepare('INSERT INTO build_logs (id, build_id, timestamp, level, message, source) VALUES (?, ?, ?, ?, ?, ?)')
    .run(generateId('log'), buildId, Date.now(), 'success', msg, src)
}

function logWarn(db: Database.Database, buildId: string, msg: string, src: string) {
  db.prepare('INSERT INTO build_logs (id, build_id, timestamp, level, message, source) VALUES (?, ?, ?, ?, ?, ?)')
    .run(generateId('log'), buildId, Date.now(), 'warn', msg, src)
}

function logError(db: Database.Database, buildId: string, msg: string, src: string) {
  db.prepare('INSERT INTO build_logs (id, build_id, timestamp, level, message, source) VALUES (?, ?, ?, ?, ?, ?)')
    .run(generateId('log'), buildId, Date.now(), 'error', msg, src)
}

/**
 * 决定本次 clone 使用哪个分支：
 * 优先级：调用方传入（迭代 / 构建记录配置的分支） > 项目默认分支 > 'main'
 */
function resolveBranch(project: ProjectRow, branch?: string): string {
  const trimmed = branch?.trim()
  if (trimmed) return trimmed
  if (project.branch) return project.branch
  return 'main'
}

/**
 * prepareCode 的返回结构。
 * - codeRoot：git clone（或用户本地）后代码所在的"仓库根"目录
 * - sandboxRoot：本次构建创建的、需要在 finally 里被清理的临时目录；
 *   当使用用户配置的本地项目路径时为 null（不可清理）。
 */
interface PreparedCode {
  codeRoot: string
  sandboxRoot: string | null
}

async function prepareCode(
  project: ProjectRow,
  buildId: string,
  db: Database.Database,
  branch?: string
): Promise<PreparedCode> {
  // 1. 优先使用本地项目路径（保留原有逻辑）；这种情况下不创建 sandbox，也禁止清理
  if (project.project_path && fs.existsSync(project.project_path)) {
    logInfo(db, buildId, `使用本地项目路径: ${project.project_path}`, 'git')
    return { codeRoot: project.project_path, sandboxRoot: null }
  }

  if (!project.repo_url) {
    throw new Error('未配置 Git 仓库地址和本地项目路径')
  }

  const sandboxRoot = path.join(SANDBOX_BASE, project.id, buildId)
  fs.mkdirSync(sandboxRoot, { recursive: true })

  // 2. 根据项目配置的认证方式构造可携带凭证的 clone URL：
  //    - token 认证：将 auth_token 注入 https URL（按平台采用对应的 Basic Auth 用户名）
  //    - ssh 认证：保持原 URL，由 GIT_SSH_COMMAND 指定的私钥完成认证
  const isSsh = project.auth_type === 'ssh'
  const cloneUrl = isSsh
    ? project.repo_url
    : buildAuthenticatedRepoUrl(project.repo_url, project.auth_token)

  // 3. 解析最终分支：优先使用调用方传入的 branch（迭代/构建记录），否则回退到项目默认 branch
  const targetBranch = resolveBranch(project, branch)

  // 4. 日志中的 URL 必须脱敏，避免 token 通过 build_logs 泄露给前端
  logInfo(
    db,
    buildId,
    `正在克隆仓库: ${redactCredentials(project.repo_url)} (分支: ${targetBranch})`,
    'git'
  )

  try {
    // 5. 使用关闭终端凭证提示的 git client，凭证错误时 fail-fast
    const client = createGitClient(isSsh ? project.ssh_key_path : undefined)
    await client.clone(cloneUrl, sandboxRoot, ['--branch', targetBranch, '--depth', '1'])
    logSuccess(db, buildId, '代码克隆成功', 'git')
    return { codeRoot: sandboxRoot, sandboxRoot }
  } catch (err: any) {
    // 6. clone 失败也要清掉刚刚 mkdirSync 出来的空目录，避免遗留
    safeRemoveDir(sandboxRoot)
    const message = redactCredentials(String(err?.message || err))
    throw new Error(`Git 克隆失败 (分支 ${targetBranch}): ${message}`)
  }
}

/**
 * 流式执行子进程。
 *
 * 解决两个老问题：
 * 1. 之前用 execSync 是同步阻塞调用，会卡住整个 Node event loop，
 *    导致前端轮询 GET /api/builds/:id/logs 在长任务期间频繁超时。
 *    换成 spawn 后主线程不再阻塞，HTTP 接口实时响应。
 * 2. 之前只在命令结束后把 stdout 整段拿来截断 20-30 行，过程日志丢失。
 *    现在监听 'data' 事件按行实时写入 build_logs，前端轮询能立即看到进度。
 *
 * 设计要点：
 * - shell:true 让 'npm run build:weapp' 这种带空格命令直接生效，免去手工解析 argv
 * - stderr 不全是错误：npm 的 warning、webpack 进度信息也走 stderr，所以默认按
 *   info 级别记录，仅在最终 exitCode != 0 时把上下文标记为失败
 * - 每行一次 INSERT，但 SQLite 单行写入 < 1ms，常规构建每秒几十到几百行无压力；
 *   若行非常长（webpack 错误栈）也照写，便于一次性排障
 * - 超时：SIGTERM → 5s 宽限期 → SIGKILL，避免子进程卡死无法回收
 *
 * 返回值：{ exitCode, signal, killedByTimeout }
 */
interface SpawnResult {
  exitCode: number | null
  signal: NodeJS.Signals | null
  killedByTimeout: boolean
}

interface StreamingOptions {
  /** 命令超时（毫秒），到时间发 SIGTERM */
  timeoutMs?: number
  /** stderr 行级别：默认 'info'。npm/webpack warning 也走 stderr，全标 error 会误导 */
  stderrLevel?: 'info' | 'warn' | 'error'
  /** 单行最大长度，超过截断（防止超长错误栈把日志表撑爆，默认 4KB） */
  maxLineLength?: number
}

/**
 * 单条日志写入复用：runStreaming 里高频调用，统一封装一次。
 */
function insertLog(
  db: Database.Database,
  buildId: string,
  level: 'info' | 'warn' | 'error' | 'success',
  source: string,
  message: string
) {
  db.prepare(
    'INSERT INTO build_logs (id, build_id, timestamp, level, message, source) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(generateId('log'), buildId, Date.now(), level, message, source)
}

async function runStreaming(
  command: string,
  cwd: string,
  source: string,
  buildId: string,
  db: Database.Database,
  opts: StreamingOptions = {}
): Promise<SpawnResult> {
  const {
    timeoutMs = 10 * 60_000,
    stderrLevel = 'info',
    maxLineLength = 4096,
  } = opts

  return new Promise<SpawnResult>((resolve) => {
    // spawn 之前先打日志，万一 spawn 同步抛错也能从日志看到出问题的命令
    logInfo(db, buildId, `准备执行命令: ${command}`, source)

    const child = spawn(command, {
      cwd,
      shell: true,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    // spawn 是异步执行命令，但 child 对象同步返回；这里立刻打 pid，
    // 若后续没有任何 stdout/stderr 输出，至少能从 pid 判断子进程是否已起来，
    // 便于排查"卡住"类问题（区分是 spawn 没起 / 起了但进程内卡住 / 网络等）
    logInfo(db, buildId, `子进程已启动 (pid=${child.pid ?? 'unknown'})`, source)

    let killedByTimeout = false
    const timeoutHandle = setTimeout(() => {
      killedByTimeout = true
      logError(db, buildId, `命令执行超时（${Math.round(timeoutMs / 1000)}s），发送 SIGTERM`, source)
      child.kill('SIGTERM')
      // 5 秒宽限期后强杀，避免子进程僵尸
      setTimeout(() => {
        if (!child.killed) {
          logError(db, buildId, '子进程未在宽限期内退出，发送 SIGKILL 强制终止', source)
          child.kill('SIGKILL')
        }
      }, 5_000)
    }, timeoutMs)

    // 按行缓冲：data 事件不保证按完整行分块，需要把残行留到下一次拼接
    const makeLineBuffer = (level: 'info' | 'warn' | 'error') => {
      let buf = ''
      return {
        push(chunk: string) {
          buf += chunk
          let idx: number
          while ((idx = buf.indexOf('\n')) !== -1) {
            const raw = buf.slice(0, idx).replace(/\r$/, '')
            buf = buf.slice(idx + 1)
            if (raw.length === 0) continue
            const line =
              raw.length > maxLineLength
                ? raw.slice(0, maxLineLength) + ` ...[已截断 ${raw.length - maxLineLength} 字符]`
                : raw
            insertLog(db, buildId, level, source, line)
          }
        },
        flush() {
          if (buf.trim()) {
            const line =
              buf.length > maxLineLength
                ? buf.slice(0, maxLineLength) + ` ...[已截断 ${buf.length - maxLineLength} 字符]`
                : buf
            insertLog(db, buildId, level, source, line)
            buf = ''
          }
        },
      }
    }

    const stdoutBuf = makeLineBuffer('info')
    const stderrBuf = makeLineBuffer(stderrLevel)

    child.stdout?.setEncoding('utf-8')
    child.stderr?.setEncoding('utf-8')
    child.stdout?.on('data', (data: string) => stdoutBuf.push(data))
    child.stderr?.on('data', (data: string) => stderrBuf.push(data))

    child.on('error', (err) => {
      // 进程启动失败（如命令找不到），属于致命错误
      clearTimeout(timeoutHandle)
      stdoutBuf.flush()
      stderrBuf.flush()
      logError(db, buildId, `子进程启动失败: ${err.message}`, source)
      resolve({ exitCode: -1, signal: null, killedByTimeout })
    })

    child.on('close', (code, signal) => {
      clearTimeout(timeoutHandle)
      stdoutBuf.flush()
      stderrBuf.flush()
      resolve({ exitCode: code, signal, killedByTimeout })
    })
  })
}

/**
 * 安装项目依赖。仅当 codeRoot 下存在 package.json 时才执行 npm install。
 * 失败仅 warn，不抛出（部分纯静态项目可能装依赖失败但 ci 仍可工作）。
 *
 * 与之前 execSync 版本的差异：
 * - 实时流式输出每行 npm 日志到 build_logs，前端可立即看到进度
 * - 主线程不再被阻塞，HTTP 轮询接口期间也能正常响应
 */
/**
 * 决定本次依赖安装实际跑的命令。
 *
 * 优先级（高到低）：
 *  1. 用户在项目配置里填的 installCommand —— 最高优先，整段 shell 命令原样执行；
 *     适合 pnpm/yarn 项目，或者需要 `--force`/`--ignore-scripts` 等定制。
 *  2. 平台默认：
 *     - 有 lockfile（package-lock.json / npm-shrinkwrap.json） → 用 `npm ci`
 *     - 没有 lockfile → 用 `npm install`
 *     两种默认都加上 `--legacy-peer-deps`，兼容老式严格 peer deps（npm 7+ 默认拒绝
 *     resolve，常见的 ERESOLVE 报错就是它）。
 *
 * 注意：仅默认命令加 `--legacy-peer-deps`；用户自定义 installCommand 时不会被改写，
 * 用户应该自己控制其参数。
 */
function resolveInstallCommand(codeRoot: string, custom?: string): string {
  const trimmed = custom?.trim()
  if (trimmed) return trimmed

  const hasLock =
    fs.existsSync(path.join(codeRoot, 'package-lock.json')) ||
    fs.existsSync(path.join(codeRoot, 'npm-shrinkwrap.json'))

  // --legacy-peer-deps 兜底解决 ERESOLVE peer dep 冲突，是当前业界最稳妥的默认
  // --no-audit / --no-fund 减少噪声日志
  // --progress=false 关掉 npm 进度条（默认是基于 tty 的，spawn 下也无意义）
  return hasLock
    ? 'npm ci --include=dev --no-audit --no-fund --progress=false --legacy-peer-deps'
    : 'npm install --include=dev --no-audit --no-fund --progress=false --legacy-peer-deps'
}

async function installDependencies(
  codeRoot: string,
  buildId: string,
  db: Database.Database,
  options: { installCommand?: string; failOnError: boolean }
) {
  const pkgPath = path.join(codeRoot, 'package.json')
  logInfo(db, buildId, `检查 package.json: ${pkgPath}`, 'npm')
  if (!fs.existsSync(pkgPath)) {
    logInfo(db, buildId, '未发现 package.json，跳过依赖安装', 'npm')
    return
  }

  const cmd = resolveInstallCommand(codeRoot, options.installCommand)
  const isCustom = !!options.installCommand?.trim()
  logInfo(
    db,
    buildId,
    isCustom
      ? '发现 package.json，开始安装依赖（用户自定义命令）'
      : '发现 package.json，开始安装依赖（平台默认命令，含 --legacy-peer-deps 兼容）',
    'npm'
  )

  const { exitCode, killedByTimeout } = await runStreaming(cmd, codeRoot, 'npm', buildId, db, {
    timeoutMs: 10 * 60_000,
    stderrLevel: 'info', // npm 的 warning 走 stderr，默认 info 即可，不要误标 error
  })

  if (exitCode === 0) {
    logSuccess(db, buildId, '依赖安装成功', 'npm')
    return
  }

  // 失败处理：根据是否还有后续编译决定 fail-fast 还是 continue
  const reason = killedByTimeout
    ? '依赖安装超时被终止'
    : `依赖安装失败（exit=${exitCode}）`

  if (options.failOnError) {
    // 给一个更友好的下一步提示，避免用户面对一长串 ERESOLVE 不知所措
    logError(
      db,
      buildId,
      `${reason}。常见原因：peer dependency 冲突（ERESOLVE）。` +
        '若是 pnpm/yarn 项目，请在「项目配置 → CI 配置 → 依赖安装命令」里填写对应包管理器命令；' +
        "也可改成 'npm install --force'。",
      'npm'
    )
    throw new Error(reason)
  }
  logWarn(db, buildId, `${reason}，未配置 buildCommand 故继续后续步骤`, 'npm')
}

/**
 * 执行用户在项目配置里填写的 buildCommand（如 'npm run build:weapp'）。
 *
 * 适配场景：Taro / uni-app / Vue3 + vite-plugin-weapp 等编译型小程序框架，
 * 它们的源码不能直接被 miniprogram-ci 上传，必须先编译出 dist/。
 *
 * 行为：
 * - 未配置则跳过（向后兼容原生小程序工作流）
 * - 编译失败立刻抛出，导致整个 build 标记为 failed
 *   （编译没成功就上传等于上传源码，这是用户最关心的故障）
 */
async function runBuildCommand(
  codeRoot: string,
  command: string | undefined,
  buildId: string,
  db: Database.Database
) {
  const trimmed = command?.trim()
  if (!trimmed) {
    logInfo(db, buildId, '未配置 buildCommand，跳过编译步骤', 'build')
    return
  }

  logInfo(db, buildId, `执行编译命令: ${trimmed}`, 'build')

  const { exitCode, killedByTimeout, signal } = await runStreaming(
    trimmed,
    codeRoot,
    'build',
    buildId,
    db,
    {
      timeoutMs: 15 * 60_000,
      // 编译框架（Taro/webpack 等）会把进度、warning 写到 stderr，标 warn 更友好
      stderrLevel: 'warn',
    }
  )

  if (exitCode === 0) {
    logSuccess(db, buildId, '编译完成', 'build')
    return
  }
  if (killedByTimeout) {
    throw new Error('编译命令执行超时')
  }
  throw new Error(`编译命令执行失败 (exit=${exitCode}${signal ? `, signal=${signal}` : ''})`)
}

/**
 * 把 codeRoot 与用户配置的 miniprogramRoot 拼出 miniprogram-ci 真正用的小程序根目录。
 *
 * - miniprogramRoot 留空时返回 codeRoot 本身（原生小程序场景）
 * - 拼接结果会做存在性校验，并要求其下存在 project.config.json
 *   （miniprogram-ci 文档明确要求 projectPath 是 project.config.json 所在目录）
 */
function resolveMiniprogramRoot(codeRoot: string, miniprogramRoot?: string): string {
  const sub = miniprogramRoot?.trim().replace(/^[/\\]+/, '')
  const targetPath = sub ? path.join(codeRoot, sub) : codeRoot

  if (!fs.existsSync(targetPath)) {
    throw new Error(
      `小程序根目录不存在: ${targetPath} (miniprogramRoot=${miniprogramRoot || '<空>'}). ` +
      '请确认 buildCommand 已正确产出该目录，或在项目配置里更正 miniprogramRoot 字段。'
    )
  }

  const configPath = path.join(targetPath, 'project.config.json')
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `小程序根目录下未找到 project.config.json: ${targetPath}. ` +
      'miniprogram-ci 要求 projectPath 必须指向包含 project.config.json 的目录。'
    )
  }

  return targetPath
}

/**
 * 删除目录的安全包装：失败仅记录，不抛出（清理失败不该让构建结果变成 failed）。
 */
function safeRemoveDir(dir: string) {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  } catch {
    // 静默失败：清理只是一种 best-effort 行为
  }
}

/**
 * 构建结束后清理 sandbox 临时目录。
 * - sandboxRoot 为 null 时（用户使用了本地 project_path）不做清理
 * - 同时尝试清理空的项目级父目录（SANDBOX_BASE/<projectId>），保持目录干净
 */
function cleanupSandbox(
  sandboxRoot: string | null,
  buildId: string,
  db: Database.Database
) {
  if (!sandboxRoot) return
  safeRemoveDir(sandboxRoot)
  // 尝试清理空的父目录（SANDBOX_BASE/<projectId>），失败忽略
  try {
    const parent = path.dirname(sandboxRoot)
    if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0) {
      fs.rmdirSync(parent)
    }
  } catch {
    // ignore
  }
  logInfo(db, buildId, `已清理构建沙盒: ${sandboxRoot}`, 'system')
}

/**
 * 解析当前 environments JSON。统一一处避免到处 try/parse。
 */
function parseEnvironments(raw: string): EnvironmentsConfig {
  try {
    return JSON.parse(raw || '{}') as EnvironmentsConfig
  } catch {
    return {} as EnvironmentsConfig
  }
}

export async function startBuild(
  buildId: string,
  project: ProjectRow,
  db: Database.Database,
  extra?: { version?: string; environment?: string; branch?: string }
) {
  const updateStatus = db.prepare('UPDATE builds SET status = ? WHERE id = ?')
  const finishBuild = db.prepare('UPDATE builds SET status = ?, end_time = ? WHERE id = ?')
  const updateIteration = db.prepare(
    'UPDATE iterations SET status = ?, updated_at = ? WHERE build_id = ?'
  )

  logInfo(db, buildId, '构建任务已启动', 'system')
  updateStatus.run('cloning', buildId)

  // 在最外层维护 sandboxRoot，保证 finally 一定能清理（即使 prepareCode 失败也会清掉空目录）
  let sandboxRoot: string | null = null

  try {
    const prepared = await prepareCode(project, buildId, db, extra?.branch)
    sandboxRoot = prepared.sandboxRoot
    const { codeRoot } = prepared

    // 解析环境配置：installDependencies 需要 installCommand / buildCommand 才能决定
    // 用什么命令安装、装失败要不要立刻终止，所以提前解析
    const env = parseEnvironments(project.environments)
    const envConfig = (extra?.environment === 'prod' ? env.prod : env.dev) || {}
    const privateKey = env.private_key || envConfig.private_key || ''

    if (!privateKey) {
      throw new Error('未配置微信 CI 私钥，请在项目配置 > 环境设置中添加 privateKey')
    }

    // 安装依赖
    updateStatus.run('installing', buildId)
    await installDependencies(codeRoot, buildId, db, {
      installCommand: env.installCommand,
      // 配置了 buildCommand 时（编译型框架）依赖必须装好，失败立即终止避免浪费时间
      failOnError: !!env.buildCommand?.trim(),
    })

    // 执行编译命令（Taro/uni-app 等编译型框架必须）
    updateStatus.run('building', buildId)
    await runBuildCommand(codeRoot, env.buildCommand, buildId, db)

    // 解析 miniprogram-ci 真正使用的小程序根（codeRoot + miniprogramRoot）
    const projectPath = resolveMiniprogramRoot(codeRoot, env.miniprogramRoot)
    logInfo(db, buildId, `小程序根目录: ${projectPath}`, 'ci')

    const appId = project.app_id
    const version = extra?.version || '1.0.0'
    const robot = envConfig.robot || 1
    const setting = envConfig.setting || {}

    logInfo(db, buildId, `准备上传: ${appId} v${version} robot=${robot} path=${projectPath}`, 'ci')

    const ci = await import('miniprogram-ci')
    const projectObj = new ci.Project({
      appid: appId,
      type: 'miniProgram',
      projectPath,
      privateKey,
      ignores: ['node_modules/**/*'],
    })

    // 可选：构建 npm（若使用了小程序 npm 包）
    if (env.npmBuild) {
      logInfo(db, buildId, '正在构建小程序 npm（packNpm）...', 'ci')
      const warnings = await ci.packNpm(projectObj, {
        ignores: ['pack_npm_ignore_list'],
        reporter: () => undefined,
      })
      if (Array.isArray(warnings) && warnings.length > 0) {
        for (const w of warnings.slice(0, 10)) {
          logWarn(db, buildId, `[packNpm] ${w?.msg || JSON.stringify(w)}`, 'ci')
        }
      }
      logSuccess(db, buildId, 'npm 构建完成', 'ci')
    }

    updateStatus.run('uploading', buildId)
    const result = await ci.upload({
      project: projectObj,
      version,
      desc: `WeDeploy 自动构建 - ${extra?.environment || 'dev'}`,
      robot,
      setting: {
        es6: setting.es6 !== false,
        es7: setting.es7 !== false,
        minify: setting.minify === true,
        minifyJS: setting.minifyJS === true,
        minifyWXML: setting.minifyWXML === true,
        minifyWXSS: setting.minifyWXSS === true,
        codeProtect: setting.codeProtect === true,
      },
      onProgressUpdate: (task) => {
        const msg = typeof task === 'string' ? task : task.message
        const id = typeof task === 'string' ? '' : task.id
        if (msg) {
          db.prepare('INSERT INTO build_logs (id, build_id, timestamp, level, message, source) VALUES (?, ?, ?, ?, ?, ?)')
            .run(generateId('log'), buildId, Date.now(), 'info', `[${id}] ${msg}`, 'ci')
        }
      },
    })

    logSuccess(db, buildId, '上传成功！', 'ci')
    if (result.subPackageInfo) {
      let totalSize = 0
      for (const pkg of result.subPackageInfo) {
        totalSize += pkg.size
        logInfo(db, buildId, `  子包 ${pkg.name}: ${(pkg.size / 1024).toFixed(1)}KB`, 'ci')
      }
      logInfo(db, buildId, `  总大小: ${(totalSize / 1024).toFixed(1)}KB`, 'ci')
    }

    const endTime = new Date().toISOString()
    finishBuild.run('success', endTime, buildId)
    logSuccess(db, buildId, '构建完成 ✓', 'system')
    updateIteration.run('active', endTime, buildId)
  } catch (err: any) {
    const endTime = new Date().toISOString()
    finishBuild.run('failed', endTime, buildId)
    db.prepare('UPDATE builds SET error = ? WHERE id = ?').run(err.message, buildId)
    logError(db, buildId, `构建失败: ${err.message}`, 'system')
    updateIteration.run('active', endTime, buildId)
  } finally {
    // 无论成功/失败都清理 sandbox（仅清掉本次创建的临时目录），
    // 避免 /tmp/we-deploy/builds 长期堆积消耗服务器磁盘
    cleanupSandbox(sandboxRoot, buildId, db)
  }
}

export async function startPreview(
  buildId: string,
  project: ProjectRow,
  db: Database.Database,
  extra?: { environment?: string; pagePath?: string; branch?: string }
) {
  const updateStatus = db.prepare('UPDATE builds SET status = ? WHERE id = ?')
  const finishBuild = db.prepare('UPDATE builds SET status = ?, end_time = ? WHERE id = ?')

  logInfo(db, buildId, '预览构建已启动', 'system')
  updateStatus.run('cloning', buildId)

  let sandboxRoot: string | null = null

  try {
    const prepared = await prepareCode(project, buildId, db, extra?.branch)
    sandboxRoot = prepared.sandboxRoot
    const { codeRoot } = prepared

    // 解析环境配置：提前到 installDependencies 之前，让它能拿到 installCommand 决策
    const env = parseEnvironments(project.environments)
    const envConfig = (extra?.environment === 'prod' ? env.prod : env.dev) || {}
    const privateKey = env.private_key || envConfig.private_key || ''

    if (!privateKey) {
      throw new Error('未配置微信 CI 私钥')
    }

    updateStatus.run('installing', buildId)
    await installDependencies(codeRoot, buildId, db, {
      installCommand: env.installCommand,
      failOnError: !!env.buildCommand?.trim(),
    })

    updateStatus.run('building', buildId)
    const build = db.prepare('SELECT * FROM builds WHERE id = ?').get(buildId) as any

    // 执行编译命令（如有）
    await runBuildCommand(codeRoot, env.buildCommand, buildId, db)

    const projectPath = resolveMiniprogramRoot(codeRoot, env.miniprogramRoot)

    // 二维码持久化目录：环境变量可配置，便于 docker volume 挂载
    const qrcodeOutputDest = path.join(QRCODE_BASE, `${buildId}.jpg`)
    fs.mkdirSync(path.dirname(qrcodeOutputDest), { recursive: true })

    const ci = await import('miniprogram-ci')
    const projectObj = new ci.Project({
      appid: project.app_id,
      type: 'miniProgram',
      projectPath,
      privateKey,
      ignores: ['node_modules/**/*'],
    })

    if (env.npmBuild) {
      logInfo(db, buildId, '正在构建小程序 npm（packNpm）...', 'ci')
      await ci.packNpm(projectObj, {
        ignores: ['pack_npm_ignore_list'],
        reporter: () => undefined,
      })
      logSuccess(db, buildId, 'npm 构建完成', 'ci')
    }

    updateStatus.run('uploading', buildId)
    const result = await ci.preview({
      project: projectObj,
      version: build?.version || '1.0.0',
      desc: `WeDeploy 预览 - ${extra?.environment || 'dev'}`,
      robot: envConfig.robot || 1,
      qrcodeFormat: 'image',
      qrcodeOutputDest,
      pagePath: extra?.pagePath,
      setting: {
        es6: true,
        es7: true,
      },
    })

    db.prepare('UPDATE builds SET description = ? WHERE id = ?')
      .run(JSON.stringify({ qrcodePath: qrcodeOutputDest }), buildId)

    logSuccess(db, buildId, `预览二维码已生成: ${qrcodeOutputDest}`, 'ci')
    if (result.subPackageInfo) {
      for (const pkg of result.subPackageInfo) {
        logInfo(db, buildId, `  子包 ${pkg.name}: ${(pkg.size / 1024).toFixed(1)}KB`, 'ci')
      }
    }

    const endTime = new Date().toISOString()
    finishBuild.run('success', endTime, buildId)
    logSuccess(db, buildId, '预览构建完成 ✓', 'system')
  } catch (err: any) {
    const endTime = new Date().toISOString()
    finishBuild.run('failed', endTime, buildId)
    db.prepare('UPDATE builds SET error = ? WHERE id = ?').run(err.message, buildId)
    logError(db, buildId, `预览构建失败: ${err.message}`, 'system')
  } finally {
    // 预览构建结束后同样清理 sandbox 代码目录（二维码图片不在 sandboxRoot 下，不会被误删）
    cleanupSandbox(sandboxRoot, buildId, db)
  }
}
