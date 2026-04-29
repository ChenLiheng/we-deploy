import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { runMigrations } from './migrations.js'

let dbInstance: Database.Database | null = null

export function getDb(): Database.Database {
  if (!dbInstance) {
    throw new Error('Database not initialized')
  }
  return dbInstance
}

export function initDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath || path.resolve(process.cwd(), 'data/we-deploy.db')
  const dir = path.dirname(resolvedPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const db = new Database(resolvedPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations(db)

  dbInstance = db
  console.log(`Database initialized at ${resolvedPath}`)
  return db
}
