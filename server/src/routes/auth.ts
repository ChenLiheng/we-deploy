import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { getDb } from '../db/init.js'
import { signToken, authMiddleware } from '../middleware/auth.js'

const router = Router()

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`
}

// POST /api/auth/login
router.post('/login', (req: Request, res: Response) => {
  const db = getDb()
  const { username, password } = req.body

  if (!username || !password) {
    res.status(400).json({ error: '用户名和密码为必填项' })
    return
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any
  if (!user) {
    res.status(401).json({ error: '用户名或密码错误' })
    return
  }

  const valid = bcrypt.compareSync(password, user.password)
  if (!valid) {
    res.status(401).json({ error: '用户名或密码错误' })
    return
  }

  // Update last login
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(new Date().toISOString(), user.id)

  const token = signToken({ userId: user.id, username: user.username, role: user.role })

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      email: user.email,
      role: user.role,
    },
  })
})

// POST /api/auth/register
router.post('/register', (req: Request, res: Response) => {
  const db = getDb()
  const { username, password, displayName, email } = req.body

  if (!username || !password) {
    res.status(400).json({ error: '用户名和密码为必填项' })
    return
  }

  // Only allow registration if no users exist, or if admin
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count
  if (userCount > 0) {
    res.status(403).json({ error: '注册已关闭，请联系管理员' })
    return
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) {
    res.status(409).json({ error: '用户名已存在' })
    return
  }

  const id = generateId('user')
  const now = new Date().toISOString()
  const hashed = bcrypt.hashSync(password, 10)

  db.prepare(`
    INSERT INTO users (id, username, password, display_name, email, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'admin', ?, ?)
  `).run(id, username, hashed, displayName || username, email || '', now, now)

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any
  const token = signToken({ userId: user.id, username: user.username, role: user.role })

  res.status(201).json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      email: user.email,
      role: user.role,
    },
  })
})

// GET /api/auth/me
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.userId) as any

  if (!user) {
    res.status(404).json({ error: '用户不存在' })
    return
  }

  res.json({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    email: user.email,
    role: user.role,
    lastLogin: user.last_login || undefined,
  })
})

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, (req: Request, res: Response) => {
  const db = getDb()
  const { currentPassword, newPassword } = req.body || {}

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: '请输入当前密码和新密码' })
    return
  }
  if (String(newPassword).length < 8) {
    res.status(400).json({ error: '新密码至少 8 位' })
    return
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.userId) as any
  if (!user) {
    res.status(404).json({ error: '用户不存在' })
    return
  }
  if (!bcrypt.compareSync(String(currentPassword), user.password)) {
    res.status(400).json({ error: '当前密码不正确' })
    return
  }

  db.prepare('UPDATE users SET password = ?, updated_at = ? WHERE id = ?').run(
    bcrypt.hashSync(String(newPassword), 10),
    new Date().toISOString(),
    user.id
  )
  res.json({ success: true })
})

export default router
