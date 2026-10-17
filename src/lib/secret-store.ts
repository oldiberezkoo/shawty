import { existsSync, chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, resolve } from 'node:path'

// turbopackIgnore: секрет — файл на диске, а не артефакт сборки, трассировать его не нужно.
const SECRET_PATH = resolve(/* turbopackIgnore: true */ process.cwd(), 'data', '.secret')
const SECRET_BYTES = 32

let cached: string | null = null

/**
 * Секверный секрет для HMAC-хешей кодов привязки и секретов устройств.
 * Требование: значение стабильно между перезапусками, иначе подтверждённые
 * устройства и живые сессии привязки перестанут валидироваться.
 */
export function loadOrCreateSecret(): string {
  const fromEnv = process.env.SERVER_SECRET
  if (fromEnv && fromEnv.length >= 32) return fromEnv

  if (cached) return cached

  if (existsSync(SECRET_PATH)) {
    const value = readFileSync(SECRET_PATH, 'utf8').trim()
    if (value.length >= 32) {
      cached = value
      return value
    }
  }

  const secret = randomBytes(SECRET_BYTES).toString('hex')
  mkdirSync(dirname(SECRET_PATH), { recursive: true })
  writeFileSync(SECRET_PATH, secret, { encoding: 'utf8', mode: 0o600 })

  // Windows не понимает 0600, на других платформах закрываем файл от других пользователей.
  if (process.platform !== 'win32') {
    try {
      chmodSync(SECRET_PATH, 0o600)
    } catch {
      // Не критично: продолжаем с правами по умолчанию.
    }
  }

  console.warn(
    `[shawty] SERVER_SECRET не задан: создан новый секрет в ${SECRET_PATH}. ` +
      'В продакшене задайте SERVER_SECRET через окружение.',
  )

  cached = secret
  return secret
}
