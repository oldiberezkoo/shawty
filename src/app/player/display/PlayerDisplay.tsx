'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  decideAfterFailure,
  normalizeManifest,
  positionForInstant,
  type PlaybackPosition,
  type PlayerManifest,
} from '@/player/engine'
import { clearCredential, loadCredential } from '@/player/credential-store'
import type { DeviceCredential } from '@/player/credential-store'

/**
 * Экран воспроизведения.
 *
 * Требование продукта — «подключил телевизор и забыл на год». Отсюда решения:
 *
 * - Показ не останавливается никогда. Ошибка сети, файла или сервера не должна
 *   оставлять экран чёрным: худшее, что случится, — экран ошибки.
 * - После перезагрузки страницы показ продолжается с того же места, а не
 *   начинается заново: часы на телевизоре для этого ненадёжны, поэтому позиция
 *   считается от времени начала публикации.
 * - Короткоживущий токен обновляется сам. Постоянный секрет в браузере живёт
 *   годами, а токен — минуты.
 * - Таймеры не дают экрану уснуть: без этого телевизор гасит картинку через
 *   несколько минут простоя, и оператор увидит «экран сломан».
 */

type Phase = 'authenticating' | 'ready' | 'offline' | 'error' | 'unpaired' | 'empty'

const ACCESS_TOKEN_TTL_MS = 10 * 60_000
const TOKEN_REFRESH_MARGIN_MS = 60_000

