import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'we-deploy-secret-key-2024'

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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: '未提供认证令牌' })
    return
  }

  const token = header.slice(7)
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload
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
