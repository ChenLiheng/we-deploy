import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { initDatabase, getDb } from './db/init.js'
import { errorHandler } from './middleware/errorHandler.js'
import projectRoutes from './routes/projects.js'
import iterationRoutes from './routes/iterations.js'
import buildRoutes from './routes/builds.js'
import settingsRoutes from './routes/settings.js'
import gitRoutes from './routes/git.js'
import ciRoutes from './routes/ci.js'
import authRoutes from './routes/auth.js'
import { authMiddleware } from './middleware/auth.js'
import {
  runBuildRetentionCleanup,
  startBuildRetentionScheduler,
  getLogRetentionDays,
} from './services/buildRetention.js'

const app = express()
// 端口与数据库路径都从环境变量读取，便于 Docker / systemd 部署时覆盖默认值；
// 未设置时仍保留原有默认行为，本地开发不受影响。
const PORT = Number(process.env.PORT) || 8080
const HOST = process.env.HOST || '0.0.0.0'
const DB_PATH = process.env.DB_PATH || undefined

const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }
      callback(new Error('Not allowed by CORS'))
    },
  })
)
app.use(express.json({ limit: '10mb' }))

// 初始化数据库（DB_PATH 未设置时沿用原默认逻辑：data/we-deploy.db）
initDatabase(DB_PATH)

// 启动时回收孤儿构建：上一次进程被中断时正在跑的 build 在 db 里 status 还停留在
// pending/cloning/installing/building/uploading，但 worker 进程已经不存在了。
// 不清理的话前端会一直显示"卡住"（实际上没人在跑）。
// 这里把所有非终态的 build 一律标记为 failed，并把对应迭代恢复为 active。
const db = getDb()
const orphanCleanupStmt = db.prepare(`
  UPDATE builds
  SET status = 'failed',
      end_time = ?,
      error = COALESCE(NULLIF(error, ''), ?)
  WHERE status NOT IN ('success', 'failed')
`)
const orphanIterationStmt = db.prepare(`
  UPDATE iterations
  SET status = 'active', updated_at = ?
  WHERE status = 'building'
`)
const startupTs = new Date().toISOString()
const orphanResult = orphanCleanupStmt.run(
  startupTs,
  '服务重启时该构建仍未完成，已自动标记为失败'
)
if (orphanResult.changes > 0) {
  // 同时给被清理的 build 各自补一条 system log，方便用户在控制台直接看到原因
  const orphanIds = db
    .prepare(
      "SELECT id FROM builds WHERE status = 'failed' AND error = ? AND end_time = ?"
    )
    .all('服务重启时该构建仍未完成，已自动标记为失败', startupTs) as Array<{ id: string }>
  const insertLogStmt = db.prepare(
    'INSERT INTO build_logs (id, build_id, timestamp, level, message, source) VALUES (?, ?, ?, ?, ?, ?)'
  )
  for (const row of orphanIds) {
    insertLogStmt.run(
      `log_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`,
      row.id,
      Date.now(),
      'error',
      '服务重启时该构建仍未完成，已自动标记为失败。如需重试，请在迭代页面重新触发构建。',
      'system'
    )
  }
  orphanIterationStmt.run(startupTs)
  console.log(`✓ 已清理 ${orphanResult.changes} 条孤儿构建（服务重启所致）`)
}

// 构建记录 + 日志保留（默认 30 天，可通过 LOG_RETENTION_DAYS 调整；设为 0 关闭）
const retention = runBuildRetentionCleanup(db)
if (getLogRetentionDays() === 0) {
  console.log('ℹ LOG_RETENTION_DAYS=0：已关闭构建记录/日志自动清理')
} else if (retention.ran && retention.deletedBuilds > 0) {
  console.log(
    `✓ 构建保留策略：删除 ${retention.deletedBuilds} 条早于 ${retention.cutoffIso} 的构建及关联日志（已清空 ${retention.clearedIterationRefs} 条迭代的 build_id 引用）`
  )
}
startBuildRetentionScheduler(db, { runImmediately: false })

// Seed admin user if no users exist
const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count
if (userCount === 0) {
  const id = `admin_${Date.now().toString(36)}`
  const now = new Date().toISOString()
  const username = process.env.INITIAL_ADMIN_USERNAME || 'admin'
  const generatedPassword = crypto.randomBytes(18).toString('base64url')
  const password = process.env.INITIAL_ADMIN_PASSWORD || generatedPassword
  db.prepare(`
    INSERT INTO users (id, username, password, display_name, email, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'admin', ?, ?)
  `).run(
    id,
    username,
    bcrypt.hashSync(password, 10),
    'Administrator',
    'admin@we-deploy.local',
    now,
    now
  )
  console.log(`✓ Initial admin account created (${username})`)
  if (!process.env.INITIAL_ADMIN_PASSWORD) {
    console.log(`✓ Initial admin password: ${generatedPassword}`)
  }
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Mount routes
app.use('/api/auth', authRoutes)
app.use('/api', authMiddleware)
app.use('/api/projects', projectRoutes)
app.use('/api/iterations', iterationRoutes)
app.use('/api/builds', buildRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/git', gitRoutes)
app.use('/api/ci', ciRoutes)

// Error handler
app.use(errorHandler)

app.listen(PORT, HOST, () => {
  console.log(`✓ WeDeploy server running on http://${HOST}:${PORT}`)
})
