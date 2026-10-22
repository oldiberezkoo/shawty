import type { DeviceCredential } from '@/player/credential-store'
import type { PlayerManifest } from '@/player/engine'

/** Результат обмена долгоживущего секрета на короткоживущий токен. */
export type TokenExchange =
  | { kind: 'ok'; accessToken: string; expiresAt: number }
  | { kind: 'revoked' }
  | { kind: 'failed' }

/**
 * Обмен секрета устройства на токен.
 *
 * `revoked` — не сетевая ошибка: устройство отвязали или отозвали, и
 * вызывающий обязан стереть локальные данные. Остальные отказы — временные.
 */
export async function exchangeDeviceToken(credential: DeviceCredential): Promise<TokenExchange> {
  const response = await fetch('/api/player/auth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId: credential.deviceId, deviceSecret: credential.deviceSecret }),
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: { code?: string } } | null

    if (data?.error?.code === 'forbidden' || response.status === 403) return { kind: 'revoked' }

    return { kind: 'failed' }
  }

  const data = (await response.json()) as { accessToken: string; expiresAt: string }

  return {
    kind: 'ok',
    accessToken: data.accessToken,
    expiresAt: new Date(data.expiresAt).getTime(),
  }
}

export type StateResponse =
  | { kind: 'ok'; manifest: PlayerManifest | null; appliedVersion: number | null; latencyMs: number }
  | { kind: 'unauthorized'; latencyMs: number }
  | { kind: 'failed'; latencyMs: number }

/** Полная публикация: манифест и версия, которую экран уже применил. */
export async function fetchPlayerState(token: string): Promise<StateResponse> {
  const startedAt = Date.now()
  const response = await fetch('/api/player/state', {
    headers: { authorization: `Bearer ${token}`, 'cache-control': 'no-store' },
  })

  // Замер делаем до всех проверок: медленный ответ — это тоже факт о связи.
  const latencyMs = Date.now() - startedAt

  if (response.status === 401) return { kind: 'unauthorized', latencyMs }
  if (!response.ok) return { kind: 'failed', latencyMs }

  const data = (await response.json()) as {
    manifest: PlayerManifest | null
    appliedVersion: number | null
  }

  return { kind: 'ok', manifest: data.manifest, appliedVersion: data.appliedVersion, latencyMs }
}

export type RevisionResponse =
  | { kind: 'ok'; desiredVersion: number | null; revision: string }
  | { kind: 'unauthorized' }
  | { kind: 'failed' }

/**
 * Лёгкая отметка состояния: меняется ли публикация.
 *
 * Сравнивать нужно именно версию, а не строку отметки: отметка меняется и
 * при служебных обновлениях, а манифест нужен только тогда, когда появилась
 * новая программа.
 */
export async function fetchPlayerRevision(token: string): Promise<RevisionResponse> {
  const response = await fetch('/api/player/state/revision', {
    headers: { authorization: `Bearer ${token}`, 'cache-control': 'no-store' },
  })

  if (response.status === 401) return { kind: 'unauthorized' }
  if (!response.ok) return { kind: 'failed' }

  const data = (await response.json()) as { desiredVersion: number | null; revision: string }

  return { kind: 'ok', desiredVersion: data.desiredVersion, revision: data.revision }
}
