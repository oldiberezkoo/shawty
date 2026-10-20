'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  decideAfterFailure,
  normalizeManifest,
  positionForInstant,
  refreshManifestUrls,
  type PlaybackPosition,
  type PlayerManifest,
} from '@/player/engine'
import { verifyManifest } from '@/domain/release/verify'
import { logger } from '@/lib/logger'
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

/** За сколько до истечения обновляем короткоживущий токен. */
const TOKEN_REFRESH_MARGIN_MS = 60_000

/**
 * Как часто экран повторяет попытку, когда сервер недоступен.
 *
 * Короче основного интервала, потому что «нет связи» — это ждущее состояние,
 * а не итоговое: сеть в магазине может вернуться через минуту, и оператор не
 * должен перезагружать телевизор вручную, чтобы вернуть рекламу на экран.
 */
const OFFLINE_RETRY_MS = 15_000

/**
 * Как часто экран проверяет отметку состояния.
 *
 * Первый механизм — канал: публикация приходит кадром за секунды. Второй —
 * этот опрос: если сокет молчит, уснул или его закрыл прокси, экран сам
 * заметит новую публикацию за считаные секунды. Отметка весит десятки байт,
 * поэтому частый опрос дешёв, в отличие от полного манифеста.
 */
const REVISION_POLL_MS = 10_000

/**
 * Сколько ждать кадров сервера, прежде чем признать канал мёртвым.
 *
 * Сервер шлёт `ping` каждые полминуты. Если за три интервала не пришло
 * ничего, соединение считается оборванным, даже если браузер показывает
 * `OPEN`: так бывает, когда телевизор вышел из сна или сеть сменилась.
 */
const SOCKET_SILENCE_MS = 90_000

/**
 * Задержки до следующей попытки переподключения, миллисекунды.
 *
 * Список, а не формула: ограничение сверху важнее плавности. Телевизор,
 * стоящий в магазине при выключенной сети, не должен превращаться в источник
 * тысяч попыток в секунду — иначе он добьётся веб-сервера, обслуживающего
 * панель, вместо того чтобы просто ждать сеть.
 */
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 20_000, 30_000, 60_000]

/**
 * Как часто экран переспрашивает публикацию.
 *
 * Не из-за канала: канал остаётся основным путём, и обычно он молчит, потому
 * что публикаций не было. Опрос нужен по двум причинам, и обе — про год
 * работы без вмешательства:
 *
 * - Пропуск на файл живёт час. Без периодического обновления адресов через
 *   час экран не сможет показать материал, который ещё не загружался, и
 *   уйдёт в ошибку — то есть перестанет работать без всяких причин.
 * - Канал может молча перестать работать: телевизор уснул, сеть сменилась,
 *   прокси закрыл соединение. Пропущенную публикацию экран обязан получить
 *   иначе, а опрос — это единственный способ, не зависящий от состояния сокета.
 *
 * Пятнадцать минут — с запасом больше, чем час жизни пропуска, и не чаще,
 * чем нужно: запрос один, лёгкий, а не поток.
 */
const STATE_POLL_MS = 15 * 60_000

/**
 * За сколько до смены программы экран готовит следующую публикацию.
 *
 * Без этого экран узнавал бы о смене только на ближайшем пятнадцатиминутном
 * опросе и показывал бы старую акцию ещё до десяти минут после её конца.
 * Знание момента смены лежит в самом манифесте, поэтому регламент здесь
 * сводится к одному таймеру.
 */
const SCHEDULE_PREFETCH_BEFORE_MS = 10 * 60_000

/** Как часто перепроверять, пока смена не произошла. */
const CHANGE_POLL_MS = 60_000

/**
 * Сколько ждать после момента смены, прежде чем вернуться к обычному опросу.
 *
 * Публикацию выпускает насос расписания на сервере, и он делает это не
 * мгновенно. Экран не должен опрашивать сервер каждую минуту вечно: если по
 * какой-то причине смены так и не случилось, дальше работает обычный
 * пятнадцатиминутный опрос.
 */
const CHANGE_GRACE_MS = 30 * 60_000

