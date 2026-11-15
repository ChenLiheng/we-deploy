import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { runMigrations } from './migrations.js'

test('runMigrations creates schema and records applied version', () => {
  const db = new Database(':memory:')
  try {
    runMigrations(db)
    runMigrations(db)

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>
    const names = new Set(tables.map((row) => row.name))

    for (const name of ['projects', 'iterations', 'builds', 'build_logs', 'settings', 'users']) {
      assert.equal(names.has(name), true)
    }

    const migrationCount = (
      db.prepare('SELECT COUNT(*) as count FROM schema_migrations').get() as { count: number }
    ).count
    assert.equal(migrationCount, 2)

    const buildColumns = db.prepare('PRAGMA table_info(builds)').all() as Array<{ name: string }>
    assert.equal(buildColumns.some((c) => c.name === 'kind'), true)
  } finally {
    db.close()
  }
})
