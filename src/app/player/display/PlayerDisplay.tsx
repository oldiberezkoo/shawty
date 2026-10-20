'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Link2, Loader2, MonitorPlay, WifiOff } from 'lucide-react'
import {
  decideAfterFailure,
  manifestEpoch,
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
   * Смещение часов устройства относительно сервера и лучший замер задержки.
   *
   * Показ синхронизируется по серверной шкале: два телевизора с одним
   * плейлистом обязаны переключать материал в одну и ту же миллисекунду.
   * Локальные часы для этого не годятся — они расходятся на секунды.
   */
  const clockOffsetRef = useRef(0)
  const clockBestRttRef = useRef(Number.POSITIVE_INFINITY)
  const clockSyncedAtRef = useRef(0)
  const [clockRevision, setClockRevision] = useState(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const serverNow = useCallback(() => Date.now() + clockOffsetRef.current, [])

  const requestClockSync = useCallback(() => {
    const socket = socketRef.current
    if (socket?.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ type: 'clock', at: Date.now() }))
  }, [])

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
  const applyManifest = useCallback(
    (manifest: PlayerManifest) => {
      manifestRef.current = manifest
      setManifestVersion(manifest.version)

      if (manifest.items.length === 0) {
        setPhase('empty')
        return
      }

      failuresRef.current = 0
      setPhase('ready')

      // Считаем позицию по серверной шкале и общей точке публикации, а не по
      // локальным часам: иначе соседние телевизоры стартуют с разным сдвигом.
      const position = positionForInstant(
        manifest.items,
        manifestEpoch(manifest),
        new Date(serverNow()),
      )
      if (!position) return

      positionRef.current = position
      setItemIndex(position.itemIndex)
      setItem(manifest.items[position.itemIndex] ?? manifest.items[0] ?? null)
    },
    [serverNow],
  )

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
        // Новый канал — новый лучший замер: старый мог быть снят на плохой
        // сети и больше не отражает текущую задержку.
        clockBestRttRef.current = Number.POSITIVE_INFINITY
        requestClockSync()
        // Каждое (пере)подключение — повод сверить состояние: пока канал был
        // закрыт, публикация могла выйти и не дойти.
        void loadState({ isRefresh: true })
        return
      }

      if (frame.type === 'clock') {
        const receivedAt = Date.now()
        const rtt = Math.max(0, receivedAt - frame.clientAt)
        // Смещение считаем по середине пути «туда-обратно». Берём замер с
        // наименьшей задержкой: он меньше всего страдает от очередей.
        const offset = frame.serverAt - (frame.clientAt + receivedAt) / 2
        const stale = receivedAt - clockSyncedAtRef.current > 5 * 60_000

        if (rtt <= clockBestRttRef.current + 1 || stale) {
          clockOffsetRef.current = offset
          clockBestRttRef.current = rtt
          clockSyncedAtRef.current = receivedAt
          // Пересчитываем таймеры и, если часы разошлись сильнее, чем на
          // один материал, переходим в правильную точку цикла.
          setClockRevision((value) => value + 1)
        }
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
    [applyManifest, clearAndReturnToPairing, loadState, requestClockSync],
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

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const socket = new WebSocket(`${protocol}://${window.location.host}/ws/device`)

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
  }, [phase, ensureToken, handleDeviceFrame, loadState])

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
    const timer = setInterval(sendHeartbeat, 30_000)

    return () => clearInterval(timer)
  }, [phase, requestClockSync])

  // ── Периодический опрос публикации ────────────────────────────────────────

  useEffect(() => {
    // Готовый экран опрашивает редко: свежие изменения ловит отметка состояния
    // и канал. Пустой экран и экран с ошибкой ждут назначения и опрашивают
    // чаще — именно они чаще всего стоят без контента.
    const isReady = phase === 'ready'
    if (!isReady && phase !== 'offline' && phase !== 'empty' && phase !== 'error') return

    const timer = setInterval(
      () => {
        void loadState({ isRefresh: isReady })
      },
      isReady ? STATE_POLL_MS : OFFLINE_RETRY_MS,
    )

    return () => clearInterval(timer)
  }, [phase, loadState])

  // ── Второй механизм: отметка состояния ───────────────────────────────────

  useEffect(() => {
    if (phase !== 'ready' && phase !== 'empty' && phase !== 'error') return

    // Первую проверку делаем не сразу: полный манифест только что загружен.
    const timer = setInterval(() => {
      void checkRevision()
    }, REVISION_POLL_MS)

    return () => clearInterval(timer)
  }, [phase, checkRevision])

  /**
   * Сторож канала.
   *
   * Браузер может считать сокет открытым, когда он давно мёртв: телевизор
   * уснул, Wi-Fi переключился, прокси тихо выбросил соединение. Сервер шлёт
   * ping каждые полминуты, поэтому молчание дольше трёх интервалов — верный
   * признак обрыва. Закрываем сокет и заодно сверяем состояние.
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
    }, 30_000)

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

  /**
   * Переход к следующему материалу по общей серверной шкале.
   *
   * Не «текущий индекс + 1»: если экран отстал (загрузка файла, сон, обрыв),
   * позиция берётся из общего времени публикации. Тогда все телевизоры
   * возвращаются в одну точку цикла, а не накапливают расхождение.
   */
  const advancePlayback = useCallback(
    (force = false) => {
      const manifest = manifestRef.current
      const current = manifest?.items[itemIndex]
      if (!manifest || !current) return

      const position = positionForInstant(
        manifest.items,
        manifestEpoch(manifest),
        new Date(serverNow()),
      )

      let nextIndex = position?.itemIndex ?? (itemIndex + 1) % manifest.items.length
      let nextOffset = position?.offsetMs ?? 0
      const stillCurrent = nextIndex === itemIndex && nextOffset < current.durationMs - 250

      // Таймер мог сработать на несколько миллисекунд раньше границы. Для
      // изображения это повод не прыгать назад, а дождаться следующего тика.
      if (stillCurrent && !force) return

      if (stillCurrent) {
        nextIndex = (itemIndex + 1) % manifest.items.length
        nextOffset = 0
      }

      failuresRef.current = 0
      reportPlayback('ended', current.id, current.durationMs)
      positionRef.current = { itemIndex: nextIndex, offsetMs: nextOffset }
      setItemIndex(nextIndex)
      setItem(manifest.items[nextIndex] ?? null)
    },
    [itemIndex, reportPlayback, serverNow],
  )

  // Таймер перехода живёт здесь, а не в отдельном компоненте: он обязан
  // пересоздаваться при смене материала, иначе длительность нового слайда
  // применялась бы к таймеру предыдущего.
  useEffect(() => {
    if (phase !== 'ready') return

    const manifest = manifestRef.current
    const current = manifest?.items[itemIndex]
    if (!manifest || !current) return

    const position = positionForInstant(
      manifest.items,
      manifestEpoch(manifest),
      new Date(serverNow()),
    )
    const offset = position?.itemIndex === itemIndex ? position.offsetMs : 0
    const remaining = Math.max(20, current.durationMs - offset)

    // Видео переключает `onEnded`: это фактический конец файла, поэтому
    // последний кадр и звук не обрезаются. Таймер — только страховка на
    // случай, если браузер не прислал событие (зависший декодер, фон).
    const delay = current.kind === 'video' ? remaining + 4_000 : remaining + 15
    const timer = setTimeout(() => advancePlayback(true), delay)

    return () => clearTimeout(timer)
  }, [advancePlayback, clockRevision, item?.id, itemIndex, manifestVersion, phase, serverNow])

  /**
   * После уточнения часов проверяем, тот ли материал показывается.
   *
   * До первого замера экран мог считать позицию по своим часам. Если они
   * расходятся с сервером на несколько секунд, после синхронизации нужно
   * перейти в правильную точку, иначе соседние телевизоры останутся в разных
   * материалах до конца ролика.
   */
  useEffect(() => {
    if (phase !== 'ready') return

    const manifest = manifestRef.current
    if (!manifest) return

    const position = positionForInstant(
      manifest.items,
      manifestEpoch(manifest),
      new Date(serverNow()),
    )
    if (!position || position.itemIndex === itemIndex) return

    positionRef.current = position
    setItemIndex(position.itemIndex)
    setItem(manifest.items[position.itemIndex] ?? null)
  }, [clockRevision, itemIndex, phase, serverNow])

  /**
   * Показ видео ровно в общей точке.
   *
   * Если телевизор подключился позже, он догоняет текущий ролик перемоткой.
   * Дальше небольшие расхождения (единицы миллисекунд) гасятся скоростью
   * воспроизведения, а заметный дрейф — перемоткой. Это единственный способ
   * синхронизировать и картинку, и звук средствами браузера.
   */
  useEffect(() => {
    if (phase !== 'ready' || item?.kind !== 'video') return

    let stopped = false

    const correct = () => {
      if (stopped) return

      const video = videoRef.current
      const manifest = manifestRef.current
      if (!video || !manifest || video.readyState < 1) return

      const position = positionForInstant(
        manifest.items,
        manifestEpoch(manifest),
        new Date(serverNow()),
      )
      if (!position || position.itemIndex !== itemIndex) return

      const target = position.offsetMs / 1000
      const drift = target - video.currentTime

      if (Math.abs(drift) > 0.25) {
        try {
          video.currentTime = Math.max(0, target)
          video.playbackRate = 1
        } catch {
          // Метаданные ещё не готовы: следующий тик повторит.
        }
        return
      }

      // 0.98–1.02 не слышны как изменение тона, но убирают дрейф за секунды.
      video.playbackRate = Math.min(1.02, Math.max(0.98, 1 + drift / 8_000))
    }

    const timer = setInterval(correct, 1_000)
    correct()

    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [item?.id, itemIndex, phase, serverNow])

  /**
   * Предзагрузка следующего материала.
   *
   * Переключение не должно ждать сеть: пока играет текущий ролик, следующий
   * уже лежит в кеше. Это особенно важно для синхронной группы — один
   * телевизор не должен отставать из-за медленной загрузки.
   */
  useEffect(() => {
    if (phase !== 'ready') return

    const manifest = manifestRef.current
    const next = manifest?.items[(itemIndex + 1) % (manifest.items.length || 1)]
    if (!next) return

    if (next.kind === 'image') {
      const image = new Image()
      image.src = next.url
      return
    }

    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'video'
    link.href = next.url
    document.head.appendChild(link)
    return () => {
      link.remove()
    }
  }, [itemIndex, manifestVersion, phase])

  const onVideoEnded = useCallback(() => {
    // Событие конца файла важнее таймера: оно гарантирует, что ролик
    // действительно доигран, а не обрезан на середине.
    advancePlayback(true)
  }, [advancePlayback])

  const alignVideo = useCallback(
    (video: HTMLVideoElement) => {
      const manifest = manifestRef.current
      if (!manifest) return

      const position = positionForInstant(
        manifest.items,
        manifestEpoch(manifest),
        new Date(serverNow()),
      )

      if (position?.itemIndex === itemIndex && position.offsetMs > 250) {
        try {
          video.currentTime = position.offsetMs / 1000
        } catch {
          // Браузер сам начнёт с нуля; следующий тик догонит.
        }
      }

      void video.play().catch(() => {
        // Автовоспроизведение со звуком может быть запрещено политикой
        // браузера. Не блокируем показ и не показываем ошибку: следующий
        // материал и повторный `play` при взаимодействии попробуют снова.
        logger.debug({}, 'видео не запустилось автоматически')
      })
    },
    [itemIndex, serverNow],
  )

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
          ref={videoRef}
          src={item.url}
          autoPlay
          preload="auto"
          muted={item.audio === 'mute'}
          playsInline
          onLoadedMetadata={(event) => alignVideo(event.currentTarget)}
          onEnded={onVideoEnded}
          onError={onItemError}
          className="player-media-in size-full object-contain"
        />
      ) : (
        // Изображение вписывается целиком: обрезка рекламы недопустима.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={item.id}
          src={item.url}
          alt=""
          onError={onItemError}
          className="player-media-in size-full bg-black object-contain"
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
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const texts: Record<
    Phase,
    { title: string; hint?: string; status: string; icon: typeof MonitorPlay; tone: string }
  > = {
    authenticating: {
      title: 'Подключаемся к серверу',
      hint: 'Проверяем доступ экрана. Обычно это занимает несколько секунд.',
      status: 'Подключение',
      icon: Loader2,
      tone: 'text-primary',
    },
    ready: {
      title: 'Готовим показ',
      hint: 'Материалы уже на экране — сейчас начнётся воспроизведение.',
      status: 'Показ',
      icon: MonitorPlay,
      tone: 'text-success',
    },
    empty: {
      title: 'Экран ждёт контент',
      hint: 'Назначьте плейлист в панели. Экран подхватит его автоматически, без перезагрузки.',
      status: 'Ждёт назначения',
      icon: MonitorPlay,
      tone: 'text-info',
    },
    offline: {
      title: 'Нет связи с сервером',
      hint: 'Показ продолжится, как только сеть вернётся. Перезагружать телевизор не нужно.',
      status: 'Нет сети',
      icon: WifiOff,
      tone: 'text-warn',
    },
    error: {
      title: 'Не удалось показать материал',
      hint: 'Проверьте файлы плейлиста в панели. Экран продолжит проверять обновления сам.',
      status: 'Ошибка показа',
      icon: AlertTriangle,
      tone: 'text-danger',
    },
    unpaired: {
      title: 'Требуется привязка',
      hint: message ?? 'Откройте страницу привязки и введите код с телевизора.',
      status: 'Не привязан',
      icon: Link2,
      tone: 'text-warn',
    },
  }

  const content = texts[phase]
  const Icon = content.icon

  return (
    <main className="player-shell fixed inset-0 flex size-full flex-col overflow-hidden px-8 py-7 text-white sm:px-14 sm:py-10">
      <div className="player-halo" aria-hidden />
      <div className="player-grid" aria-hidden />

      <header className="relative z-10 flex items-center justify-between gap-6">
        <div className="flex items-center gap-3.5">
          <span className="player-mark">S</span>
          <span className="flex flex-col leading-none">
            <span className="text-[19px] font-semibold tracking-[0.16em] text-white sm:text-[22px]">
              SHAWTY
            </span>
            <span className="mt-1 text-[10px] font-medium tracking-[0.28em] text-white/35 sm:text-[11px]">
              DIGITAL SIGNAGE
            </span>
          </span>
        </div>

        <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[12px] text-white/60 backdrop-blur-sm sm:text-[13px]">
          <span className={`player-status-dot ${content.tone}`} />
          {content.status}
        </span>
      </header>

      <section className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">
        <div className="player-pulse">
          <Icon
            className={`size-[44px] sm:size-[52px] ${content.tone} ${phase === 'authenticating' ? 'animate-spin' : ''}`}
            strokeWidth={1.4}
          />
        </div>

        <h1 className="mt-10 max-w-[18ch] text-[40px] leading-[1.05] font-semibold tracking-[-0.035em] text-balance sm:text-[58px] lg:text-[68px]">
          {content.title}
        </h1>

        {content.hint ? (
          <p className="mt-5 max-w-[58ch] text-[18px] leading-relaxed text-white/45 sm:text-[21px]">
            {content.hint}
          </p>
        ) : null}

        {phase === 'unpaired' ? (
          <div className="mt-7 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-[15px] text-white/60 sm:text-[17px]">
            Панель → Экраны → «Привязать экран»
          </div>
        ) : null}
      </section>

      <footer className="relative z-10 flex flex-wrap items-end justify-between gap-4 border-t border-white/[0.07] pt-5 text-white/35">
        <div className="flex items-center gap-3 text-[12px] sm:text-[13px]">
          <span className="inline-flex size-1.5 rounded-full bg-success/80" />
          Экран работает · обновления приходят автоматически
        </div>
        <div className="text-right">
          <div className="tnum text-[22px] leading-none font-medium text-white/70 sm:text-[26px]">
            {now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="mt-1.5 text-[11px] tracking-wide text-white/30 sm:text-[12px]">
            {now.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </footer>
    </main>
  )
}
