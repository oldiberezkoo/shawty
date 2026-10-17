'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { clearCredential, forgetDeviceNonce, getDeviceNonce, loadCredential, saveCredential } from '@/player/credential-store'

type Phase =
  | 'starting'
  | 'waiting'
  | 'exchanging'
  | 'paired'
  | 'expired'
  | 'error'

type StartResponse = {
  sessionId: string
  code: string
  expiresAt: string
  confirmUrl: string
  pollAfterMs: number
  codeInQr: boolean
}

type WatchResponse = {
  sessionId: string
  state: 'pending' | 'confirmed' | 'expired' | 'rejected'
  remainingMs?: number
  codeInQr?: boolean
}

const ENROLLMENT_TOKEN_STORAGE = 'shawty:pending-enrollment'

export function PairingScreen() {
  const [phase, setPhase] = useState<Phase>('starting')
  const [session, setSession] = useState<StartResponse | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [storageWarning, setStorageWarning] = useState(false)

  const socketRef = useRef<WebSocket | null>(null)
  const sessionRef = useRef<StartResponse | null>(null)
  const nonceRef = useRef<string | null>(null)

  const exchange = useCallback(async (enrollmentToken: string) => {
    const start = sessionRef.current
    if (!start || !nonceRef.current) return

    setPhase('exchanging')

    try {
      const response = await fetch('/api/player/pairing/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: start.sessionId,
          deviceNonce: nonceRef.current,
          enrollmentToken,
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        setError(data?.error?.message ?? 'Не удалось получить учётные данные')
        setPhase('error')
        return
      }

      const data = (await response.json()) as {
        deviceId: string
        deviceSecret: string
        credentialVersion: number
        screen: { id: string; companyId: string }
      }

      const kind = await saveCredential({
        deviceId: data.deviceId,
        deviceSecret: data.deviceSecret,
        credentialVersion: data.credentialVersion,
        screenId: data.screen.id,
        companyId: data.screen.companyId,
        issuedAt: new Date().toISOString(),
      })

      if (kind !== 'indexeddb') {
        // Очистка данных браузера на этом устройстве потребует новой привязки.
        // Предупреждаем явно, вместо того чтобы тихо ломаться через месяц.
        setStorageWarning(true)
      }

      forgetDeviceNonce()
      socketRef.current?.close()
      setPhase('paired')

      window.location.replace('/player/display')
    } catch {
      setError('Сервер недоступен')
      setPhase('error')
    }
  }, [])

  const startSession = useCallback(async () => {
    try {
      const { credential } = await loadCredential()
      if (credential) {
        // Экран уже привязан: новую привязку начинать не нужно.
        window.location.replace('/player/display')
        return
      }

      const deviceNonce = await getDeviceNonce()
      nonceRef.current = deviceNonce

      const response = await fetch('/api/player/pairing/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceNonce }),
      })

      if (!response.ok) {
        setError('Не удалось начать привязку. Проверьте подключение к сети.')
        setPhase('error')
        return
      }

      const data = (await response.json()) as StartResponse
      sessionRef.current = data
      setSession(data)
      setRemaining(new Date(data.expiresAt).getTime() - Date.now())
      setPhase('waiting')

      const QR = await import('qrcode')
      const url = await QR.toDataURL(data.confirmUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 320,
        color: { dark: '#17181a', light: '#ffffff' },
      })
      setQrDataUrl(url)
    } catch {
      setError('Не удалось начать привязку')
      setPhase('error')
    }
  }, [])

  useEffect(() => {
    void startSession()
  }, [startSession])

  // Канал устройства: push-подтверждение быстрее опроса и работает,
  // когда телевизор «заснул» по таймеру браузера.
  useEffect(() => {
    const start = sessionRef.current
    if (!start || !nonceRef.current || phase !== 'waiting') return

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws/device`)
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
        const frame = JSON.parse(String(event.data)) as { type: string; enrollmentToken?: string }
        if (frame.type === 'pairing.confirmed' && frame.enrollmentToken) {
          void exchange(frame.enrollmentToken)
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

      try {
        const response = await fetch(`/api/player/pairing/status?sessionId=${encodeURIComponent(start.sessionId)}`)
        if (!response.ok) return

        const data = (await response.json()) as WatchResponse

        if (data.state === 'confirmed') {
          const token = sessionStorage.getItem(ENROLLMENT_TOKEN_STORAGE)
          if (token) {
            void exchange(token)
          }
          // Без push-токена обмен невозможен: nonce не передаётся по HTTP,
          // а канал недоступен. Показываем понятное состояние.
          setPhase('exchanging')
        } else if (data.state === 'expired') {
          setPhase('expired')
        } else if (typeof data.remainingMs === 'number') {
          setRemaining(data.remainingMs)
        }
      } catch {
        // Сеть моргнула: следующий тик попробует снова.
      }
    }, 5000)

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

  const minutes = Math.floor(remaining / 60_000)
  const seconds = Math.floor((remaining % 60_000) / 1000)

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 px-12 py-16 text-center">
      <div>
        <div className="text-[42px] font-semibold tracking-[-0.03em]">SHAWTY</div>
        <div className="mt-2 text-[20px] text-[color:var(--text-muted)]">
          Экран ожидает подключения
        </div>
      </div>

      {phase === 'starting' ? (
        <p className="text-[20px] text-[color:var(--text-subtle)]">Подготовка…</p>
      ) : null}

      {phase === 'waiting' && session ? (
        <>
          <div className="rounded-[16px] bg-white p-5 shadow-[var(--shadow-md)]">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="QR-код для подключения экрана" className="size-[320px]" />
            ) : (
              <div className="size-[320px] animate-pulse rounded-[8px] bg-[color:var(--surface-3)]" />
            )}
          </div>

          <div className="flex flex-col items-center gap-3">
            {session.codeInQr ? (
              <p className="text-[20px] text-[color:var(--text-muted)]">
                Отсканируйте код камерой телефона
              </p>
            ) : (
              <>
                <p className="text-[18px] text-[color:var(--text-muted)]">
                  Отсканируйте QR и введите код на телефоне
                </p>
                <div className="font-mono text-[56px] font-semibold tracking-[0.12em] text-text">
                  {session.code}
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="h-1 w-[320px] overflow-hidden rounded-full bg-[color:var(--surface-3)]">
              <div
                className="h-full bg-[color:var(--text)] transition-[width] duration-1000 ease-linear"
                style={{ width: `${Math.min(100, (remaining / (5 * 60_000)) * 100)}%` }}
              />
            </div>
            <div className="text-[18px] tabular-nums text-[color:var(--text-subtle)]">
              Код действует {minutes}:{String(seconds).padStart(2, '0')}
            </div>
          </div>
        </>
      ) : null}

      {phase === 'exchanging' ? (
        <p className="text-[22px] text-[color:var(--text-muted)]">Подключение подтверждено…</p>
      ) : null}

      {phase === 'paired' ? (
        <p className="text-[22px] text-[color:var(--success)]">Экран подключён</p>
      ) : null}

      {phase === 'expired' ? (
        <div className="flex flex-col items-center gap-6">
          <p className="text-[22px] text-[color:var(--text-muted)]">Время кода истекло</p>
          <button
            type="button"
            onClick={() => {
              setPhase('starting')
              void startSession()
            }}
            className="rounded-[8px] bg-[color:var(--primary)] px-8 py-3.5 text-[18px] font-medium text-[color:var(--primary-text)]"
          >
            Получить новый код
          </button>
        </div>
      ) : null}

      {phase === 'error' ? (
        <div className="flex flex-col items-center gap-6">
          <p className="text-[22px] text-[color:var(--danger)]">{error}</p>
          <button
            type="button"
            onClick={() => {
              setPhase('starting')
              void startSession()
            }}
            className="rounded-[8px] bg-[color:var(--primary)] px-8 py-3.5 text-[18px] font-medium text-[color:var(--primary-text)]"
          >
            Повторить
          </button>
        </div>
      ) : null}

      {storageWarning ? (
        <p className="max-w-[640px] text-[16px] text-[color:var(--warn)]">
          Устройство не поддерживает надёжное долговременное хранение. Очистка данных
          браузера потребует повторной привязки.
        </p>
      ) : null}

      <button
        type="button"
        onClick={async () => {
          await clearCredential()
          forgetDeviceNonce()
          window.location.reload()
        }}
        className="text-[14px] text-[color:var(--text-subtle)] underline underline-offset-4"
      >
        Сбросить привязку
      </button>
    </main>
  )
}
