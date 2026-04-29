import type Database from 'better-sqlite3'

interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => void
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id            TEXT PRIMARY KEY,
          name          TEXT NOT NULL,
          description   TEXT DEFAULT '',
          app_id        TEXT NOT NULL,
          repo_url      TEXT NOT NULL,
          branch        TEXT DEFAULT 'main',
          auth_type     TEXT DEFAULT 'token',
          auth_token    TEXT DEFAULT '',
          ssh_key_path  TEXT DEFAULT '',
          project_path  TEXT DEFAULT '',
          environments  TEXT NOT NULL DEFAULT '{}',
          created_at    TEXT NOT NULL,
          updated_at    TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS iterations (
          id            TEXT PRIMARY KEY,
          project_id    TEXT NOT NULL,
          name          TEXT NOT NULL,
          description   TEXT DEFAULT '',
          branch        TEXT NOT NULL,
          version       TEXT NOT NULL,
          environment   TEXT NOT NULL DEFAULT 'dev',
          status        TEXT NOT NULL DEFAULT 'active',
          build_id      TEXT DEFAULT '',
          commit_hash   TEXT DEFAULT '',
          created_by    TEXT DEFAULT '',
          created_at    TEXT NOT NULL,
          updated_at    TEXT NOT NULL,
          closed_at     TEXT DEFAULT '',
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS builds (
          id            TEXT PRIMARY KEY,
          project_id    TEXT NOT NULL,
          iteration_id  TEXT DEFAULT '',
          environment   TEXT NOT NULL DEFAULT 'dev',
          status        TEXT NOT NULL DEFAULT 'pending',
          version       TEXT NOT NULL,
          description   TEXT DEFAULT '',
          commit_hash   TEXT DEFAULT '',
          branch        TEXT DEFAULT '',
          start_time    TEXT NOT NULL,
          end_time      TEXT DEFAULT '',
          error         TEXT DEFAULT '',
          trigger_by    TEXT DEFAULT '',
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_builds_start_time ON builds (start_time);

        CREATE TABLE IF NOT EXISTS build_logs (
          id            TEXT PRIMARY KEY,
          build_id      TEXT NOT NULL,
          timestamp     INTEGER NOT NULL,
          level         TEXT NOT NULL DEFAULT 'info',
          message       TEXT NOT NULL,
          source        TEXT DEFAULT '',
          FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_build_logs_build_ts
          ON build_logs (build_id, timestamp);

        CREATE TABLE IF NOT EXISTS settings (
          key           TEXT PRIMARY KEY,
          value         TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS users (
          id            TEXT PRIMARY KEY,
          username      TEXT UNIQUE NOT NULL,
          password      TEXT NOT NULL,
          display_name  TEXT DEFAULT '',
          email         TEXT DEFAULT '',
          role          TEXT DEFAULT 'user',
          last_login    TEXT DEFAULT '',
          created_at    TEXT NOT NULL,
          updated_at    TEXT NOT NULL
        );
      `)
    },
  },
]

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      applied_at  TEXT NOT NULL
    );
  `)

  const appliedRows = db
    .prepare('SELECT version FROM schema_migrations')
    .all() as Array<{ version: number }>
  const applied = new Set(appliedRows.map((row) => row.version))

  const insert = db.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
  )

  for (const migration of migrations.sort((a, b) => a.version - b.version)) {
    if (applied.has(migration.version)) continue
    const txn = db.transaction(() => {
      migration.up(db)
      insert.run(migration.version, migration.name, new Date().toISOString())
    })
    txn()
  }
}
