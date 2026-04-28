import { Router, Request, Response } from 'express'

const router = Router()

// POST /api/ci/init
router.post('/init', (req: Request, res: Response) => {
  console.log('CI init:', req.body)
  res.json({ success: true })
})

// POST /api/ci/upload
router.post('/upload', (req: Request, res: Response) => {
  console.log('CI upload:', req.body)
  res.json({ success: true, version: req.body.version || '1.0.0' })
})

export default router
