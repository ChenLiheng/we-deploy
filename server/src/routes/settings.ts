import { Router, Request, Response } from 'express'
import { getDb } from '../db/init.js'
import { requireAdmin } from '../middleware/auth.js'
import { getLogRetentionDays } from '../services/buildRetention.js'
import { getBuildQueueSnapshot } from '../services/buildQueue.js'
import { sendWebhookMarkdown } from '../services/notifications.js'
import { isSettingKey, readSettings, validateWebhookUrl } from '../services/settingsStore.js'

const router = Router()

function systemInfo() {
  const envConcurrency = Number(process.env.MAX_CONCURRENT_BUILDS)
  return {
    logRetentionDays: getLogRetentionDays(),
    sandboxBase: process.env.SANDBOX_BASE || '/tmp/we-deploy/builds',
    qrcodeBase: process.env.QRCODE_BASE || '/tmp/we-deploy/qrcodes',
    concurrencyFromEnv: Number.isInteger(envConcurrency) && envConcurrency > 0 ? envConcurrency : null,
    queue: getBuildQueueSnapshot(),
    nodeVersion: process.version,
  }
}

// GET /api/settings
router.get('/', (_req: Request, res: Response) => {
  res.json({ settings: readSettings(getDb()), system: systemInfo() })
})

// PUT /api/settings —— 仅管理员可修改，且只接受白名单内的 key
router.put('/', requireAdmin, (req: Request, res: Response) => {
  const db = getDb()
  const body = (req.body || {}) as Record<string, unknown>
  const entries: Array<[string, string]> = []

  for (const [key, raw] of Object.entries(body)) {
    if (!isSettingKey(key)) continue
    const value = typeof raw === 'boolean' ? String(raw) : String(raw ?? '').trim()
    if (key === 'maxConcurrentBuilds') {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 1 || n > 16) {
        res.status(400).json({ error: '最大并发构建数需为 1-16 的整数' })
        return
      }
    }
    if (key === 'webhookUrl') {
      const err = validateWebhookUrl(value)
      if (err) {
        res.status(400).json({ error: err })
        return
      }
    }
    entries.push([key, value])
  }

  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
  db.transaction(() => {
    for (const [key, value] of entries) upsert.run(key, value)
  })()

  res.json({ settings: readSettings(db), system: systemInfo() })
})

// POST /api/settings/test-webhook —— 发送一条测试消息，帮助用户确认机器人地址可用
router.post('/test-webhook', requireAdmin, async (req: Request, res: Response) => {
  const url = String(req.body?.webhookUrl || readSettings(getDb()).webhookUrl || '').trim()
  if (!url) {
    res.status(400).json({ error: '请先填写 Webhook 地址' })
    return
  }
  const err = validateWebhookUrl(url)
  if (err) {
    res.status(400).json({ error: err })
    return
  }
  try {
    await sendWebhookMarkdown(url, `### 🔔 WeDeploy 测试消息\n> 来自 ${req.user?.username || 'admin'} 的通知配置测试，收到即表示配置成功。`)
    res.json({ success: true })
  } catch (e: any) {
    res.status(502).json({ error: e?.message || '发送失败' })
  }
})

export default router
