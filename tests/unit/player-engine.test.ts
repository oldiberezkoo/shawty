import { describe, expect, it } from 'vitest'
import {
  advance,
  cycleDurationMs,
  decideAfterFailure,
  normalizeManifest,
  positionAtElapsed,
  positionForInstant,
  refreshManifestUrls,
  type PlayerItem,
  type PlayerManifest,
} from '@/player/engine'

function item(overrides: Partial<PlayerItem> & { id: string }): PlayerItem {
  return {
    kind: 'image',
    url: `/media/${overrides.id}.jpg`,
    mime: 'image/jpeg',
    durationMs: 10_000,
    transition: 'none',
    audio: 'mute',
    ...overrides,
  }
}

function manifest(items: PlayerItem[]): PlayerManifest {
  return {
    version: 1,
    screenId: 'scr_1',
    manifestHash: 'hash-1',
    items,
    loop: true,
    nextChangeAt: null,
    since: '2026-10-17T10:00:00.000Z',
  }
}

describe('нормализация манифеста', () => {
  it('отбрасывает материалы без адреса и с нулевой длительностью', () => {
    const result = normalizeManifest(
      manifest([
        item({ id: 'a' }),
        item({ id: 'bad', url: '' }),
        item({ id: 'zero', durationMs: 0 }),
      ]),
    )

    expect(result.items.map((entry) => entry.id)).toEqual(['a'])
  })

  it('поднимает слишком короткий показ до минимума', () => {
    // Слишком частые переключения на телевизоре заметны глазом и дают нагрузку.
    const result = normalizeManifest(manifest([item({ id: 'a', durationMs: 50 })]))
    expect(result.items[0]?.durationMs).toBe(500)
  })

  it('пустой манифест остаётся пустым, а не падает', () => {
    // Экран должен показать экран ожидания, а не белый квадрат.
    expect(normalizeManifest(manifest([])).items).toEqual([])
  })
})

describe('длительность цикла', () => {
  it('суммирует показы', () => {
    expect(cycleDurationMs([item({ id: 'a', durationMs: 5_000 }), item({ id: 'b', durationMs: 15_000 })])).toBe(20_000)
  })

  it('пустой цикл — ноль', () => {
    expect(cycleDurationMs([])).toBe(0)
  })
})

describe('позиция по накопленному времени', () => {
  const items = [
    item({ id: 'a', durationMs: 10_000 }),
    item({ id: 'b', durationMs: 20_000 }),
    item({ id: 'c', durationMs: 10_000 }),
  ]

  it('начало цикла — первый элемент с нуля', () => {
    expect(positionAtElapsed(items, 0)).toEqual({ itemIndex: 0, offsetMs: 0 })
  })

  it('внутри первого элемента', () => {
    expect(positionAtElapsed(items, 4_000)).toEqual({ itemIndex: 0, offsetMs: 4_000 })
  })

  it('на границе переходит к следующему', () => {
    expect(positionAtElapsed(items, 10_000)).toEqual({ itemIndex: 1, offsetMs: 0 })
  })

  it('внутри второго элемента', () => {
    expect(positionAtElapsed(items, 25_000)).toEqual({ itemIndex: 1, offsetMs: 15_000 })
  })

  it('за циклом возвращается в начало', () => {
    // Телевизор мог проработать цикл несколько раз за ночь.
    expect(positionAtElapsed(items, 40_000)).toEqual({ itemIndex: 0, offsetMs: 0 })
  })

  it('переживает перезагрузку в середине показа', () => {
    expect(positionAtElapsed(items, 22_000)).toEqual({ itemIndex: 1, offsetMs: 12_000 })
  })

  it('не падает на пустом списке', () => {
    expect(positionAtElapsed([], 5_000)).toBeNull()
  })

  it('плавающая точка не оставляет позицию вне списка', () => {
    // Сумма вычитаний с плавающей точкой может дать чуть меньше нуля,
    // и цикл «зависнет» на предпоследнем элементе навсегда.
    const many = Array.from({ length: 7 }, (_, index) => item({ id: `i${index}`, durationMs: 3_333 }))
    for (let elapsed = 0; elapsed < 60_000; elapsed += 137) {
      const position = positionAtElapsed(many, elapsed)
      expect(position).not.toBeNull()
      expect(position!.itemIndex).toBeGreaterThanOrEqual(0)
      expect(position!.itemIndex).toBeLessThan(many.length)
    }
  })
})