export function PlayerDisplay() {
  const [phase, setPhase] = useState<Phase>('authenticating')
  const [message, setMessage] = useState<string | null>(null)

  const manifestRef = useRef<PlayerManifest | null>(null)
  const positionRef = useRef<PlaybackPosition>({ itemIndex: 0, offsetMs: 0 })
  const [item, setItem] = useState<PlayerManifest['items'][number] | null>(null)
  const [itemIndex, setItemIndex] = useState(0)

  /**
   * Идентификатор показываемого материала.
   *
   * Нужен для обновления адресов: у показываемого материала адрес трогать
   * нельзя — замена `src` у `<video>` перезапустила бы ролик с начала.
   */
  const currentItemIdRef = useRef<string | null>(null)

  const failuresRef = useRef(0)
  const credentialRef = useRef<DeviceCredential | null>(null)
  const accessTokenRef = useRef<string | null>(null)
  const tokenExpiryRef = useRef(0)
  const socketRef = useRef<WebSocket | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

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
   * Ничего из этого не выдумывается: пока измерения нет, поле остаётся пустым.
   */
  const pingMsRef = useRef<number | null>(null)
  const stateLatencyMsRef = useRef<number | null>(null)

  /**
   * Версия применённого манифеста.
   *
   * Отдельное состояние нужно ради таймера смены программы: сам манифест живёт
   * в ссылке, и без «счётчика изменений» эффект не понял бы, что пришла новая
   * публикация, и не перевёл бы таймер на её `nextChangeAt`.
   */
  const [manifestVersion, setManifestVersion] = useState<number | null>(null)

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

  /**
   * Применение манифеста.
   *
   * Позиция считается от времени начала показа с сервера: так перезагрузка
   * страницы телевизора и переподключение канала не сбрасывают показ в начало.
   */
  const applyManifest = useCallback((manifest: PlayerManifest) => {
    manifestRef.current = manifest
    setManifestVersion(manifest.version)

    if (manifest.items.length === 0) {
      setPhase('empty')
      return
    }

    failuresRef.current = 0
    setPhase('ready')

    const position = positionForInstant(manifest.items, manifest.since, new Date())
    if (!position) return

    positionRef.current = position
    setItemIndex(position.itemIndex)
    setItem(manifest.items[position.itemIndex] ?? manifest.items[0] ?? null)
  }, [])

  /**
   * Обновление адресов файлов без смены программы.
   *
   * Приходит при опросе состояния: сервер перевыпускает пропуск на каждый
   * файл, поэтому в свежем манифесте адреса другие, а программа та же самая.
   * Хеш манифеста при этом совпадает — он считается без подписи пропуска,
   * специально чтобы отличать смену программы от смены часа.
   *
   * Показываемый материал не трогаем: замена `src` у `<video>` перезапустила
   * бы ролик с начала, и зритель увидел бы обрыв на ровном месте. Пропуск
   * выдан на час, а материал уже загружен и показывается, поэтому проблемы
   * с его адресом уже не возникнет.
   *
   * Возвращает `true`, если программа не изменилась и адреса обновлены.
   */
  const refreshUrls = useCallback((incoming: PlayerManifest): boolean => {
    const current = manifestRef.current
    if (!current) return false

    const refreshed = refreshManifestUrls(current, incoming, currentItemIdRef.current)
    if (!refreshed) return false

    manifestRef.current = refreshed
    return true
  }, [])

  // ── Загрузка публикации ──────────────────────────────────────────────────

  const loadState = useCallback(
    async (options: { isRefresh?: boolean; retried?: boolean } = {}): Promise<void> => {
      const token = await ensureToken()
      if (!token) return

      try {
        const startedAt = Date.now()
        const response = await fetch('/api/player/state', {
          headers: { authorization: `Bearer ${token}`, 'cache-control': 'no-store' },
        })

        // Замер делаем до всех проверок: медленный ответ — это тоже факт о связи.
        stateLatencyMsRef.current = Date.now() - startedAt

        // Токен мог перестать приниматься раньше срока: сервер перезапускался,
        // секрет устройства сменился. Одного повтора с новым токеном достаточно,
        // чтобы это не превращалось в «экран завис на старой программе».
        if (response.status === 401 && !options.retried) {
          accessTokenRef.current = null
          tokenExpiryRef.current = 0
          return loadState({ ...options, retried: true })
        }

        // Фоновый опрос не имеет права ронять работающий экран: недоступность
        // сервера на минуту — это «нет связи» в панели, а не чёрный экран в
        // магазине. Показ продолжается из памяти, следующий опрос всё исправит.
        if (!response.ok) {
          if (!options.isRefresh) setPhase('offline')
          return
        }

        const data = (await response.json()) as {
          manifest: PlayerManifest | null
          appliedVersion: number | null
        }

        const manifest = data.manifest ? normalizeManifest(data.manifest) : null

        if (!manifest) {
          // Пустая публикация — это осмысленное состояние, и сообщать
          // о нём нужно и при обновлении: контент могли снять с экрана.
          manifestRef.current = null
          setManifestVersion(null)
          setItem(null)
          setPhase('empty')
          return
        }

        // Та же программа — обновляем только адреса файлов, показ не трогаем.
        if (refreshUrls(manifest)) return

        applyManifest(manifest)
      } catch {
        if (!options.isRefresh) setPhase('offline')
      }
    },
    [ensureToken, applyManifest, refreshUrls],
  )

  /**
   * Второй механизм получения обновлений.
   *
   * Спрашивает только отметку состояния. Если она изменилась — значит, вышла
   * новая публикация, и есть смысл забрать полный манифест. Так экран не
   * зависит от того, жив ли канал в конкретный момент.
   */
  const checkRevision = useCallback(async (): Promise<void> => {
    const token = await ensureToken()
    if (!token) return

    try {
      const response = await fetch('/api/player/state/revision', {
        headers: { authorization: `Bearer ${token}`, 'cache-control': 'no-store' },
      })

      if (response.status === 401) {
        accessTokenRef.current = null
        tokenExpiryRef.current = 0
        return
      }

      if (!response.ok) return

      const data = (await response.json()) as {
        desiredVersion: number | null
        revision: string
      }

      // Сравниваем именно версию публикации, а не строку отметки: отметка
      // меняется и при служебных обновлениях, а манифест нужен только тогда,
      // когда действительно появилась новая программа.
      const currentVersion = manifestRef.current?.version ?? null
      if (data.desiredVersion === currentVersion) return

      await loadState({ isRefresh: currentVersion !== null })
    } catch {
      // Сеть моргнула: следующий опрос повторит, показ не трогаем.
    }
  }, [ensureToken, loadState])

  // ── Обработка кадров канала ───────────────────────────────────────────────

  const clearAndReturnToPairing = useCallback(async () => {
    // Стираем локальные учётные данные: устройство обязано забыть секрет,
    // иначе будет снова и снова пытаться авторизоваться отозванным доступом.
    await clearCredential()
    window.location.replace('/player/pairing')
  }, [])

  /**
   * Разбор входящего кадра.
   *
   * Вынесено из обработчика сокета, потому что кадры приходят и из первого
   * подключения, и из каждого переподключения: одна реализация означает, что
   * восстановление после обрыва не ведёт себя иначе, чем первый запуск.
   */
  const handleDeviceFrame = useCallback(
    (event: MessageEvent) => {
      let frame: { type: string; releaseVersion?: number; code?: string; at?: number }
      try {
        frame = JSON.parse(String(event.data))
      } catch {
        return
      }

      lastFrameAtRef.current = Date.now()

      if (frame.type === 'hello.ok') {
        // Каждое (пере)подключение — повод сверить состояние: пока канал был
        // закрыт, публикация могла выйти и не дойти.
        void loadState({ isRefresh: true })
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
      }
    },
    [applyManifest, clearAndReturnToPairing, loadState],
  )

  // ── Первый запуск ────────────────────────────────────────────────────────

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
    }

    void start()

    return () => {
      cancelled = true
    }
    // Один раз на всё время жизни экрана: дальше состояние ведёт себя само.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Переподключение канала ────────────────────────────────────────────────

  /**
   * Переподключение канала устройства.
   *
   * Канал — основной путь доставки, и он молчит, когда публикаций нет. Но
   * молчащий канал и мёртвый канал неразличимы снаружи, поэтому экран обязан
   * возвращаться в сеть сам: телевизор спит, сеть меняется, прокси закрывает
   * соединение через несколько часов. Без этого «подключил и забыл на год»
   * не работает — публикации просто перестали бы доходить.
   *
   * Показ при обрыве не прерывается: содержимое уже в памяти, а сообщение
   * «нет связи» на экране в магазине только мешает людям.
   */
  useEffect(() => {
    // Фаза «нет связи» тоже ждёт: экран обязан вернуться в показ сам,
    // как только сервер снова отвечает.
    if (phase !== 'ready' && phase !== 'offline') return

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

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const socket = new WebSocket(`${protocol}://${window.location.host}/ws/device`)

      socket.onopen = () => {
        attempt = 0
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
    // почти всегда просыпается вместе с сетью.
    const onVisible = () => {
      if (document.visibilityState === 'visible') start()
    }

    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [phase, ensureToken, handleDeviceFrame])

  // ── Heartbeat и capability profile ────────────────────────────────────────

  useEffect(() => {
    // Heartbeat нужен и пустому экрану: «нет назначенного контента» — это
    // рабочее состояние, и оператор обязан видеть в панели, что телевизор жив
    // и ждёт публикации, а не «нет связи».
    if (phase === 'authenticating' || phase === 'unpaired') return

    const sendHeartbeat = () => {
      const socket = socketRef.current
      if (socket?.readyState !== WebSocket.OPEN) return

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
    const timer = setInterval(sendHeartbeat, 30_000)

    return () => clearInterval(timer)
  }, [phase])

  // ── Периодический опрос публикации ────────────────────────────────────────

  useEffect(() => {
    // Готовый экран опрашивает редко и обновляет только адреса файлов.
    // Экран без связи опрашивает часто и пытается вернуться в показ.
    const isReady = phase === 'ready'
    if (!isReady && phase !== 'offline') return

    const timer = setInterval(() => {
      void loadState({ isRefresh: isReady })
    }, isReady ? STATE_POLL_MS : OFFLINE_RETRY_MS)

    return () => clearInterval(timer)
  }, [phase, loadState])

  // ── Подготовка смены программы по расписанию ──────────────────────────────

  /**
   * Смена программы по расписанию.
   *
   * Момент смены приходит в манифесте, поэтому экран не обязан угадывать
   * время: он просто просит состояние незадолго до `nextChangeAt`, а пока смена
   * не подтверждена — проверяет раз в минуту вместо обычных пятнадцати.
   *
   * Обновление адресов здесь безопасно: программа не меняется, а если смена
   * уже произошла, `applyManifest` пересчитает позицию и переключит показ.
   */
  useEffect(() => {
    if (phase !== 'ready') return

    const nextChangeAt = manifestRef.current?.nextChangeAt
    if (!nextChangeAt) return

    const changeAt = new Date(nextChangeAt).getTime()
    if (!Number.isFinite(changeAt)) return

    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    const check = async () => {
      if (cancelled) return

      await loadState({ isRefresh: true })

      if (cancelled) return

      const current = manifestRef.current?.nextChangeAt ? new Date(manifestRef.current.nextChangeAt).getTime() : null

      // Смена состоялась — момент исчез или уехал вперёд, и следующая проверка
      // не нужна. Не состоялась — ждём дальше, но не дольше получаса после
      // смены: дальше работает обычный опрос.
      const stillDue = current !== null && current <= Date.now()
      const graceLeft = Date.now() - changeAt < CHANGE_GRACE_MS

      if (stillDue && graceLeft) {
        timer = setTimeout(() => void check(), CHANGE_POLL_MS)
      }
    }

    const firstDelay = changeAt - Date.now() - SCHEDULE_PREFETCH_BEFORE_MS
    timer = setTimeout(() => void check(), Math.max(30_000, firstDelay))

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [phase, manifestVersion, loadState])

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

  /**
   * Событие воспроизведения в аналитику.
   *
   * Утверждается ровно то, что известно машине: материал показывался столько-то
   * миллисекунд. Никто не говорит, что человек посмотрел рекламу — этого
   * продукт не знает и не имеет права утверждать.
   *
   * Отправка идёт только по живому каналу и молча пропускается, если канала
   * нет: событие воспроизведения — это аналитика, а не подтверждение публикации.
   * Потеря единичного события лучше, чем очередь событий на телевизоре, который
   * никто не сможет перезагрузить.
   */
  const reportPlayback = useCallback(
    (
      event: 'started' | 'ended' | 'error' | 'skipped',
      itemId: string,
      positionMs?: number,
      errorCode?: string,
    ) => {
      const socket = socketRef.current
      if (socket?.readyState !== WebSocket.OPEN) return

      socket.send(
        JSON.stringify({
          type: 'playback',
          event,
          itemId,
          releaseVersion: manifestRef.current?.version,
          positionMs,
          errorCode,
        }),
      )
    },
    [],
  )

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
      // Материал доигран до конца: это единственное событие, за которое
      // можно сказать «материал показан целиком».
      reportPlayback('ended', current.id, current.durationMs)
      const next = itemIndex + 1 >= manifest.items.length ? 0 : itemIndex + 1
      setItemIndex(next)
      setItem(manifest.items[next] ?? null)
    }, current.durationMs)

    return () => clearTimeout(timer)
  }, [itemIndex, phase, reportPlayback])

  /**
   * Начало показа материала.
   *
   * Отдельно от смены `itemIndex`: переход к следующему слайду происходит
   * одним событием, и «начал показываться» должно следовать именно за ним.
   */
  useEffect(() => {
    if (phase !== 'ready' || !item) return
    reportPlayback('started', item.id, 0)
  }, [itemIndex, phase, item, reportPlayback])

  /** Ошибка файла: пропускаем материал, но не останавливаем показ. */
  const onItemError = useCallback(() => {
    const manifest = manifestRef.current
    const failed = manifest?.items[itemIndex]

    if (!manifest) {
      setPhase('error')
      return
    }

    const decision = decideAfterFailure(manifest.items, positionRef.current, failuresRef.current)

    if (decision.action === 'show_error') {
      if (failed) reportPlayback('error', failed.id, undefined, 'load_failed')
      setPhase('error')
      return
    }

    // Материал не показался, но показ продолжается: это «пропущено», а не
    // «ошибка» — разница видна в отчёте и в объяснении оператору.
    if (failed) reportPlayback('skipped', failed.id, undefined, 'load_failed')

    failuresRef.current += 1
    setItemIndex(decision.position.itemIndex)
    setItem(manifest.items[decision.position.itemIndex] ?? null)
  }, [itemIndex, reportPlayback])

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
 * Замер связи и площадки.
 *
 * Network Information API есть не во всех браузерах (в Firefox её нет вовсе),
 * поэтому каждое поле необязательное. Лучше показать прочерк, чем ноль:
 * ноль выглядел бы как идеальная сеть, а на самом деле это «неизвестно».
 */
function collectTelemetry(pingMs: number | null, stateLatencyMs: number | null) {
  const navigatorExtra = navigator as Navigator & {
    connection?: { downlink?: number; rtt?: number; effectiveType?: string }
    deviceMemory?: number
    // userAgentData есть только в Chromium: в Safari и Firefox поля нет.
    userAgentData?: { platform?: string }
  }

  const connection = navigatorExtra.connection

  return {
    platform: navigatorExtra.userAgentData?.platform || navigator.platform || undefined,
    pingMs: pingMs ?? undefined,
    stateLatencyMs: stateLatencyMs ?? undefined,
    downlinkKbps:
      typeof connection?.downlink === 'number' ? Math.round(connection.downlink * 1000) : undefined,
    networkRttMs: typeof connection?.rtt === 'number' ? Math.round(connection.rtt) : undefined,
    effectiveType: connection?.effectiveType,
    deviceMemoryGb: navigatorExtra.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency || undefined,
    viewport: { width: window.innerWidth, height: window.innerHeight },
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
