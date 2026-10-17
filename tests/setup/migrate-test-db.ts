/**
 * Подготовка отдельной базы для интеграционных тестов.
 *
 * Тесты бьют по настоящему SQLite: проверять блокировки строк и условные
 * UPDATE на моках бессмысленно — именно на этом держится атомарность привязки.
 *
 * База каждый раз пересоздаётся целиком. Так тесты не зависят от того, какие
 * миграции уже применены, а пересборка схемы не требует ручной чистки.
 */
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

const TEST_DB = resolve(process.cwd(), 'data', 'test.db')

export default async function setup(): Promise<void> {
  process.env.DATABASE_URL = TEST_DB

  mkdirSync(dirname(TEST_DB), { recursive: true })

  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${TEST_DB}${suffix}`, { force: true })
  }

  const connection = new Database(TEST_DB)
  connection.pragma('journal_mode = WAL')
  connection.pragma('foreign_keys = ON')

  migrate(drizzle(connection), { migrationsFolder: resolve(process.cwd(), 'drizzle') })
  connection.close()
}
