import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { loadOrCreateSecret } from './secret-store'

/** Случайные байты ОС — источник всех токенов, кодов и идентификаторов. */
export function randomBytesOf(size: number): Buffer {
  return randomBytes(size)
}

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex')
}

export function hmacHex(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

/**
 * Хеш секрета устройства — HMAC с серверным секретом, а не голый sha256.
 * Причина: украденный дамп таблицы не должен позволять проверить перебор
 * токенов офлайн, потому что без серверного секрета HMOM-ключ неизвестен.
 */
export function hashSecret(secret: string): string {
  return hmacHex(loadOrCreateSecret(), secret)
}

/** Сравнение строк за постоянное время. Строки разной длины сразу отвергаются. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

const SCRYPT_KEYLEN = 64
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const

/** Формат хранения: `scrypt$N$r$p$<salt-b64>$<hash-b64>`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password.normalize('NFKC'), salt, SCRYPT_KEYLEN, SCRYPT_PARAMS)
  const { N, r, p } = SCRYPT_PARAMS
  return ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$')
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false

  const salt = Buffer.from(parts[4] ?? '', 'base64')
  const expected = Buffer.from(parts[5] ?? '', 'base64')
  if (salt.length === 0 || expected.length === 0) return false

  const actual = scryptSync(password.normalize('NFKC'), salt, expected.length, { N, r, p })
  return timingSafeEqual(actual, expected)
}
