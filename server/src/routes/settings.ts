import { Router, Request, Response } from 'express'
import { getDb } from '../db/init.js'

const router = Router()

// GET /api/settings
router.get('/', (_req: Request, res: Response) => {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM settings').all() as any[]

  const settings: Record<string, string> = {}
  for (const row of rows) {
    settings[row.key] = row.value
  }

  const defaults: Record<string, string> = {
    apiBaseUrl: 'http://localhost:8080',
    apiTimeout: '30000',
    buildSandboxPath: '/tmp/we-deploy/builds',
    maxConcurrentBuilds: '3',
    autoClearBuilds: 'true',
    notifyOnSuccess: 'true',
    notifyOnFailure: 'true',
    webhookUrl: '',
    enableAuth: 'false',
    encryptionKey: '',
  }

  res.json({ ...defaults, ...settings })
})

// PUT /api/settings
router.put('/', (req: Request, res: Response) => {
  const db = getDb()
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')

  const txn = db.transaction((entries: [string, string][]) => {
    for (const [key, value] of entries) {
      upsert.run(key, String(value))
    }
  })

  txn(Object.entries(req.body))

  const rows = db.prepare('SELECT * FROM settings').all() as any[]
  const settings: Record<string, string> = {}
  for (const row of rows) {
    settings[row.key] = row.value
  }

  res.json(settings)
})

export default router
