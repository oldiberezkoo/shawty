import type { PairingSession, PairingStatus } from './model'

const DEFAULT_RETRY_MS = 60_000

const START_NETWORK_MESSAGE = 'Не удалось начать привязку. Проверьте подключение к сети.'
const START_UNAVAILABLE_MESSAGE = 'Не удалось начать привязку'
const EXCHANGE_FAILED_MESSAGE = 'Не удалось получить учётные данные'

export type StartPairingResult =
  | { ok: true; session: PairingSession }
  | { ok: false; message: string; retryAfterMs: number | null }

/**
 * Начать сессию привязки.
 *
 * 429 — это не «нет сети»: сервер говорит, сколько ждать, и экран обязан это
 * показать. Иначе человек решает, что телевизор не видит сервер, и начинает
 * перезагружать страницу, тратя остаток лимита.
 */
export async function startPairing(deviceNonce: string): Promise<StartPairingResult> {
  try {
    const response = await fetch('/api/player/pairing/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceNonce }),
    })

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        error?: { code?: string; message?: string; retryAfterMs?: number }
      } | null
      const failure = data?.error

      let retryAfterMs: number | null = null

      if (response.status === 429) {
        const headerSeconds = Number(response.headers.get('retry-after') ?? '0')

        retryAfterMs =
          failure?.retryAfterMs && failure.retryAfterMs > 0
            ? failure.retryAfterMs
            : headerSeconds > 0
              ? headerSeconds * 1000
              : DEFAULT_RETRY_MS
      }

      return {
        ok: false,
        message: failure?.message ?? START_NETWORK_MESSAGE,
        retryAfterMs,
      }
    }

    return { ok: true, session: (await response.json()) as PairingSession }
  } catch {
    return { ok: false, message: START_UNAVAILABLE_MESSAGE, retryAfterMs: null }
  }
}

/**
 * Состояние сессии привязки.
 *
 * Резервный путь на случай, когда WebSocket недоступен: любой сбой означает
 * «пока нет ответа», следующий тик попробует снова.
 */
export async function fetchPairingStatus(sessionId: string): Promise<PairingStatus | null> {
  try {
    const response = await fetch(`/api/player/pairing/status?sessionId=${encodeURIComponent(sessionId)}`)

    if (!response.ok) return null

    return (await response.json()) as PairingStatus
  } catch {
    return null
  }
}

/** Учётные данные, которые экран сохраняет после обмена. */
export type PairingCredential = {
  deviceId: string
  deviceSecret: string
  credentialVersion: number
  screenId: string
  companyId: string
}

export type ExchangePairingResult =
  | { ok: true; credential: PairingCredential }
  | { ok: false; message: string }

/**
 * Обмен подтверждённой сессии на учётные данные экрана.
 *
 * Доказательство владения — локальный nonce: идентификатор сессии из QR знает
 * любой, кто посмотрел на экран, поэтому его недостаточно.
 */
export async function exchangePairing(
  sessionId: string,
  deviceNonce: string,
): Promise<ExchangePairingResult> {
  try {
    const response = await fetch('/api/player/pairing/exchange', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, deviceNonce }),
    })

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        error?: { message?: string }
      } | null

      return { ok: false, message: data?.error?.message ?? EXCHANGE_FAILED_MESSAGE }
    }

    const data = (await response.json()) as {
      deviceId: string
      deviceSecret: string
      credentialVersion: number
      screen: { id: string; companyId: string }
    }

    return {
      ok: true,
      credential: {
        deviceId: data.deviceId,
        deviceSecret: data.deviceSecret,
        credentialVersion: data.credentialVersion,
        screenId: data.screen.id,
        companyId: data.screen.companyId,
      },
    }
  } catch {
    return { ok: false, message: 'Сервер недоступен' }
  }
}
