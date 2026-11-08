import type Database from 'better-sqlite3'

/**
 * 系统设置白名单：只有这里声明的 key 才能被读取/写入，
 * 避免任意键值写入 settings 表，也避免前端展示并不生效的"假设置"。
 */
export const SETTING_DEFAULTS = {
  maxConcurrentBuilds: '2',
  notifyOnSuccess: 'false',
  notifyOnFailure: 'true',
  webhookUrl: '',
} as const

export type SettingKey = keyof typeof SETTING_DEFAULTS
export type Settings = Record<SettingKey, string>

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTING_DEFAULTS, key)
}

export function readSettings(db: Database.Database): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
    key: string
    value: string
  }>
  const settings: Settings = { ...SETTING_DEFAULTS }
  for (const row of rows) {
    if (isSettingKey(row.key)) settings[row.key] = row.value
  }
  return settings
}

/** 企业微信 / 飞书 / 钉钉等 webhook 只允许 https，避免明文或内网协议 */
export function validateWebhookUrl(url: string): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return 'Webhook 地址必须以 https:// 开头'
    return null
  } catch {
    return 'Webhook 地址格式不正确'
  }
}
