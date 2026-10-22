'use client'

import { useCallback, useRef } from 'react'
import { clearCredential, loadCredential } from '@/player/credential-store'
import type { DeviceCredential } from '@/player/credential-store'
import { TOKEN_REFRESH_MARGIN_MS, type PlayerPhase } from './config'
import { exchangeDeviceToken } from './player-api'

type Options = {
  setPhase: (phase: PlayerPhase) => void
  setMessage: (message: string | null) => void
}

/**
 * Учётные данные устройства и короткоживущий токен.
 *
 * Постоянный секрет живёт в браузере годами, а токен — минуты: поэтому токен
 * обновляется заранее, а при отзыве устройства стираются локальные данные.
 * Секрет никогда не покидает устройство, кроме обмена на токен.
 */
export function usePlayerAuth({ setPhase, setMessage }: Options) {
  const credentialRef = useRef<DeviceCredential | null>(null)
  const accessTokenRef = useRef<string | null>(null)
  const tokenExpiryRef = useRef(0)

  const invalidateToken = useCallback(() => {
    accessTokenRef.current = null
    tokenExpiryRef.current = 0
  }, [])

  const ensureToken = useCallback(async (): Promise<string | null> => {
    const credential = credentialRef.current
    if (!credential) return null

    // Обновляем заранее: истечение токена посреди показа дало бы разрыв.
    if (accessTokenRef.current && tokenExpiryRef.current - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
      return accessTokenRef.current
    }

    let result: Awaited<ReturnType<typeof exchangeDeviceToken>>

    try {
      result = await exchangeDeviceToken(credential)
    } catch {
      setPhase('offline')
      setMessage('Нет связи с сервером')
      return null
    }

    if (result.kind === 'revoked') {
      // Отозванное или отвязанное устройство обязано стереть локальные данные,
      // иначе оно будет пытаться авторизоваться снова и снова.
      setPhase('unpaired')
      setMessage('Доступ устройства отозван. Обратитесь к администратору.')
      return null
    }

    if (result.kind === 'failed') {
      setPhase('offline')
      setMessage('Нет связи с сервером')
      return null
    }

    accessTokenRef.current = result.accessToken
    tokenExpiryRef.current = result.expiresAt

    return result.accessToken
  }, [setMessage, setPhase])

  /**
   * Загрузка учётных данных при старте.
   *
   * Без секрета экран не привязан — отправляем на страницу привязки, а не
   * показываем ошибку: так сотрудник понимает, что делать.
   */
  const loadCredentialOrRedirect = useCallback(async (): Promise<DeviceCredential | null> => {
    const { credential } = await loadCredential()

    if (!credential) {
      window.location.replace('/player/pairing')
      return null
    }

    credentialRef.current = credential
    return credential
  }, [])

  const clearAndReturnToPairing = useCallback(async () => {
    // Стираем локальные учётные данные: устройство обязано забыть секрет,
    // иначе будет снова и снова пытаться авторизоваться отозванным доступом.
    await clearCredential()
    window.location.replace('/player/pairing')
  }, [])

  return {
    accessTokenRef,
    ensureToken,
    invalidateToken,
    loadCredentialOrRedirect,
    clearAndReturnToPairing,
  }
}
