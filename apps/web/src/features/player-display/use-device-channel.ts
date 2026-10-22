'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { normalizeManifest, type PlayerManifest } from '@/player/engine'
import { verifyManifest } from '@/domain/release/verify'
import { logger } from '@/lib/logger'
import { deviceSocketUrl } from '@/lib/ws-url'
import {
  HEARTBEAT_MS,
  PLAYER_VERSION,
  RECONNECT_DELAYS_MS,
  SOCKET_SILENCE_MS,
  WATCHDOG_MS,
  type PlayerPhase,
} from './config'
import { collectCapabilities, collectTelemetry } from './telemetry'

type Options = {
  phase: PlayerPhase
  socketRef: RefObject<WebSocket | null>
  manifestRef: RefObject<PlayerManifest | null>
  stateLatencyMsRef: RefObject<number | null>
  accessTokenRef: RefObject<string | null>
  ensureToken: () => Promise<string | null>
  invalidateToken: () => void
  loadState: (options?: { isRefresh?: boolean }) => Promise<void>
  applyManifest: (manifest: PlayerManifest) => void
  resetFailures: () => void
  clearAndReturnToPairing: () => Promise<void>
  resetBestRtt: () => void
  applyClockSample: (clientAt: number, serverAt: number, receivedAt: number) => boolean
}

/**
 * Канал устройства: кадры сервера, переподключение, heartbeat и сторож.
 *
 * Канал — основной путь доставки публикаций. Он молчит, когда публикаций нет,
 * но молчащий канал и мёртвый канал неразличимы снаружи, поэтому экран сам
 * возвращается в сеть: телевизор спит, сеть меняется, прокси закрывает
 * соединение через несколько часов.
 *
 * Показ при обрыве не прерывается: содержимое уже в памяти, а сообщение
 * «нет связи» на экране в магазине только мешает людям.
 */
