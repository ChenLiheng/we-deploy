import type Database from 'better-sqlite3'
import { emitBuildStatus } from './buildEvents.js'

type BuildTask = () => Promise<void>

interface QueuedBuildTask {
  id: string
  db: Database.Database
  run: BuildTask
}

const queue: QueuedBuildTask[] = []
let activeCount = 0

function readMaxConcurrentBuilds(db: Database.Database): number {
  const fromEnv = Number(process.env.MAX_CONCURRENT_BUILDS)
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv

  const row = db.prepare("SELECT value FROM settings WHERE key = 'maxConcurrentBuilds'").get() as
    | { value: string }
    | undefined
  const fromSettings = Number(row?.value)
  if (Number.isInteger(fromSettings) && fromSettings > 0) return fromSettings

  return 2
}

function pumpQueue() {
  const next = queue[0]
  if (!next) return

  const maxConcurrent = readMaxConcurrentBuilds(next.db)
  while (activeCount < maxConcurrent && queue.length > 0) {
    const task = queue.shift()!
    activeCount += 1
    task
      .run()
      .catch((err) => {
        console.error(`Build task ${task.id} failed:`, err)
      })
      .finally(() => {
        activeCount -= 1
        pumpQueue()
      })
  }
}

export function enqueueBuildTask(
  buildId: string,
  db: Database.Database,
  run: BuildTask
): { position: number } {
  db.prepare('UPDATE builds SET status = ? WHERE id = ?').run('queued', buildId)
  emitBuildStatus(buildId, 'queued')

  queue.push({ id: buildId, db, run })
  const position = queue.length
  pumpQueue()
  return { position }
}

export function getBuildQueueSnapshot() {
  return {
    activeCount,
    queuedCount: queue.length,
    queuedBuildIds: queue.map((task) => task.id),
  }
}
