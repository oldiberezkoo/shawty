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

export function PairingScreen() {
  const [phase, setPhase] = useState<Phase>('starting')
  const [session, setSession] = useState<StartResponse | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [storageWarning, setStorageWarning] = useState(false)
  /** Когда сервер разрешит следующую попытку после 429. */
  const [retryAt, setRetryAt] = useState<number | null>(null)
  const [retryLeftMs, setRetryLeftMs] = useState(0)

  const socketRef = useRef<WebSocket | null>(null)
  const sessionRef = useRef<StartResponse | null>(null)
  const nonceRef = useRef<string | null>(null)
  const startedRef = useRef(false)

  const exchange = useCallback(async () => {
    const start = sessionRef.current
    if (!start || !nonceRef.current) return

    setPhase('exchanging')

    try {
      // Доказательство владения — локальный nonce. Идентификатор сессии из QR
      // знает любой, кто посмотрел на экран, поэтому его недостаточно.
      const response = await fetch('/api/player/pairing/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: start.sessionId,
          deviceNonce: nonceRef.current,
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        const message = data?.error?.message ?? 'Не удалось получить учётные данные'

        // Повторная попытка: устройство могло не успеть обменяться в окно.
        setError(message)
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

      const response = await fetch('/api/player/pairing/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceNonce }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: { code?: string; message?: string; retryAfterMs?: number } }
          | null
        const failure = data?.error

        // 429 — это не «нет сети». Сервер говорит, сколько ждать, и экран
        // обязан это показать: иначе человек решает, что телевизор не видит
        // сервер, и начинает перезагружать страницу, тратя остаток лимита.
        if (response.status === 429) {
          const headerSeconds = Number(response.headers.get('retry-after') ?? '0')
          const retryAfterMs =
            failure?.retryAfterMs && failure.retryAfterMs > 0
              ? failure.retryAfterMs
              : headerSeconds > 0
                ? headerSeconds * 1000
                : 60_000

          setRetryAt(Date.now() + retryAfterMs)
          setRetryLeftMs(retryAfterMs)
        }

        setError(failure?.message ?? 'Не удалось начать привязку. Проверьте подключение к сети.')
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

      try {
        const response = await fetch(`/api/player/pairing/status?sessionId=${encodeURIComponent(start.sessionId)}`)
        if (!response.ok) return

        const data = (await response.json()) as WatchResponse

        if (data.state === 'confirmed') {
          // Канал мог не доставить уведомление: обмен выполняем по HTTP,
          // доказывая владение локальным nonce.
          void exchange()
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
    }, 1800)

    return () => clearTimeout(timer)
  }, [phase, startSession])

  const minutes = Math.floor(remaining / 60_000)
  const seconds = Math.floor((remaining % 60_000) / 1000)

  const retrySeconds = Math.ceil(retryLeftMs / 1000)
  const retryLabel = `${Math.floor(retrySeconds / 60)}:${String(retrySeconds % 60).padStart(2, '0')}`

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
                  Откройте панель SHAWTY → «Подключить экран» и введите этот код
                </p>
                <div className="font-mono text-[56px] font-semibold tracking-[0.12em] text-text">
                  {session.code}
                </div>
                <p className="max-w-[620px] text-[15px] text-[color:var(--text-subtle)]">
                  Код сам обновится, когда истечёт. Ничего нажимать на телевизоре не нужно.
                </p>
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
        <div className="flex flex-col items-center gap-3">
          <p className="text-[22px] text-[color:var(--text-muted)]">Код истёк — готовим новый…</p>
          <p className="text-[16px] text-[color:var(--text-subtle)]">
            Экран обновится автоматически через пару секунд.
          </p>
        </div>
      ) : null}

      {phase === 'error' ? (
        <div className="flex flex-col items-center gap-6">
          <p className="text-[22px] text-[color:var(--danger)]">{error}</p>
          <button
            type="button"
            disabled={retryLeftMs > 0}
            onClick={() => {
              setPhase('starting')
              void startSession()
            }}
            className="rounded-[8px] bg-[color:var(--primary)] px-8 py-3.5 text-[18px] font-medium text-[color:var(--primary-text)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {retryLeftMs > 0 ? `Повторить через ${retryLabel}` : 'Повторить'}
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
