import { describe, expect, it } from 'vitest'
import {
  cycleDurationMs,
  effectiveDurationMs,
  formatDuration,
  normalizePositions,
  reorderByIds,
  validateDraft,
  PlaylistRuleError,
  type PlaylistItemInput,
} from '@/domain/playlist/rules'

const DEFAULT_IMAGE = 8000

/**
 * Позиция по умолчанию уникальна: иначе любой фикстурный плейлист содержал бы
 * дубли и ловил duplicate_position вместо проверки того, что нужно проверить.
 */
let positionCounter = 0

function item(overrides: Partial<PlaylistItemInput> & { id?: string } = {}): PlaylistItemInput {
  const position = overrides.position ?? positionCounter++

  return {
    id: overrides.id ?? `item-${position}`,
    kind: 'image',
    assetDurationMs: null,
    durationMs: null,
    playPolicy: 'loop_once',
    ...overrides,
    position,
  }
}

describe('длительность элемента', () => {
  it('изображение показывается заданное время', () => {
    expect(effectiveDurationMs(item({ kind: 'image', durationMs: 5000 }), DEFAULT_IMAGE)).toBe(5000)
  })

  it('изображение без переопределения берёт длительность по умолчанию', () => {
    expect(effectiveDurationMs(item({ kind: 'image' }), DEFAULT_IMAGE)).toBe(DEFAULT_IMAGE)
  })

  it('видео играет до конца, а не заданное время', () => {
    // Переопределение для видео осмысленно только как верхняя граница;
    // базовая семантика — длительность ролика.
    expect(effectiveDurationMs(item({ kind: 'video', assetDurationMs: 12_000 }), DEFAULT_IMAGE)).toBe(12_000)
  })

  it('видео с неизвестной длительностью не даёт нулевого слайда', () => {
    expect(effectiveDurationMs(item({ kind: 'video', assetDurationMs: null }), DEFAULT_IMAGE)).toBe(1000)
    expect(effectiveDurationMs(item({ kind: 'video', assetDurationMs: 0 }), DEFAULT_IMAGE)).toBe(1000)
  })

  it('нулевое переопределение игнорируется', () => {
    expect(effectiveDurationMs(item({ kind: 'image', durationMs: 0 }), DEFAULT_IMAGE)).toBe(DEFAULT_IMAGE)
  })
})

describe('длительность цикла', () => {
  it('суммирует показы', () => {
    const items = [
      item({ id: 'a', durationMs: 5000 }),
      item({ id: 'b', kind: 'video', assetDurationMs: 20_000 }),
      item({ id: 'c' }),
    ]
    expect(cycleDurationMs(items, DEFAULT_IMAGE)).toBe(5000 + 20_000 + DEFAULT_IMAGE)
  })

  it('пустой плейлист — нулевой цикл', () => {
    expect(cycleDurationMs([], DEFAULT_IMAGE)).toBe(0)
  })

  it('меняется при перестановке', () => {
    const a = item({ id: 'a', durationMs: 5000 })
    const b = item({ id: 'b', durationMs: 7000 })
    expect(cycleDurationMs([a, b], DEFAULT_IMAGE)).toBe(cycleDurationMs([b, a], DEFAULT_IMAGE))
  })
})

describe('порядок элементов', () => {
  it('перенумеровывает позиции подряд с нуля', () => {
    const normalized = normalizePositions([item({ id: 'a', position: 7 }), item({ id: 'b', position: 2 })])
    expect(normalized.map((entry) => [entry.id, entry.position])).toEqual([
      ['b', 0],
      ['a', 1],
    ])
  })

  it('переставляет по списку идентификаторов', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]
    const reordered = reorderByIds(items, ['c', 'a', 'b'])

    expect(reordered.map((entry) => entry.id)).toEqual(['c', 'a', 'b'])
    expect(reordered.map((entry) => entry.position)).toEqual([0, 1, 2])
  })

  it('отбрасывает неизвестный идентификатор', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' })]
    expect(() => reorderByIds(items, ['a', 'zzz'])).toThrow(PlaylistRuleError)
  })

  it('отбрасывает неполный порядок', () => {
    // Неполный порядок означал бы молчаливое удаление элемента из плейлиста.
    const items = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]
    expect(() => reorderByIds(items, ['a', 'b'])).toThrow(/2 элементов, а в плейлисте 3/)
  })

  it('не меняет исходный массив', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' })]
    reorderByIds(items, ['b', 'a'])
    expect(items.map((entry) => entry.id)).toEqual(['a', 'b'])
  })
})

describe('проверка перед публикацией', () => {
  it('пустой плейлист не публикуется', () => {
    const problems = validateDraft([])
    expect(problems).toHaveLength(1)
    expect(problems[0]?.code).toBe('empty')
  })

  it('готовый плейлист проходит без замечаний', () => {
    expect(validateDraft([item({ id: 'a' }), item({ id: 'b' })])).toEqual([])
  })

  it('блокирует публикацию с необработанными файлами', () => {
    const problems = validateDraft([item({ id: 'a' })], { unreadyAssetIds: ['a'] })
    expect(problems.some((problem) => problem.code === 'assets_not_ready')).toBe(true)
  })

  it('ловит одинаковые позиции', () => {
    const problems = validateDraft([
      item({ id: 'a', position: 0 }),
      item({ id: 'b', position: 0 }),
    ])
    expect(problems.some((problem) => problem.code === 'duplicate_position')).toBe(true)
  })

  it('ловит несоразмерно длинный цикл', () => {
    const problems = validateDraft([item({ id: 'a', durationMs: 7 * 60 * 60 * 1000 })])
    expect(problems.some((problem) => problem.code === 'cycle_too_long')).toBe(true)
  })
})

describe('формат длительности', () => {
  it('секунды, минуты и часы', () => {
    expect(formatDuration(0)).toBe('0 сек')
    expect(formatDuration(45_000)).toBe('45 сек')
    expect(formatDuration(200_000)).toBe('3 мин 20 сек')
    expect(formatDuration(3 * 3600_000 + 600_000)).toBe('3 ч 10 мин')
  })
})
