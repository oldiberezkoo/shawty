import { hmacHex, safeEqual } from '@/lib/crypto'
import { CODE_ALPHABET, normalizeCode } from '@/lib/ids'

/** Сессия привязки в том виде, в котором её видит доменный слой. */
export type PairingSessionRecord = {
  id: string
  codeHash: string
  status: 'pending' | 'confirmed' | 'rejected' | 'expired'
  attempts: number
  maxAttempts: number
  expiresAt: Date
}

export type ConfirmRejection =
  | 'not_found'
  | 'expired'
  | 'invalid_code'
  | 'locked'
  | 'already_confirmed'
  | 'limit_reached'

export type ConfirmDecision = { allowed: true } | { allowed: false; reason: ConfirmRejection }

/**
 * Хеш кода подтверждения.
 *
 * Код в базе не хранится никогда. Соль — идентификатор сессии, поэтому один и тот же
 * код для разных сессий даёт разные хеши: кража таблицы не позволяет перенести
 * код на другую сессию. Проверка кода — единственный барьер, поэтому он HMAC
 * с серверным секретом, а не sha256.
 */
export function hashPairingCode(secret: string, sessionId: string, code: string): string {
  return hmacHex(secret, `pairing:${sessionId}:${normalizeCode(code)}`)
}

export function verifyPairingCode(
  secret: string,
  sessionId: string,
  code: string,
  expectedHash: string,
): boolean {
  return safeEqual(hashPairingCode(secret, sessionId, code), expectedHash)
}

/** Код должен состоять только из символов нашего алфавита и иметь заданную длину. */
export function isWellFormedCode(code: string, expectedLength: number): boolean {
  if (code.length !== expectedLength) return false
  for (const char of code) {
    if (!CODE_ALPHABET.includes(char)) return false
  }
  return true
}

export function isExpired(session: PairingSessionRecord, now: Date): boolean {
  // Строгое «<»: в момент ровно на истечении код ещё действует.
  return session.expiresAt.getTime() < now.getTime()
}

export function isLocked(session: PairingSessionRecord): boolean {
  return session.attempts >= session.maxAttempts
}

/**
 * Адрес подтверждения, который попадает в QR.
 *
 * Важно: это короткоживущий код подтверждения, а не устройственный токен.
 * Он не даёт доступа ни к чему — без пользовательской сессии страница всё равно
 * потребует вход. `code` включается только в «быстром» режиме сервера.
 */
export function buildConfirmUrl(publicUrl: string, sessionId: string, code?: string | null): string {
  const base = `${publicUrl.replace(/\/+$/, '')}/pair/${sessionId}`
  if (!code) return base
  return `${base}?c=${encodeURIComponent(code)}`
}

/**
 * Решение о подтверждении. Чистая функция: ничего не меняет и не ходит в базу.
 *
 * Вызывается внутри транзакции, уже после блокировки строки. Победить гонку
 * может только один: фактическая защита от параллельного подтверждения —
 * условный UPDATE `WHERE status = 'pending'`, а не этот разбор.
 */
export function evaluateConfirm(
  session: PairingSessionRecord | undefined,
  code: string,
  secret: string,
  now: Date,
): ConfirmDecision {
  if (!session) return { allowed: false, reason: 'not_found' }
  if (session.status === 'confirmed') return { allowed: false, reason: 'already_confirmed' }
  if (session.status !== 'pending') return { allowed: false, reason: 'expired' }
  if (isExpired(session, now)) return { allowed: false, reason: 'expired' }

  // Порядок важен: неверный код не должен выдавать информацию о том,
  // что сессия заблокирована или истекла, — иначе перебор можно ускорить,
  // подбирая состояния вместо кода.
  if (!verifyPairingCode(secret, session.id, code, session.codeHash)) {
    return { allowed: false, reason: 'invalid_code' }
  }

  if (isLocked(session)) return { allowed: false, reason: 'locked' }

  return { allowed: true }
}

/** Ответ привязки для телевизора: различаем «ещё ждём» и «уже поздно». */
export type PairingWatchState =
  | { state: 'pending'; remainingMs: number }
  | { state: 'confirmed' }
  | { state: 'expired' }
  | { state: 'rejected'; reason: string }

export function evaluateWatch(
  session: PairingSessionRecord | undefined,
  now: Date,
): PairingWatchState {
  if (!session) return { state: 'expired' }
  if (session.status === 'confirmed') return { state: 'confirmed' }
  if (session.status === 'rejected') return { state: 'rejected', reason: 'rejected' }
  if (session.status === 'expired' || isExpired(session, now) || isLocked(session)) {
    return { state: 'expired' }
  }
  return { state: 'pending', remainingMs: session.expiresAt.getTime() - now.getTime() }
}
