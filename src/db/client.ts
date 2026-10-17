import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export type Database_ = BetterSQLite3Database<typeof schema>

function resolveDbPath(): string {
  const configured = process.env.DATABASE_URL ?? './data/shawty.db'
  // Относительный путь задаём от корня проекта, а не от текущего каталога процесса.
  return configured === ':memory:' ? configured : resolve(process.cwd(), configured)
}

function openConnection(): Database.Database {
  const path = resolveDbPath()

  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true })
  }

  const connection = new Database(path)

  // WAL обязателен: плееры пишут события и heartbeat постоянно, а читателей дашборда много.
  if (path !== ':memory:') {
    connection.pragma('journal_mode = WAL')
  }
  // Ждём освобождения блокировки вместо мгновенной ошибки при параллельной записи.
  connection.pragma('busy_timeout = 5000')
  // Каскады и ограничения должны работать: часть логики на них опирается.
  connection.pragma('foreign_keys = ON')
  // Компромисс: WAL + NORMAL достаточно быстры для потока событий и не даёт
  // fsync на каждый кадр. Если появится требование нулевой потери — переходим на FULL.
  connection.pragma('synchronous = NORMAL')

  return connection
}

// В dev Next перезагружает модули: соединение держим в globalThis,
// иначе на каждый запрос открывается новый handle и мы упираемся в лимит файлов.
const globalForDb = globalThis as unknown as {
  __shawtySqlite?: Database.Database
  __shawtyDb?: Database_
}

function getConnection(): Database.Database {
  globalForDb.__shawtySqlite ??= openConnection()
  return globalForDb.__shawtySqlite
}

export const sqlite: Database.Database = getConnection()

export const db: Database_ = globalForDb.__shawtyDb ?? drizzle(getConnection(), { schema })

if (!globalForDb.__shawtyDb) {
  globalForDb.__shawtyDb = db
}

/**
 * Синхронная транзакция. better-sqlite3 выполняет её целиком на одном соединении,
 * поэтому BEGIN IMMEDIATE надёжно берёт блокировку записи сразу, без гонок
 * на уровне SQLITE_BUSY. Этим пользуется подтверждение привязки.
 */
export function withImmediateTransaction<T>(fn: (tx: Database_) => T): T {
  return db.transaction(fn).immediate()
}

export function nowMs(): number {
  return Date.now()
}

export { schema }