describe('позиция для момента времени', () => {
  const items = [
    item({ id: 'a', durationMs: 10_000 }),
    item({ id: 'b', durationMs: 20_000 }),
  ]

  it('возвращает позицию по времени начала показа', () => {
    const since = new Date('2026-10-17T10:00:00.000Z')
    const now = new Date('2026-10-17T10:00:25.000Z')
    expect(positionForInstant(items, since.toISOString(), now)).toEqual({ itemIndex: 1, offsetMs: 15_000 })
  })

  it('без времени начала показывает с начала', () => {
    expect(positionForInstant(items, null, new Date())).toEqual({ itemIndex: 0, offsetMs: 0 })
  })

  it('часы телевизора не собьют показ', () => {
    // Часы могут отставать на минуты: отрицательное смещение дало бы конец
    // цикла и показ последнего материала вместо первого.
    const since = new Date('2026-10-17T10:05:00.000Z')
    const now = new Date('2026-10-17T10:00:00.000Z')
    expect(positionForInstant(items, since.toISOString(), now)).toEqual({ itemIndex: 0, offsetMs: 0 })
  })
})

describe('переход к следующему элементу', () => {
  const items = [item({ id: 'a' }), item({ id: 'b' })]

  it('идёт вперёд', () => {
    expect(advance(items, { itemIndex: 0, offsetMs: 5_000 })).toEqual({ itemIndex: 1, offsetMs: 0 })
  })

  it('замыкает круг', () => {
    expect(advance(items, { itemIndex: 1, offsetMs: 0 })).toEqual({ itemIndex: 0, offsetMs: 0 })
  })

  it('пустой список не ломает переход', () => {
    expect(advance([], { itemIndex: 0, offsetMs: 0 })).toEqual({ itemIndex: 0, offsetMs: 0 })
  })
})

describe('поведение при ошибке файла', () => {
  const items = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]

  it('пропускает материал и идёт дальше', () => {
    const decision = decideAfterFailure(items, { itemIndex: 0, offsetMs: 0 }, 0)
    expect(decision).toEqual({ action: 'advance', position: { itemIndex: 1, offsetMs: 0 } })
  })

  it('после трёх неудач подряд показывает экран ошибки', () => {
    // Оператор должен увидеть проблему: экран молча крутит битые файлы —
    // это хуже, чем явная ошибка.
    const decision = decideAfterFailure(items, { itemIndex: 0, offsetMs: 0 }, 2)
    expect(decision).toEqual({ action: 'show_error', afterFailures: 3 })
  })

  it('одиночный битый материал не крутит бесконечный цикл', () => {
    const single = [item({ id: 'a' })]
    const decision = decideAfterFailure(single, { itemIndex: 0, offsetMs: 0 }, 0)
    expect(decision.action).toBe('show_error')
  })

  it('пустой плейлист ведёт к экрану ошибки, а не к зацикливанию', () => {
    const decision = decideAfterFailure([], { itemIndex: 0, offsetMs: 0 }, 0)
    expect(decision.action).toBe('show_error')
  })
})

describe('обновление адресов файлов', () => {
  const current = manifest([
    item({ id: 'a', url: '/api/player/media/1?t=OLD' }),
    item({ id: 'b', url: '/api/player/media/2?t=OLD' }),
  ])

  const incoming = manifest([
    item({ id: 'a', url: '/api/player/media/1?t=NEW' }),
    item({ id: 'b', url: '/api/player/media/2?t=NEW' }),
  ])

  it('меняет адреса материалов, до которых экран ещё не дошёл', () => {
    const refreshed = refreshManifestUrls(current, incoming, 'a')

    expect(refreshed?.items.map((entry) => entry.url)).toEqual([
      '/api/player/media/1?t=OLD',
      '/api/player/media/2?t=NEW',
    ])
  })

  it('не трогает адрес показываемого материала: ролик не должен перезапускаться', () => {
    const refreshed = refreshManifestUrls(current, incoming, 'b')

    expect(refreshed?.items[1]?.url).toBe('/api/player/media/2?t=OLD')
  })

  it('не обновляет ничего, если программа изменилась', () => {
    const other: PlayerManifest = { ...incoming, manifestHash: 'hash-2' }

    expect(refreshManifestUrls(current, other, 'a')).toBeNull()
  })

  it('сохраняет показываемый материал при неизвестном идентификаторе', () => {
    // Идентификатор мог не совпасть (смена материала в том же тике):
    // безопаснее обновить всё, чем оставить заведомо протухшие адреса.
    const refreshed = refreshManifestUrls(current, incoming, 'missing')

    expect(refreshed?.items.map((entry) => entry.url)).toEqual([
      '/api/player/media/1?t=NEW',
      '/api/player/media/2?t=NEW',
    ])
  })

  it('не меняет прочие поля манифеста', () => {
    const refreshed = refreshManifestUrls(current, incoming, 'a')

    expect(refreshed?.version).toBe(current.version)
    expect(refreshed?.manifestHash).toBe(current.manifestHash)
    expect(refreshed?.since).toBe(current.since)
  })
})
