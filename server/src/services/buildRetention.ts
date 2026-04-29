import type Database from 'better-sqlite3'

/**
 * 构建记录与日志的保留策略：
 * - 超过保留天数的 builds 整条删除（build_logs 随外键 ON DELETE CASCADE 一并清除）
 * - 迭代表中的 build_id 仅作引用，删除构建前会先清空，避免指向已不存在记录
 *
 * 环境变量 LOG_RETENTION_DAYS：保留天数，默认 30；设为 0 表示不执行自动清理。
 */

function parseRetentionDays(): number {
  const raw = process.env.LOG_RETENTION_DAYS
  if (raw === undefined || raw === '') {
    return 30
  }
  const n = Number.parseInt(raw, 10)
  if (Number.isNaN(n) || n < 0) {
    return 30
  }
  return n
}

export function getLogRetentionDays(): number {
  return parseRetentionDays()
}

export interface BuildRetentionResult {
  /** 是否执行了清理（retention 为 0 时跳过） */
  ran: boolean
  /** 删除的构建条数 */
  deletedBuilds: number
  /** 清空的迭代 build_id 引用条数 */
  clearedIterationRefs: number
  /** 用于删除的截止日期（ISO 字符串），未运行时为空 */
  cutoffIso: string | null
}

/**
 * 删除早于截止时间的构建及其日志。
 */
export function runBuildRetentionCleanup(db: Database.Database): BuildRetentionResult {
  const days = parseRetentionDays()
  if (days === 0) {
    return { ran: false, deletedBuilds: 0, clearedIterationRefs: 0, cutoffIso: null }
  }

  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000
  const cutoffIso = new Date(cutoffMs).toISOString()

  const oldIds = db
    .prepare('SELECT id FROM builds WHERE start_time < ?')
    .all(cutoffIso) as Array<{ id: string }>

  if (oldIds.length === 0) {
    return { ran: true, deletedBuilds: 0, clearedIterationRefs: 0, cutoffIso }
  }

  const ids = oldIds.map((r) => r.id)
  // SQLite 单次语句绑定变量数量有限，分块并在事务内先清迭代引用再删构建
  const CHUNK = 400

  const runChunk = db.transaction((chunk: string[]) => {
    const ph = chunk.map(() => '?').join(', ')
    const clearIterations = db.prepare(
      `UPDATE iterations SET build_id = '' WHERE build_id IN (${ph})`
    )
    const cleared = clearIterations.run(...chunk)

    const delBuilds = db.prepare(`DELETE FROM builds WHERE id IN (${ph})`)
    const deleted = delBuilds.run(...chunk)

    return { cleared: cleared.changes, deleted: deleted.changes }
  })

  let totalDeleted = 0
  let totalCleared = 0
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const r = runChunk(chunk)
    totalCleared += r.cleared
    totalDeleted += r.deleted
  }

  return {
    ran: true,
    deletedBuilds: totalDeleted,
    clearedIterationRefs: totalCleared,
    cutoffIso,
  }
}

let intervalHandle: ReturnType<typeof setInterval> | undefined

/** 默认每 24 小时执行一次；若在启动时已手动调用 runBuildRetentionCleanup，请传 runImmediately: false 避免重复执行 */
export function startBuildRetentionScheduler(
  db: Database.Database,
  options?: { intervalMs?: number; runImmediately?: boolean }
): void {
  if (intervalHandle !== undefined) {
    clearInterval(intervalHandle)
  }
  const intervalMs = options?.intervalMs ?? 24 * 60 * 60 * 1000
  const run = () => {
    try {
      const r = runBuildRetentionCleanup(db)
      if (r.ran && r.deletedBuilds > 0) {
        console.log(
          `✓ 构建记录保留策略：已删除 ${r.deletedBuilds} 条早于 ${r.cutoffIso} 的构建（同时清理日志；已清空 ${r.clearedIterationRefs} 条迭代 build_id 引用）`
        )
      }
    } catch (e) {
      console.error('构建记录自动清理失败:', e)
    }
  }
  if (options?.runImmediately !== false) {
    run()
  }
  intervalHandle = setInterval(run, intervalMs)
  intervalHandle.unref?.()
}
