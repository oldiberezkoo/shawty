'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { deviceSocketUrl } from '@/lib/ws-url'
import {
  clearCredential,
  forgetDeviceNonce,
  getDeviceNonce,
  loadCredential,
  saveCredential,
} from '@/player/credential-store'
import { exchangePairing, fetchPairingStatus, startPairing } from './api'
import type { PairingPhase, PairingSession } from './model'

/** Как часто резервный HTTP-опрос проверяет подтверждение. */
const STATUS_POLL_MS = 5000
/** Пауза перед автоматической выдачей нового кода. */
const RESTART_DELAY_MS = 1800
/** Срок жизни кода: он же масштаб полосы обратного отсчёта. */
const CODE_LIFETIME_MS = 5 * 60_000
/** Размер QR в пикселях: фиксированный, чтобы картинка не «прыгала». */
const QR_SIZE = 320

/**
 * Состояние экрана привязки.
 *
 * Здесь вся механика: старт сессии, канал устройства, резервный опрос,
 * обратный отсчёт и повтор после 429. Экран только рисует то, что вернул хук.
 */
export function usePairing() {
  const [phase, setPhase] = useState<PairingPhase>('starting')
  const [session, setSession] = useState<PairingSession | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [storageWarning, setStorageWarning] = useState(false)
  /** Когда сервер разрешит следующую попытку после 429. */
  const [retryAt, setRetryAt] = useState<number | null>(null)
  const [retryLeftMs, setRetryLeftMs] = useState(0)

  const socketRef = useRef<WebSocket | null>(null)
  const sessionRef = useRef<PairingSession | null>(null)
  const nonceRef = useRef<string | null>(null)
  const startedRef = useRef(false)

  const exchange = useCallback(async () => {
    const start = sessionRef.current
    if (!start || !nonceRef.current) return

    setPhase('exchanging')

    const result = await exchangePairing(start.sessionId, nonceRef.current)

    if (!result.ok) {
      // Повторная попытка: устройство могло не успеть обменяться в окно.
      setError(result.message)
      setPhase('error')
      return
    }

    const kind = await saveCredential({ ...result.credential, issuedAt: new Date().toISOString() })

    if (kind !== 'indexeddb') {
      // Очистка данных браузера на этом устройстве потребует новой привязки.
      // Предупреждаем явно, вместо того чтобы тихо ломаться через месяц.
      setStorageWarning(true)
    }

    forgetDeviceNonce()
    socketRef.current?.close()
    setPhase('paired')

    window.location.replace('/player/display')
  }, [])

  const startSession = useCallback(async () => {
    try {
      setError(null)
      setRetryAt(null)
      setRetryLeftMs(0)
      setQrDataUrl(null)
      setSession(null)
      sessionRef.current = null
      // Прошлый канал привязки больше не нужен: он следил за старым кодом.
      socketRef.current?.close()
      socketRef.current = null

      const { credential } = await loadCredential()
      if (credential) {
        // Экран уже привязан: новую привязку начинать не нужно.
        window.location.replace('/player/display')
        return
      }

      const deviceNonce = await getDeviceNonce()
      nonceRef.current = deviceNonce

      const result = await startPairing(deviceNonce)

      if (!result.ok) {
        if (result.retryAfterMs !== null) {
          setRetryAt(Date.now() + result.retryAfterMs)
          setRetryLeftMs(result.retryAfterMs)
        }

        setError(result.message)
        setPhase('error')
        return
      }

      sessionRef.current = result.session
      setSession(result.session)
      setRemaining(new Date(result.session.expiresAt).getTime() - Date.now())
      setPhase('waiting')

      const QR = await import('qrcode')
      const url = await QR.toDataURL(result.session.confirmUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: QR_SIZE,
        color: { dark: '#17181a', light: '#ffffff' },
      })
      setQrDataUrl(url)
    } catch {
      setError('Не удалось начать привязку')
      setPhase('error')
    }
  }, [])

  useEffect(() => {
    // В разработке React дважды запускает эффекты (StrictMode), а Fast Refresh
    // перезапускает их при каждой правке файла. Старт привязки не идемпотентен:
    // каждая попытка тратит общий лимит на IP, и без этого предохранителя
    // страница за пару перезагрузок сама себя блокировала на 10 минут.
    if (startedRef.current) return
    startedRef.current = true
    void startSession()
  }, [startSession])

  // Ожидание после 429. Когда сервер разрешает попытку, экран повторяет её
  // сам: человек у телевизора не обязан считать минуты и жать «Повторить».
  useEffect(() => {
    if (phase !== 'error' || retryAt === null) return

    const tick = () => {
      const left = retryAt - Date.now()
      setRetryLeftMs(Math.max(0, left))

      if (left <= 0) {
        setRetryAt(null)
        setPhase('starting')
        void startSession()
      }
    }

    tick()
    const timer = setInterval(tick, 1000)

    return () => clearInterval(timer)
  }, [phase, retryAt, startSession])

  // Канал устройства: push-подтверждение быстрее опроса и работает,
  // когда телевизор «заснул» по таймеру браузера.
  useEffect(() => {
    const start = sessionRef.current
    if (!start || !nonceRef.current || phase !== 'waiting') return

    const socket = new WebSocket(deviceSocketUrl())
    socketRef.current = socket

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: 'watch-pairing',
          sessionId: start.sessionId,
          deviceNonce: nonceRef.current,
        }),
      )
    }

    socket.onmessage = (event) => {
      try {
        const frame = JSON.parse(String(event.data)) as { type: string }
        if (frame.type === 'pairing.confirmed') {
          // Кадр не содержит секретов: учётные данные получаем отдельным обменом.
          void exchange()
        }
        if (frame.type === 'pairing.expired') {
          setPhase('expired')
        }
      } catch {
        // Повреждённый кадр игнорируем: опрос ниже всё равно работает.
      }
    }

    return () => {
      socket.close()
    }
  }, [phase, exchange])

  // Резервный опрос: работает, даже если WebSocket недоступен на устройстве.
  useEffect(() => {
    if (phase !== 'waiting') return

    const timer = setInterval(async () => {
      const start = sessionRef.current
      if (!start) return

      const data = await fetchPairingStatus(start.sessionId)
      if (!data) return

      if (data.state === 'confirmed') {
        // Канал мог не доставить уведомление: обмен выполняем по HTTP,
        // доказывая владение локальным nonce.
        void exchange()
      } else if (data.state === 'expired') {
        setPhase('expired')
      } else if (typeof data.remainingMs === 'number') {
        setRemaining(data.remainingMs)
      }
    }, STATUS_POLL_MS)

    return () => clearInterval(timer)
  }, [phase, exchange])

  // Обратный отсчёт на экране: человек должен видеть, сколько осталось.
  useEffect(() => {
    if (phase !== 'waiting') return

    const timer = setInterval(() => {
      setRemaining((current) => Math.max(0, current - 1000))
    }, 1000)

    return () => clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (phase === 'waiting' && remaining <= 0) {
      setPhase('expired')
    }
  }, [phase, remaining])

  /**
   * Истёкший код обновляется сам.
   *
   * Человек у телевизора не должен искать кнопку «получить новый код»: он
   * пришёл с телефоном, а не за пультом. Небольшая пауза нужна, чтобы экран
   * не мигал между кодами и оператор успел увидеть, что произошло.
   */
  useEffect(() => {
    if (phase !== 'expired') return

    const timer = setTimeout(() => {
      setPhase('starting')
      void startSession()
    }, RESTART_DELAY_MS)

    return () => clearTimeout(timer)
  }, [phase, startSession])

  const retry = useCallback(() => {
    setPhase('starting')
    void startSession()
  }, [startSession])

  const reset = useCallback(async () => {
    await clearCredential()
    forgetDeviceNonce()
    window.location.reload()
  }, [])

  const minutes = Math.floor(remaining / 60_000)
  const seconds = Math.floor((remaining % 60_000) / 1000)
  const retrySeconds = Math.ceil(retryLeftMs / 1000)

  return {
    phase,
    session,
    qrDataUrl,
    error,
    storageWarning,
    retryLeftMs,
    retryLabel: `${Math.floor(retrySeconds / 60)}:${String(retrySeconds % 60).padStart(2, '0')}`,
    minutes,
    paddedSeconds: String(seconds).padStart(2, '0'),
    /** Ширина полосы обратного отсчёта в процентах. */
    codeProgressPercent: Math.min(100, (remaining / CODE_LIFETIME_MS) * 100),
    retry,
    reset,
  }
}
