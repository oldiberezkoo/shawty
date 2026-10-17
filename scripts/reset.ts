/** Полный сброс локальной разработки: база и медиа удаляются, затем создаются заново. */
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

const targets = [resolve(process.cwd(), 'data', 'shawty.db'), resolve(process.cwd(), 'data', 'shawty.db-wal'), resolve(process.cwd(), 'data', 'shawty.db-shm'), resolve(process.cwd(), 'data', 'media'), resolve(process.cwd(), 'data', 'tmp')]

for (const target of targets) {
  rmSync(target, { recursive: true, force: true })
  console.log(`[db] удалено ${target}`)
}

console.log('[db] сброс завершён. Выполните pnpm db:migrate && pnpm db:seed')
