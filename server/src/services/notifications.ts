import type Database from 'better-sqlite3'
import { readSettings } from './settingsStore.js'

const ENV_LABEL: Record<string, string> = { dev: '开发版', prod: '正式版' }

/**
 * 发送企业微信机器人 markdown 消息。
 * 企业微信成功时返回 { errcode: 0 }，其余均视为失败并抛错。
 */
export async function sendWebhookMarkdown(url: string, content: string): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'markdown', markdown: { content } }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Webhook 返回 HTTP ${res.status}`)
    const data = (await res.json().catch(() => ({}))) as { errcode?: number; errmsg?: string }
    if (typeof data.errcode === 'number' && data.errcode !== 0) {
      throw new Error(`Webhook 返回错误: ${data.errmsg || data.errcode}`)
    }
  } finally {
    clearTimeout(timer)
  }
}

function formatDuration(start?: string, end?: string): string {
  if (!start || !end) return '-'
  const sec = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000))
  const m = Math.floor(sec / 60)
  return m > 0 ? `${m}分${sec % 60}秒` : `${sec}秒`
}

/**
 * 构建进入终态后，根据系统设置决定是否推送通知。
 */
export async function notifyBuildFinished(db: Database.Database, buildId: string): Promise<void> {
  const settings = readSettings(db)
  if (!settings.webhookUrl) return

  const build = db.prepare('SELECT * FROM builds WHERE id = ?').get(buildId) as any
  if (!build) return
  const ok = build.status === 'success'
  if (ok && settings.notifyOnSuccess !== 'true') return
  if (!ok && settings.notifyOnFailure !== 'true') return

  const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(build.project_id) as
    | { name: string }
    | undefined
  const iteration = build.iteration_id
    ? (db.prepare('SELECT name FROM iterations WHERE id = ?').get(build.iteration_id) as
        | { name: string }
        | undefined)
    : undefined

  const kind = build.kind === 'preview' ? '预览' : '上传'
  const lines = [
    `### ${ok ? '✅' : '❌'} 小程序${kind}${ok ? '成功' : '失败'}`,
    `> 项目：<font color="info">${project?.name || build.project_id}</font>`,
    iteration ? `> 迭代：${iteration.name}` : '',
    `> 版本：${build.version}（${ENV_LABEL[build.environment] || build.environment}）`,
    `> 分支：${build.branch || '-'}`,
    `> 触发人：${build.trigger_by || '-'}`,
    `> 耗时：${formatDuration(build.start_time, build.end_time)}`,
    !ok && build.error ? `> 原因：<font color="warning">${String(build.error).slice(0, 300)}</font>` : '',
  ].filter(Boolean)

  await sendWebhookMarkdown(settings.webhookUrl, lines.join('\n'))
}
