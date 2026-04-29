import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (secret) return secret

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production')
  }

  return 'we-deploy-dev-secret'
}

export interface JwtPayload {
  userId: string
  username: string
  role: string
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' })
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const queryToken = typeof req.query.access_token === 'string' ? req.query.access_token : ''
  const token = header?.startsWith('Bearer ') ? header.slice(7) : queryToken

  if (!token) {
    res.status(401).json({ error: '未提供认证令牌' })
    return
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload
    req.user = decoded
    next()
  } catch {
    res.status(401).json({ error: '认证令牌无效或已过期' })
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: '需要管理员权限' })
    return
  }
  next()
}
