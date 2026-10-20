/**
 * Правила плейлистов. Чистые функции: длительность цикла, порядок, проверки.
 *
 * Плеер не решает, сколько показывать материал: он исполняет то, что описано
 * здесь и упаковано в манифест на сервере. Иначе два плеера с чуть разной
 * версией кода показали бы разное на соседних экранах сети.
 */

export type PlayPolicy = 'loop_once' | 'to_end'

export type PlaylistItemInput = {
  id: string
  kind: 'image' | 'video'
  /** Длительность ассета: у видео — реальная, у изображения — null. */
  assetDurationMs: number | null
  /** Переопределение длительности показа. null — взять из ассета. */
  durationMs: number | null
  playPolicy: PlayPolicy
  position: number
}

/** Длительность показа одного элемента. */
export function effectiveDurationMs(
  item: Pick<PlaylistItemInput, 'kind' | 'assetDurationMs' | 'durationMs'>,
  defaultImageDurationMs: number,
): number {
  // Видео всегда играет до конца. Ручное поле «показ, сек» для ролика
  // бессмысленно: обрезка рекламы на середине — это не настройка, а ошибка.
  // Старые записи с duration_ms у видео поэтому тоже игнорируются.
  if (item.kind === 'video') {
    return item.assetDurationMs && item.assetDurationMs > 0 ? item.assetDurationMs : 1000
  }

  if (item.durationMs !== null && item.durationMs > 0) return item.durationMs

  return defaultImageDurationMs
}

/**
 * `loop_once` для видео означает «показать один раз и перейти дальше».
 * Суммарная длительность цикла при этом равна длительности ролика —
 * зацикливание внутри плейлиста допускается только для изображений.
 */
export function cycleDurationMs(items: readonly PlaylistItemInput[], defaultImageDurationMs: number): number {
  return items.reduce((total, item) => total + effectiveDurationMs(item, defaultImageDurationMs), 0)
}

/**
 * Нормализация порядка.
 *
 * Позиции должны идти подряд с нуля без пропусков и дублей: иначе
 * восстановление состояния после перезагрузки страницы телевизора
 * воспроизведёт другую последовательность.
 */
export function normalizePositions<T extends { position: number }>(items: readonly T[]): (T & { position: number })[] {
  // Сначала сортируем по ИСХОДНОЙ позиции, и только потом перенумеровываем.
  // Обратный порядок дал бы исходный порядок массива и проигнорировал позиции.
  return [...items]
    .sort((a, b) => a.position - b.position)
    .map((item, index) => ({ ...item, position: index }))
}

/**
 * Перестановка по новому порядку идентификаторов.
 *
 * Передаётся именно порядок идентификаторов, а не индексы: индексы устаревают
 * между отрисовкой и сохранением при любом параллельном изменении.
 */
export function reorderByIds<T extends { id: string }>(items: readonly T[], orderedIds: readonly string[]): T[] {
  const index = new Map(orderedIds.map((id, position) => [id, position]))
  const unknown = orderedIds.filter((id) => !items.some((item) => item.id === id))

  if (unknown.length > 0) {
    throw new PlaylistRuleError(`Неизвестные элементы в порядке: ${unknown.join(', ')}`)
  }

  if (orderedIds.length !== items.length) {
    throw new PlaylistRuleError(
      `Порядок содержит ${orderedIds.length} элементов, а в плейлисте ${items.length}`,
    )
  }

  return [...items]
    .map((item) => ({ item, position: index.get(item.id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.position - b.position)
    .map(({ item, position }) => ({ ...item, position }))
}

export class PlaylistRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlaylistRuleError'
  }
}

export type DraftProblem = { code: string; message: string }

/**
 * Проверка перед фиксацией версии.
 *
 * Публикуем мы снимок состава, поэтому проверять нужно именно на этом шаге:
 * после публикации версия неизменна, и ошибка обнаружилась бы уже на экране.
 */
export function validateDraft(
  items: readonly PlaylistItemInput[],
  options: { unreadyAssetIds?: readonly string[] } = {},
): DraftProblem[] {
  const problems: DraftProblem[] = []

  if (items.length === 0) {
    problems.push({ code: 'empty', message: 'Плейлист пуст' })
    return problems
  }

  const unready = options.unreadyAssetIds ?? []
  if (unready.length > 0) {
    problems.push({
      code: 'assets_not_ready',
      message: `Не обработано файлов: ${unready.length}. Дождитесь окончания обработки.`,
    })
  }

  const positions = items.map((item) => item.position)
  const unique = new Set(positions)
  if (unique.size !== positions.length) {
    problems.push({ code: 'duplicate_position', message: 'Порядок содержит одинаковые позиции' })
  }

  const maxDuration = 6 * 60 * 60 * 1000
  const total = cycleDurationMs(items, 8000)
  if (total > maxDuration) {
    problems.push({
      code: 'cycle_too_long',
      message: `Цикл длится ${Math.round(total / 60_000)} минут, слишком долго для проверки результата`,
    })
  }

  return problems
}

/** Человекочитаемая длительность цикла: «3 мин 20 сек». */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '0 сек'

  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours} ч ${minutes} мин`
  if (minutes > 0) return `${minutes} мин ${seconds} сек`
  return `${seconds} сек`
}