export function PlayerDisplay() {
  const [phase, setPhase] = useState<Phase>('authenticating')
  const [message, setMessage] = useState<string | null>(null)

  const manifestRef = useRef<PlayerManifest | null>(null)
  const positionRef = useRef<PlaybackPosition>({ itemIndex: 0, offsetMs: 0 })
  const [item, setItem] = useState<PlayerManifest['items'][number] | null>(null)
  const [itemIndex, setItemIndex] = useState(0)

  const failuresRef = useRef(0)
  const credentialRef = useRef<DeviceCredential | null>(null)
  const accessTokenRef = useRef<string | null>(null)
  const tokenExpiryRef = useRef(0)
  const socketRef = useRef<WebSocket | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  // ── Учётные данные и токен ────────────────────────────────────────────────

  const exchangeForToken = useCallback(async (credential: DeviceCredential): Promise<string> => {
    const response = await fetch('/api/player/auth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: credential.deviceId, deviceSecret: credential.deviceSecret }),
    })

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: { code?: string } } | null

      // Отозванное или отвязанное устройство обязано стереть локальные данные,
      // иначе оно будет пытаться авторизоваться снова и снова.
      if (data?.error?.code === 'forbidden' || response.status === 403) {
        return ''
      }

      throw new Error('token_exchange_failed')
    }

    const data = (await response.json()) as { accessToken: string; expiresAt: string }
    accessTokenRef.current = data.accessToken
    tokenExpiryRef.current = new Date(data.expiresAt).getTime()
    return data.accessToken
  }, [])

  const ensureToken = useCallback(async (): Promise<string | null> => {
    const credential = credentialRef.current
    if (!credential) return null

    // Обновляем заранее: истечение токена посреди показа дало бы разрыв.
    if (accessTokenRef.current && tokenExpiryRef.current - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
      return accessTokenRef.current
    }

    try {
      const token = await exchangeForToken(credential)
      if (!token) {
        setPhase('unpaired')
        setMessage('Доступ устройства отозван. Обратитесь к администратору.')
        return null
      }
      return token
    } catch {
      setPhase('offline')
      setMessage('Нет связи с сервером')
      return null
    }
  }, [exchangeForToken])

  // ── Загрузка публикации ──────────────────────────────────────────────────

  const loadState = useCallback(async (): Promise<void> => {
    const token = await ensureToken()
    if (!token) return

    try {
      const response = await fetch('/api/player/state', {
        headers: { authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        setPhase('offline')
        return
      }

      const data = (await response.json()) as {
        manifest: PlayerManifest | null
        appliedVersion: number | null
      }

      const manifest = data.manifest ? normalizeManifest(data.manifest) : null
      manifestRef.current = manifest

      if (!manifest || manifest.items.length === 0) {
        setPhase('empty')
        return
      }

      setPhase('ready')

      // Позиция считается от времени начала показа на сервере: переживает
      // перезагрузку страницы и неточные часы телевизора.
      const position = positionForInstant(manifest.items, manifest.since, new Date())

      if (position) {
        positionRef.current = position
        setItemIndex(position.itemIndex)
        setItem(manifest.items[position.itemIndex] ?? manifest.items[0] ?? null)
      }
    } catch {
      setPhase('offline')
    }
  }, [ensureToken])

  // ── Канал устройства ──────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function start() {
      const { credential } = await loadCredential()

      if (!credential) {
        // Нет учётных данных: экран не привязан. Отправляем на экран привязки,
        // а не показываем ошибку — так сотрудник понимает, что делать.
        window.location.replace('/player/pairing')
        return
      }

      credentialRef.current = credential

      const token = await ensureToken()
      if (!token || cancelled) return

      await loadState()

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const socket = new WebSocket(`${protocol}://${window.location.host}/ws/device`)
      socketRef.current = socket

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'hello', accessToken: accessTokenRef.current }))
      }

      socket.onmessage = (event) => {
        let frame: { type: string; releaseVersion?: number; code?: string; reauth?: boolean }
        try {
          frame = JSON.parse(String(event.data))
        } catch {
          return
        }

        if (frame.type === 'applied' && frame.releaseVersion !== undefined) {
          // Новая публикация применена: пересчитываем позицию и переключаемся.
          failuresRef.current = 0
          void loadState()
          return
        }

        if (frame.type === 'device.rotate') {
          // Секрет обновится на следующем обмене: подставлять новый секрет
          // по команде в кадре нельзя — секрет не должен ходить по сокету.
          accessTokenRef.current = null
          void loadState()
          return
        }

        if (frame.type === 'revoke' || frame.code === 'revoked') {
          void clearAndReturnToPairing()
          return
        }
      }

      socket.onclose = () => {
        // Показ не прерываем: reconnect переподключит канал, а содержимое
        // уже в памяти. Отсутствие связи — самостоятельное состояние экрана.
        if (!cancelled) setPhase((current) => (current === 'ready' ? current : 'offline'))
      }
    }

    void start()

    return () => {
      cancelled = true
      socketRef.current?.close()
    }
    // Один раз на всё время жизни экрана: дальше состояние ведёт себя само.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clearAndReturnToPairing = useCallback(async () => {
    // Стираем локальные учётные данные: устройство обязано забыть секрет,
    // иначе будет снова и снова пытаться авторизоваться отозванным доступом.
    await clearCredential()
    window.location.replace('/player/pairing')
  }, [])

  // ── Heartbeat и capability profile ────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'ready') return

    const timer = setInterval(() => {
      const socket = socketRef.current
      if (socket?.readyState !== WebSocket.OPEN) return

      socket.send(
        JSON.stringify({
          type: 'heartbeat',
          playerVersion: PLAYER_VERSION,
          appliedVersion: manifestRef.current?.version ?? null,
          storage: { usageBytes: 0, quotaBytes: 0 },
          capabilities: collectCapabilities(),
        }),
      )
    }, 30_000)

    return () => clearInterval(timer)
  }, [phase])

  // ── Wake Lock ─────────────────────────────────────────────────────────────

  useEffect(() => {
    // Без Wake Lock телевизор гасит экран через несколько минут простоя,
    // и оператор решает, что устройство сломалось.
    let released = false

    async function acquire() {
      try {
        if (!('wakeLock' in navigator)) return
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      } catch {
        // Запрос может быть отклонён без видимой пользователю причины —
        // например, на экране, который система считает активным.
      }
    }

    void acquire()

    const onVisibility = async () => {
      if (document.visibilityState === 'visible' && !released) void acquire()
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisibility)
      void wakeLockRef.current?.release().catch(() => {})
    }
  }, [])

  // ── Полноэкранный режим ──────────────────────────────────────────────────

  useEffect(() => {
    const enter = async () => {
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen()
        }
      } catch {
        // Полный экран может быть запрещён политикой браузера на ТВ.
      }
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'f') void enter()
    }

    void enter()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Показ ─────────────────────────────────────────────────────────────────

  // Таймер перехода живёт здесь, а не в отдельном компоненте: он обязан
  // пересоздаваться при смене материала, иначе длительность нового слайда
  // применялась бы к таймеру предыдущего.
  useEffect(() => {
    if (phase !== 'ready') return

    const manifest = manifestRef.current
    const current = manifest?.items[itemIndex]
    if (!manifest || !current) return

    const timer = setTimeout(() => {
      failuresRef.current = 0
      const next = itemIndex + 1 >= manifest.items.length ? 0 : itemIndex + 1
      setItemIndex(next)
      setItem(manifest.items[next] ?? null)
    }, current.durationMs)

    return () => clearTimeout(timer)
  }, [itemIndex, phase])

  /** Ошибка файла: пропускаем материал, но не останавливаем показ. */
  const onItemError = useCallback(() => {
    const manifest = manifestRef.current
    if (!manifest) {
      setPhase('error')
      return
    }

    const decision = decideAfterFailure(manifest.items, positionRef.current, failuresRef.current)

    if (decision.action === 'show_error') {
      setPhase('error')
      return
    }

    failuresRef.current += 1
    setItemIndex(decision.position.itemIndex)
    setItem(manifest.items[decision.position.itemIndex] ?? null)
  }, [])

  const appliedVersionRef = useRef<number | null>(null)

  /**
   * Подтверждение применения.
   *
   * Отправляется один раз на версию публикации: панель считает экран в числе
   * «применили» именно по этому событию. Повторные подтверждения того же
   * манифеста только засоряли бы журнал доставки.
   */
  useEffect(() => {
    if (phase !== 'ready') return

    const manifest = manifestRef.current
    if (!manifest) return

    if (appliedVersionRef.current === manifest.version) return

    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return

    socket.send(
      JSON.stringify({
        type: 'applied',
        releaseVersion: manifest.version,
        manifestHash: manifest.manifestHash,
      }),
    )

    appliedVersionRef.current = manifest.version
  }, [phase, itemIndex])

  if (phase !== 'ready' || !item) {
    return <PlayerStateScreen phase={phase} message={message} />
  }

  return (
    <main className="fixed inset-0 size-full overflow-hidden bg-black">
      {item.kind === 'video' ? (
        <video
          key={item.id}
          src={item.url}
          autoPlay
          muted={item.audio === 'mute'}
          playsInline
          onError={onItemError}
          className="size-full object-contain"
        />
      ) : (
        // Изображение вписывается целиком: обрезка рекламы недопустима.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={item.id}
          src={item.url}
          alt=""
          onError={onItemError}
          className="size-full bg-black object-contain"
        />
      )}
    </main>
  )
}