export function useDeviceChannel({
  phase,
  socketRef,
  manifestRef,
  stateLatencyMsRef,
  accessTokenRef,
  ensureToken,
  invalidateToken,
  loadState,
  applyManifest,
  resetFailures,
  clearAndReturnToPairing,
  resetBestRtt,
  applyClockSample,
}: Options) {
  /**
   * Время последнего кадра сервера. По нему видно, жив ли канал на самом
   * деле: состояние `OPEN` об этом не говорит.
   */
  const lastFrameAtRef = useRef(Date.now())

  /**
   * Последние измерения связи.
   *
   * Ping считает сам плеер по кадру сервера: кадр несёт время отправки, а
   * разница до ответа — это то, что чувствует телевизор. Задержка запроса
   * состояния дополняет картину: канал может быть быстрым, а сервер — занят.
   */
  const pingMsRef = useRef<number | null>(null)

  const requestClockSync = useCallback(() => {
    const socket = socketRef.current
    if (socket?.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ type: 'clock', at: Date.now() }))
  }, [socketRef])

  /**
   * Разбор входящего кадра.
   *
   * Вынесено из обработчика сокета, потому что кадры приходят и из первого
   * подключения, и из каждого переподключения: одна реализация означает, что
   * восстановление после обрыва не ведёт себя иначе, чем первый запуск.
   */
  const handleDeviceFrame = useCallback(
    (event: MessageEvent) => {
      let frame: {
        type: string
        releaseVersion?: number
        code?: string
        at?: number
        clientAt?: number
        serverAt?: number
      }
      try {
        frame = JSON.parse(String(event.data))
      } catch {
        return
      }

      lastFrameAtRef.current = Date.now()

      if (frame.type === 'hello.ok') {
        // Новый канал — новый лучший замер: старый мог быть снят на плохой
        // сети и больше не отражает текущую задержку.
        resetBestRtt()
        requestClockSync()
        // Каждое (пере)подключение — повод сверить состояние: пока канал был
        // закрыт, публикация могла выйти и не дойти.
        void loadState({ isRefresh: true })
        return
      }

      if (frame.type === 'clock') {
        if (typeof frame.clientAt !== 'number' || typeof frame.serverAt !== 'number') return

        // Пересчитываем таймеры и, если часы разошлись сильнее, чем на
        // один материал, переходим в правильную точку цикла.
        applyClockSample(frame.clientAt, frame.serverAt, Date.now())
        return
      }

      if (frame.type === 'ping') {
        // Обязательный ответ: без него сервер считает канал мёртвым и
        // перезапускает соединение каждые полминуты. Заодно кадр сервера
        // служит точкой отсчёта для оценки задержки.
        if (typeof frame.at === 'number' && Number.isFinite(frame.at)) {
          pingMsRef.current = Math.max(0, Date.now() - frame.at)
        }

        const socket = socketRef.current
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'pong' }))
        return
      }

      if (frame.type === 'assignment') {
        // Манифест пришёл по каналу: применяем его без обращения к серверу.
        const payload = frame as { type: 'assignment'; releaseVersion: number; manifest: unknown }

        // Запоздавший кадр из очереди не должен откатывать экран на старую
        // программу. Сравнение по версии, а не по времени прихода: сеть
        // может переставить два кадра местами.
        const currentVersion = manifestRef.current?.version
        if (currentVersion != null && payload.releaseVersion < currentVersion) return

        // Пустая публикация: показывать нечего. Сразу забираем состояние,
        // чтобы экран перешёл в «ждёт контент», не дожидаясь опроса.
        if (payload.manifest == null) {
          void loadState({ isRefresh: true })
          return
        }

        void (async () => {
          const verdict = await verifyManifest(payload.manifest)

          if (!verdict.ok) {
            // Повреждённый манифест не применяем: лучше старый контент,
            // чем случайный набор файлов на экране в магазине.
            logger.warn({ reason: verdict.reason }, 'манифест отклонён проверкой целостности')
            await loadState()
            return
          }

          applyManifest(normalizeManifest(payload.manifest as PlayerManifest))
        })()

        return
      }

      if (frame.type === 'applied' && frame.releaseVersion !== undefined) {
        // Новая публикация применена: пересчитываем позицию и переключаемся.
        resetFailures()
        void loadState()
        return
      }

      if (frame.type === 'device.rotate') {
        // Секрет обновится на следующем обмене: подставлять новый секрет
        // по команде в кадре нельзя — секрет не должен ходить по сокету.
        invalidateToken()
        void loadState()
        return
      }

      if (frame.type === 'revoke' || frame.code === 'revoked') {
        void clearAndReturnToPairing()
      }
    },
    [
      applyClockSample,
      applyManifest,
      clearAndReturnToPairing,
      invalidateToken,
      loadState,
      manifestRef,
      requestClockSync,
      resetBestRtt,
      resetFailures,
      socketRef,
    ],
  )

  // ── Переподключение канала ────────────────────────────────────────────────

  useEffect(() => {
    // Канал нужен всем рабочим состояниям. Пустой экран ждёт назначения:
    // без сокета он узнал бы о нём только на редком опросе, и оператор
    // решил бы, что телевизор не подхватывает плейлист.
    if (phase !== 'ready' && phase !== 'offline' && phase !== 'empty' && phase !== 'error') return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempt = 0

    const connect = async () => {
      if (cancelled) return

      // Прежний сокет закрыт осознанно, а не обрывом: считать это
      // неудачей подключения нельзя, иначе получится вечный цикл попыток.
      const previous = socketRef.current
      socketRef.current = null
      previous?.close()

      const token = await ensureToken()
      if (!token || cancelled) return

      const socket = new WebSocket(deviceSocketUrl())

      socket.onopen = () => {
        attempt = 0
        lastFrameAtRef.current = Date.now()
        socket.send(JSON.stringify({ type: 'hello', accessToken: accessTokenRef.current }))
      }

      socket.onmessage = (event) => handleDeviceFrame(event)

      socket.onclose = () => {
        if (cancelled) return
        if (socketRef.current === socket) socketRef.current = null

        const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)] ?? 60_000
        attempt += 1

        logger.debug({ attempt, delay }, 'канал устройства закрыт, переподключаемся')
        timer = setTimeout(() => void connect(), delay)
      }
    }

    const start = () => {
      // Уже живой канал не трогаем: он работает, показывать ту же картинку
      // заново незачем.
      if (socketRef.current?.readyState === WebSocket.OPEN) return
      void connect()
    }

    // Первая попытка — сразу, но с задержкой: хук запускается после того,
    // как `onclose` уже успел запланировать своё. Две попытки подряд были бы
    // двумя каналами на один экран.
    timer = setTimeout(start, RECONNECT_DELAYS_MS[0])

    // Возврат вкладки из сна — самый частый повод для проверки: телевизор
    // почти всегда просыпается вместе с сетью. Сразу сверяем состояние,
    // а не ждём следующего опроса.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        start()
        void loadState({ isRefresh: true })
      }
    }

    // Сеть вернулась: канал мог быть закрыт, а публикация — пропущена.
    const onOnline = () => {
      start()
      void loadState({ isRefresh: true })
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [phase, accessTokenRef, ensureToken, handleDeviceFrame, loadState, socketRef])

  // ── Heartbeat и capability profile ────────────────────────────────────────

  useEffect(() => {
    // Heartbeat нужен и пустому экрану: «нет назначенного контента» — это
    // рабочее состояние, и оператор обязан видеть в панели, что телевизор жив
    // и ждёт публикации, а не «нет связи».
    if (phase === 'authenticating' || phase === 'unpaired') return

    const sendHeartbeat = () => {
      const socket = socketRef.current
      if (socket?.readyState !== WebSocket.OPEN) return

      // Часы дрейфуют даже на телевизоре, который неделями не выключали.
      // Перед каждым heartbeat обновляем смещение по самому быстрому замеру.
      requestClockSync()

      socket.send(
        JSON.stringify({
          type: 'heartbeat',
          playerVersion: PLAYER_VERSION,
          appliedVersion: manifestRef.current?.version ?? null,
          storage: { usageBytes: 0, quotaBytes: 0 },
          capabilities: collectCapabilities(),
          telemetry: collectTelemetry(pingMsRef.current, stateLatencyMsRef.current),
        }),
      )
    }

    // Первый heartbeat уходит сразу после выхода в показ: оператор,
    // подключивший экран, должен увидеть связь и замеры, а не ждать полминуты.
    sendHeartbeat()
    const timer = setInterval(sendHeartbeat, HEARTBEAT_MS)

    return () => clearInterval(timer)
  }, [phase, manifestRef, requestClockSync, socketRef, stateLatencyMsRef])

  /**
   * Сторож канала.
   *
   * Браузер может считать сокет открытым, когда он давно мёртв: телевизор
   * уснул, Wi-Fi переключился, прокси тихо выбросил соединение. Сервер шлёт
   * ping каждые полминуты, поэтому молчание дольше трёх интервалов — верный
   * признак обрыва.
   */
  useEffect(() => {
    if (phase !== 'ready' && phase !== 'offline' && phase !== 'empty' && phase !== 'error') return

    const timer = setInterval(() => {
      const socket = socketRef.current
      if (!socket || socket.readyState !== WebSocket.OPEN) return
      if (Date.now() - lastFrameAtRef.current < SOCKET_SILENCE_MS) return

      logger.debug({}, 'канал молчит, перезапускаем соединение')
      socket.close()
      void loadState({ isRefresh: true })
    }, WATCHDOG_MS)

    return () => clearInterval(timer)
  }, [phase, loadState, socketRef])
}
