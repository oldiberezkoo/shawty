/** Полный сброс локальной разработки: база и медиа удаляются, затем создаются заново. */
import { rmSync } from 'node:fs'
import { dataPath } from '../src/config/paths'

const targets = [
  dataPath('shawty.db'),
  dataPath('shawty.db-wal'),
  dataPath('shawty.db-shm'),
  dataPath('media'),
  dataPath('tmp'),
]

for (const target of targets) {
  rmSync(target, { recursive: true, force: true })
  console.log(`[db] удалено ${target}`)
}

console.log('[db] сброс завершён. Выполните pnpm db:migrate && pnpm db:seed')
