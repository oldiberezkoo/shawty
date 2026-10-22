'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import {
  decideAfterFailure,
  manifestEpoch,
  normalizeManifest,
  positionForInstant,
  refreshManifestUrls,
  type PlaybackPosition,
  type PlayerManifest,
} from '@/player/engine'
import {
  CHANGE_GRACE_MS,
  CHANGE_POLL_MS,
  OFFLINE_RETRY_MS,
  REVISION_POLL_MS,
  SCHEDULE_PREFETCH_BEFORE_MS,
  STATE_POLL_MS,
  type PlayerPhase,
} from './config'
import { logger } from '@/lib/logger'
import { fetchPlayerRevision, fetchPlayerState } from './player-api'

type PlaybackEvent = 'started' | 'ended' | 'error' | 'skipped'

type Options = {
  phase: PlayerPhase
  setPhase: (phase: PlayerPhase) => void
  serverNow: () => number
  clockRevision: number
  ensureToken: () => Promise<string | null>
  invalidateToken: () => void
  socketRef: RefObject<WebSocket | null>
  stateLatencyMsRef: RefObject<number | null>
}

/**
 * Состояние показа: манифест, текущий материал и позиция в цикле.
 *
 * Позиция считается от времени начала показа с сервера, а не по локальным
 * часам: перезагрузка страницы телевизора и переподключение канала не
 * сбрасывают показ в начало. Здесь же живут оба механизма обновления —
 * полный манифест и лёгкая отметка состояния.
 */
export function usePlayerPlayback({
  phase,
  setPhase,
  serverNow,
  clockRevision,
  ensureToken,
  invalidateToken,
  socketRef,
  stateLatencyMsRef,
}: Options) {
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
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const resetFailures = useCallback(() => {
    failuresRef.current = 0
  }, [])

  /**
   * Версия применённого манифеста.
   *
   * Отдельное состояние нужно ради таймера смены программы: сам манифест живёт
   * в ссылке, и без «счётчика изменений» эффект не понял бы, что пришла новая
   * публикация, и не перевёл бы таймер на её `nextChangeAt`.
   */
  const [manifestVersion, setManifestVersion] = useState<number | null>(null)

  /**
   * Счётчик повторов одного и того же материала.
   *
   * Плейлист из одного ролика зацикливается, не меняя `itemIndex` и `item.id`.
   * Без отдельного счётчика React не пересоздал бы `<video>`, и после первого
   * проигрывания экран остался бы на последнем кадре.
   */
  const [playbackNonce, setPlaybackNonce] = useState(0)

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
    [serverNow, setPhase],
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
   * бы ролик с начала, и зритель увидел бы обрыв на ровном месте.
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

  const loadState = useCallback(
    async (options: { isRefresh?: boolean; retried?: boolean } = {}): Promise<void> => {
      const token = await ensureToken()
      if (!token) return

      try {
        const response = await fetchPlayerState(token)
        stateLatencyMsRef.current = response.latencyMs

        // Токен мог перестать приниматься раньше срока: сервер перезапускался,
        // секрет устройства сменился. Одного повтора с новым токеном достаточно,
        // чтобы это не превращалось в «экран завис на старой программе».
        if (response.kind === 'unauthorized' && !options.retried) {
          invalidateToken()
          return loadState({ ...options, retried: true })
        }

        // Фоновый опрос не имеет права ронять работающий экран: недоступность
        // сервера на минуту — это «нет связи» в панели, а не чёрный экран в
        // магазине. Показ продолжается из памяти, следующий опрос всё исправит.
        if (response.kind !== 'ok') {
          if (!options.isRefresh) setPhase('offline')
          return
        }

        const manifest = response.manifest ? normalizeManifest(response.manifest) : null

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
    [applyManifest, ensureToken, invalidateToken, refreshUrls, setPhase, stateLatencyMsRef],
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
      const data = await fetchPlayerRevision(token)

      if (data.kind === 'unauthorized') {
        invalidateToken()
        return
      }

      if (data.kind !== 'ok') return

      // Сравниваем именно версию публикации, а не строку отметки: отметка
      // меняется и при служебных обновлениях, а манифест нужен только тогда,
      // когда действительно появилась новая программа.
      const currentVersion = manifestRef.current?.version ?? null
      if (data.desiredVersion === currentVersion) return

      await loadState({ isRefresh: currentVersion !== null })
    } catch {
      // Сеть моргнула: следующий опрос повторит, показ не трогаем.
    }
  }, [ensureToken, invalidateToken, loadState])

  /**
   * Событие воспроизведения в аналитику.
   *
   * Утверждается ровно то, что известно машине: материал показывался столько-то
   * миллисекунд. Отправка идёт только по живому каналу и молча пропускается,
   * если канала нет: потеря единичного события лучше, чем очередь событий на
   * телевизоре, который никто не сможет перезагрузить.
   */
  const reportPlayback = useCallback(
    (event: PlaybackEvent, itemId: string, positionMs?: number, errorCode?: string) => {
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
    [socketRef],
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

      // Единственный материал не меняет ни индекс, ни id — перезапускаем его
      // отдельным счётчиком, иначе после `onEnded` показ замрёт на последнем кадре.
      if (manifest.items.length === 1) setPlaybackNonce((value) => value + 1)
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
  }, [advancePlayback, clockRevision, item?.id, itemIndex, manifestVersion, phase, playbackNonce, serverNow])

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

      // 40 мс — примерно один кадр при 25 fps. Всё, что больше, лучше
      // перемотать: аудио с такой задержкой уже слышно как эхо.
      if (Math.abs(drift) > 0.04) {
        try {
          video.currentTime = Math.max(0, target)
          video.playbackRate = 1
        } catch {
          // Метаданные ещё не готовы: следующий тик повторит.
        }
        return
      }

      // 0.98–1.02 не слышны как изменение тона, но убирают дрейф за секунды.
      video.playbackRate = Math.min(1.02, Math.max(0.98, 1 + drift / 3_000))
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

      // Даже небольшое отставание при загрузке стоит убрать сразу: на свежем
      // видео перемотка на десятки миллисекунд незаметна, а расхождение
      // звука между соседними экранами — заметно.
      if (position?.itemIndex === itemIndex && position.offsetMs > 20) {
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
  }, [itemIndex, phase, item, playbackNonce, reportPlayback])

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
    positionRef.current = decision.position
    setItemIndex(decision.position.itemIndex)
    setItem(manifest.items[decision.position.itemIndex] ?? null)
  }, [itemIndex, reportPlayback, setPhase])

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
  }, [itemIndex, phase, socketRef])

  // ── Периодический опрос публикации ────────────────────────────────────────

  useEffect(() => {
    // Готовый экран опрашивает редко: свежие изменения ловят отметка состояния
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

  // ── Подготовка смены программы по расписанию ──────────────────────────────

  /**
   * Смена программы по расписанию.
   *
   * Момент смены приходит в манифесте, поэтому экран не обязан угадывать
   * время: он просто просит состояние незадолго до `nextChangeAt`, а пока смена
   * не подтверждена — проверяет раз в минуту вместо обычных пятнадцати.
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

      const current = manifestRef.current?.nextChangeAt
        ? new Date(manifestRef.current.nextChangeAt).getTime()
        : null

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

  return {
    manifestRef,
    item,
    itemIndex,
    videoRef,
    playbackNonce,
    loadState,
    applyManifest,
    resetFailures,
    onVideoEnded,
    alignVideo,
    onItemError,
  }
}
