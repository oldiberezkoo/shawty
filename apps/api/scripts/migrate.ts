/**
 * Применяет миграции из ./drizzle к локальной базе.
 * Схема меняется только через drizzle-kit generate + этот скрипт.
 */
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolve } from 'node:path'
import { db, sqlite } from '../src/db/client'

const migrationsFolder = resolve(process.cwd(), 'drizzle')

console.log(`[db] применяю миграции из ${migrationsFolder}`)
migrate(db, { migrationsFolder })
console.log(`[db] миграции применены, схема sqlite_version=${sqlite.pragma('schema_version', { simple: true })}`)
sqlite.close()
