/**
 * Движок показа: что и когда играть.
 *
 * Это единственное место в продукте, где живёт логика воспроизведения.
 * Лежит в `src/player` и исполняется на телевизоре, поэтому не зависит ни
 * от Next, ни от базы, ни от Node — только от чистого JavaScript.
 *
 * Принцип: сервер присылает готовый список материалов с длительностями, а
 * движок решает только порядок и момент перехода. Расписание кампаний,
 * приоритеты и пересечения окон решаются на сервере — иначе два телевизора
 * с чуть разными версиями плеера показали бы разное.
 */

export type PlayerItem = {
  id: string
  kind: 'image' | 'video'
  /** Адрес файла, готового к показу (проигрываемый, не оригинал). */
  url: string
  mime: string
  /** Длительность показа в миллисекундах. */
  durationMs: number
  transition: 'none' | 'fade'
  audio: 'keep' | 'mute'
}

export type PlayerManifest = {
  version: number
  screenId: string
  /** Хеш манифеста: плеер проверяет целостность, а сервер сверяет при подтверждении. */
  manifestHash: string
  items: PlayerItem[]
  /** Цикл повторяется бесконечно. */
  loop: boolean
  /** Момент, когда по расписанию нужно забрать следующую публикацию. */
  nextChangeAt: string | null
  /**
   * Время начала показа. От него считается позиция после перезагрузки
   * страницы: часы телевизора для этого ненадёжны.
   */
  since: string
}

export type PlaybackPosition = {
  /** Индекс элемента, который показывается сейчас. */
  itemIndex: number
  /** Смещение внутри текущего элемента, мс. */
  offsetMs: number
}

/**
 * Нормализация манифеста.
 *
 * Плейлист может оказаться пустым (все файлы удалились, пока экран был офлайн)
 * или содержать битые записи. Пустой манифест — это не ошибка: экран обязан
 * показать экран ожидания, а не чёрный квадрат.
 */
export function normalizeManifest(manifest: PlayerManifest): PlayerManifest {
  const items = manifest.items
    .filter((item) => item.url.length > 0 && item.durationMs > 0)
    .map((item) => ({
      ...item,
      durationMs: Math.max(500, item.durationMs),
    }))

  return { ...manifest, items, loop: manifest.loop }
}

/** Сколько длится полный цикл. */
export function cycleDurationMs(items: readonly PlayerItem[]): number {
  return items.reduce((total, item) => total + item.durationMs, 0)
}

/**
 * Восстановление позиции после перезагрузки страницы телевизора.
 *
 * Требование продукта — «подключил и забыл на год»: страница может
 * перезагружаться хоть каждый час, и после перезагрузки экран обязан
 * продолжить показ, а не начинать заново с первого слайда.
 *
 * Позиция хранится по накопленному времени цикла, поэтому не зависит от того,
 * где именно был перерыв.
 */
export function positionAtElapsed(items: readonly PlayerItem[], elapsedMs: number): PlaybackPosition | null {
  if (items.length === 0) return null

  const total = cycleDurationMs(items)
  if (total <= 0) return null

  let remaining = ((elapsedMs % total) + total) % total

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (!item) continue

    if (remaining < item.durationMs) {
      return { itemIndex: index, offsetMs: Math.round(remaining) }
    }

    remaining -= item.durationMs
  }

  // Плавающая точка могла не довести сумму до нуля: возвращаем последний элемент.
  return { itemIndex: items.length - 1, offsetMs: 0 }
}

/** Смещение позиции на элемент вперёд по циклу. */
export function advance(items: readonly PlayerItem[], position: PlaybackPosition): PlaybackPosition {
  if (items.length === 0) return { itemIndex: 0, offsetMs: 0 }

  const nextIndex = position.itemIndex + 1
  if (nextIndex < items.length) {
    return { itemIndex: nextIndex, offsetMs: 0 }
  }

  return items[0] ? { itemIndex: 0, offsetMs: 0 } : position
}

/**
 * Восстановление позиции для конкретного момента времени.
 *
 * Ключевой сценарий: телевизор был выключен два часа. Вместо того чтобы
 * начинать с нуля, он показывает то, что по расписанию должно идти сейчас.
 * Без этого после ночного простоя сеть утром начинает не с той картинки.
 */
export function positionForInstant(
  items: readonly PlayerItem[],
  itemsSince: string | null,
  now: Date,
): PlaybackPosition | null {
  if (items.length === 0) return null

  const elapsed = itemsSince ? now.getTime() - new Date(itemsSince).getTime() : 0
  // Часы на телевизоре могут быть неверны на минуты: отрицательное смещение
  // после пересчёта даст конец цикла, а это хуже, чем начать с нуля.
  return positionAtElapsed(items, Math.max(0, elapsed))
}

/**
 * Решение о переходе.
 *
 * Ошибка файла не должна останавливать показ: экран в магазине обязан
 * продолжать показывать что-либо. Плохой материал пропускается, а после
 * N подряд неудач показывается экран ошибки, чтобы оператор заметил.
 */
export type AdvanceDecision =
  | { action: 'advance'; position: PlaybackPosition }
  | { action: 'show_error'; afterFailures: number }

export function decideAfterFailure(
  items: readonly PlayerItem[],
  position: PlaybackPosition,
  consecutiveFailures: number,
  maxConsecutiveFailures = 3,
): AdvanceDecision {
  const nextFailures = consecutiveFailures + 1

  if (nextFailures >= maxConsecutiveFailures) {
    return { action: 'show_error', afterFailures: nextFailures }
  }

  // Не зацикливаемся на том же самом битом элементе.
  if (items.length <= 1) {
    return { action: 'show_error', afterFailures: nextFailures }
  }

  return { action: 'advance', position: advance(items, position) }
}
