/**
 * Подготовка отдельной базы для интеграционных тестов.
 *
 * Тесты бьют по настоящему SQLite: проверять блокировки строк и условные
 * UPDATE на моках бессмысленно — именно на этом держится атомарность привязки.
 */
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolve as resolvePath } from 'node:path'

const TEST_DB = resolve(process.cwd(), 'data', 'test.db')

export default async function setup(): Promise<void> {
  process.env.DATABASE_URL = TEST_DB
  mkdirSync(dirname(TEST_DB), { recursive: true })

  const connection = new Database(TEST_DB)
  connection.pragma('journal_mode = WAL')
  connection.pragma('foreign_keys = ON')

  migrate(drizzle(connection), { migrationsFolder: resolvePath(process.cwd(), 'drizzle') })
  connection.close()
}
