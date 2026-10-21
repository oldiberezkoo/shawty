'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { clearCredential, forgetDeviceNonce, getDeviceNonce, loadCredential, saveCredential } from '@/player/credential-store'
import { deviceSocketUrl } from '@/lib/ws-url'
import { Button } from '@/components/ui/button'
import { Dither } from '@/components/visual/dither'
import { Lockup } from '@/components/visual/lockup'

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
    // Экран привязки — часть телевизора, а не панели: он всегда тёмный,
    // независимо от темы интерфейса. Иначе на светлой теме телевизор в
    // магазине показывал бы белое поле вместо кода.
    <main className="dark relative flex min-h-dvh flex-col overflow-hidden bg-[#0a0a0a] px-6 py-6 text-white sm:px-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%] opacity-25 [mask-image:linear-gradient(to_top,#000_10%,transparent_78%)]"
      >
        <Dither scene="flow" focus={0.45} cell={3} />
      </div>

      <header className="relative z-10 flex items-center justify-between gap-4 border-b border-white/10 pb-4">
        <Lockup size={20} chip={null} />
        <span className="font-mono text-[10.5px] tracking-[0.16em] text-white/40 uppercase sm:text-[11.5px]">
          Pairing · привязка
        </span>
      </header>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 py-8 text-center">
        <div className="max-w-[620px]">
          <p className="mb-4 font-mono text-[11px] tracking-[0.12em] text-white/35 uppercase">
            [01] Подключение
          </p>

          <h1 className="text-[30px] leading-[1.06] font-medium tracking-[-0.035em] text-balance sm:text-[40px]">
            {phase === 'waiting' ? (
              session?.codeInQr ? (
                <>
                  Отсканируйте <em className="text-primary not-italic">QR-код</em>
                </>
              ) : (
                <>
                  Введите <em className="text-primary not-italic">код</em> в панели
                </>
              )
            ) : phase === 'exchanging' ? (
              'Подключение подтверждено'
            ) : phase === 'paired' ? (
              'Экран подключён'
            ) : phase === 'expired' ? (
              'Код истёк'
            ) : phase === 'error' ? (
              'Не удалось привязать экран'
            ) : (
              'Экран ожидает подключения'
            )}
          </h1>

          <p className="mx-auto mt-4 max-w-[56ch] text-[14px] leading-relaxed text-white/45 sm:text-[15.5px]">
            {phase === 'waiting' && session?.codeInQr
              ? 'Наведите камеру телефона. Код сам обновится, когда истечёт.'
              : phase === 'waiting'
                ? 'Панель → «Подключить экран». Код обновится сам, нажимать на телевизоре ничего не нужно.'
                : phase === 'exchanging'
                  ? 'Получаем учётные данные экрана.'
                  : phase === 'paired'
                    ? 'Открываем показ.'
                    : phase === 'expired'
                      ? 'Экран обновится автоматически через пару секунд.'
                      : phase === 'error'
                        ? 'Проверьте подключение к сети и повторите попытку.'
                        : 'Готовим код привязки.'}
          </p>
        </div>

        {phase === 'starting' ? (
          <div className="flex items-center gap-2.5 font-mono text-[12px] tracking-[0.1em] text-white/45 uppercase">
            <span className="block size-2 animate-pulse bg-primary" />
            Подготовка…
          </div>
        ) : null}

        {phase === 'waiting' && session ? (
          <>
            <div className="border border-white/20 bg-white p-4 sm:p-5">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt="QR-код для подключения экрана"
                  className="size-[min(66vw,300px)] sm:size-[320px]"
                />
              ) : (
                <div className="size-[min(66vw,300px)] animate-pulse bg-[#e8e8e5] sm:size-[320px]" />
              )}
            </div>

            {session.codeInQr ? null : (
              <div className="flex flex-col items-center gap-4">
                <div className="tnum font-mono text-[46px] leading-none font-normal tracking-[0.18em] text-white sm:text-[58px]">
                  {session.code}
                </div>

                <div className="flex flex-col items-center gap-2">
                  <div className="h-1.5 w-[min(72vw,360px)] overflow-hidden bg-white/12">
                    <div
                      className="h-full bg-primary transition-[width] duration-1000 ease-linear"
                      style={{ width: `${Math.min(100, (remaining / (5 * 60_000)) * 100)}%` }}
                    />
                  </div>
                  <div className="tnum font-mono text-[11.5px] tracking-[0.1em] text-white/40 uppercase">
                    Код действует {minutes}:{String(seconds).padStart(2, '0')}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : null}

        {phase === 'exchanging' ? (
          <div className="flex items-center gap-2.5 font-mono text-[12px] tracking-[0.1em] text-primary uppercase">
            <span className="block size-2 animate-pulse bg-primary" />
            Подключение подтверждено…
          </div>
        ) : null}

        {phase === 'paired' ? (
          <div className="flex items-center gap-2.5 border border-white/15 px-4 py-2.5 font-mono text-[12px] tracking-[0.1em] text-white uppercase">
            <span className="block size-2 bg-white" />
            Экран подключён
          </div>
        ) : null}

        {phase === 'expired' ? (
          <div className="flex items-center gap-2.5 font-mono text-[12px] tracking-[0.1em] text-white/45 uppercase">
            <span className="block size-2 border border-white/40" />
            Готовим новый код…
          </div>
        ) : null}

        {phase === 'error' ? (
          <div className="w-full max-w-[560px] border border-white bg-white px-5 py-4 text-left text-[#0a0a0a]">
            <div className="mb-1 font-mono text-[10px] tracking-[0.12em] uppercase opacity-50">
              Ошибка
            </div>
            <p className="text-[14.5px] leading-relaxed">{error}</p>
          </div>
        ) : null}

        {phase === 'error' ? (
          <Button
            variant="primary"
            size="lg"
            disabled={retryLeftMs > 0}
            onClick={() => {
              setPhase('starting')
              void startSession()
            }}
          >
            {retryLeftMs > 0 ? `Повторить через ${retryLabel}` : 'Повторить'}
          </Button>
        ) : null}

        {storageWarning ? (
          <p className="max-w-[560px] border-l-[3px] border-l-white/40 bg-white/[0.04] px-4 py-3 text-left text-[12px] leading-relaxed text-white/55">
            Устройство не поддерживает надёжное долговременное хранение. Очистка данных браузера
            потребует повторной привязки.
          </p>
        ) : null}
      </div>

      <footer className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 font-mono text-[10.5px] tracking-[0.1em] text-white/40 uppercase sm:text-[11px]">
        <span>Экран не требует нажатий · код обновляется сам</span>

        <button
          type="button"
          onClick={async () => {
            await clearCredential()
            forgetDeviceNonce()
            window.location.reload()
          }}
          className="tracking-[0.1em] underline underline-offset-4 transition-colors hover:text-white/70"
        >
          Сбросить привязку
        </button>
      </footer>
    </main>
  )
}