const PLAYER_VERSION = '0.1.0'

/**
 * Профиль возможностей устройства.
 *
 * Требуется различать подтверждённое и неизвестное: браузер не всегда умеет
 * сообщить о кодеке, и выдумывать это нельзя.
 */
function collectCapabilities(): Record<string, unknown> {
  const video = typeof document !== 'undefined' ? document.createElement('video') : null

  return {
    codecs: video
      ? {
          h264: video.canPlayType('video/mp4; codecs="avc1.42E01E"'),
          aac: video.canPlayType('audio/mp4; codecs="mp4a.40.2"'),
          vp9: video.canPlayType('video/webm; codecs="vp9"'),
          // unknown, а не false: браузер мог просто не ответить.
          h265: video.canPlayType('video/mp4; codecs="hvc1"') || 'unknown',
        }
      : 'unknown',
    screen: {
      width: window.screen?.width ?? null,
      height: window.screen?.height ?? null,
      devicePixelRatio: window.devicePixelRatio ?? null,
    },
    fullscreen: typeof document !== 'undefined' && Boolean(document.fullscreenEnabled),
    wakeLock: typeof navigator !== 'undefined' && 'wakeLock' in navigator,
    indexedDb: typeof indexedDB !== 'undefined',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    // Явная метка: часть полей мы не смогли определить.
    probe: 'partial',
  }
}

/**
 * Экраны состояний.
 *
 * Белый квадрат оператор видит как поломку устройства. Поэтому вместо
 * пустоты показываем понятный текст и дату — сразу видно, что экран жив.
 */
function PlayerStateScreen({ phase, message }: { phase: Phase; message: string | null }) {
  const texts: Record<Phase, { title: string; hint?: string }> = {
    authenticating: { title: 'Подключение…' },
    ready: { title: 'Подготовка показа' },
    empty: { title: 'Нет назначенного контента', hint: 'Оператор ещё не опубликовал плейлист для этого экрана' },
    offline: { title: 'Нет связи', hint: 'Показ продолжится, когда сеть вернётся' },
    error: { title: 'Ошибка воспроизведения', hint: 'Проверьте файлы плейлиста в панели' },
    unpaired: { title: 'Требуется привязка', hint: message ?? 'Обратитесь к администратору' },
  }

  const content = texts[phase]

  return (
    <main className="flex size-full flex-col items-center justify-center gap-4 bg-[#0b0b0c] px-12 text-center text-white">
      <div className="text-[56px] font-semibold tracking-[-0.02em]">SHAWTY</div>
      <div className="text-[34px] text-white/80">{content.title}</div>
      {content.hint ? <div className="max-w-[1100px] text-[24px] text-white/50">{content.hint}</div> : null}
      {phase === 'offline' || phase === 'error' ? (
        <div className="mt-4 text-[20px] tabular-nums text-white/30">
          {new Date().toLocaleString('ru-RU')}
        </div>
      ) : null}
    </main>
  )
}
