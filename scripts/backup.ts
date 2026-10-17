/**
 * Резервная копия.
 *
 * Копируется и база, и список файлов медиатеки. База копируется через
 * `VACUUM INTO`, а не простым копированием файла: при работающем сервере
 * файл может содержать незафиксированные страницы WAL, и такой дамп
 * восстанавливается с ошибками.
 *
 * Сами медиафайлы не копируются — они адресуемы по содержимому и не меняются,
 * поэтому достаточно манифеста: по нему проверяется, что хранилище на месте
 * целиком, а резервную копию файлов снимает внешний бэкап тома.
 *
 * Использование: pnpm db:backup [каталог]
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { db, sqlite } from '../src/db/client'
import { mediaAssets } from '../src/db/schema'

const PROJECT_ROOT = process.cwd()
const MEDIA_ROOT = join(PROJECT_ROOT, 'data', 'media')

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function humanBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} ГБ`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} МБ`
  return `${Math.round(bytes / 1024)} КБ`
}

function main(): void {
  const target = resolve(process.argv[2] ?? join(PROJECT_ROOT, 'data', 'backups'))
  const stamp = timestamp()
  const dir = join(target, stamp)

  mkdirSync(dir, { recursive: true })

  // ── База ────────────────────────────────────────────────────────────────
  const dbPath = join(dir, 'shawty.db')

  // VACUUM INTO делает согласованный снимок, пока сервер работает.
  sqlite.exec(`VACUUM INTO '${dbPath.replace(/'/g, "''")}'`)

  const dbBytes = statSync(dbPath).size

  // ── Манифест медиатеки ──────────────────────────────────────────────────
  const assets = db.select().from(mediaAssets).all()

  const files: { path: string; sha256: string; bytes: number; exists: boolean }[] = []
  let missing = 0

  for (const asset of assets) {
    if (asset.state === 'archived') continue

    const sha = asset.playbackSha256 ?? asset.sha256
    const extension = asset.mime === 'video/mp4' ? 'mp4' : (asset.mime.split('/')[1] ?? 'bin')

    const path = join(MEDIA_ROOT, sha.slice(0, 2), sha.slice(2, 4), `${sha}.${extension}`)
    const exists = existsSync(path)

    if (!exists) missing += 1

    files.push({
      path: relative(MEDIA_ROOT, path).replace(/\\/g, '/'),
      sha256: sha,
      bytes: asset.bytes,
      exists,
    })
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    database: 'shawty.db',
    assets: files.length,
    missingFiles: missing,
    files,
  }

  writeFileSync(join(dir, 'media-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

  // Контрольная сумма: повреждённый бэкап обнаруживается до попытки
  // восстановления, а не во время него.
  const checksum = createHash('sha256')
    .update(readFileSync(dbPath))
    .digest('hex')
  writeFileSync(join(dir, 'CHECKSUMS'), `${checksum}  shawty.db\n`, 'utf8')

  const total = files.reduce((sum, file) => sum + file.bytes, 0)

  console.log(`[backup] каталог: ${dir}`)
  console.log(`[backup] база: ${humanBytes(dbBytes)}`)
  console.log(`[backup] файлов в манифесте: ${files.length}, объёмом ${humanBytes(total)}`)

  if (missing > 0) {
    console.warn(`[backup] ВНИМАНИЕ: ${missing} файлов указано в базе, но отсутствует на диске`)
    console.warn('[backup] восстановление покажет битые ссылки — проверьте хранилище')
  }

  // ── Ротация ─────────────────────────────────────────────────────────────
  const keep = Number(process.env.BACKUP_KEEP ?? 14)
  const backups = readdirSync(target)
    .filter((name) => /^\d{4}-\d{2}-\d{2}T/.test(name))
    .sort()
    .reverse()

  for (const stale of backups.slice(keep)) {
    rmSync(join(target, stale), { recursive: true, force: true })
    console.log(`[backup] удалён старый бэкап ${stale}`)
  }

  console.log('[backup] готово')
}

try {
  main()
} catch (error) {
  console.error('[backup] не удалось:', error instanceof Error ? error.message : error)
  process.exit(1)
}
