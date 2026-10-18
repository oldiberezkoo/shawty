/**
 * Домен мониторинга: здоровье экрана, инциденты, доступность.
 *
 * Здесь проверяются решения, которые потом нельзя воспроизвести: упавший экран
 * уже вернулся, а простой посчитан. Если правило «с какого момента считать
 * простой» неверно, это обнаружится через месяц, когда в отчёте окажется
 * недоступность там, где её не было.
 */
import { describe, expect, it } from 'vitest'

import { computeHealth, silenceBeganAt, silentSeconds } from '@/domain/monitoring/health'
import { comparePlayerVersions, decideIncidents, formatDuration } from '@/domain/monitoring/incidents'
import {
  computeAvailability,
  measureDowntime,
  openDowntime,
  type DowntimeInterval,
} from '@/domain/monitoring/availability'

const NOW = new Date('2026-11-20T12:00:00Z')

function health(overrides: Partial<Parameters<typeof computeHealth>[0]> = {}) {
  return computeHealth({
    recordStatus: 'paired',
    lastSeenAt: new Date(NOW.getTime() - 30_000),
    offlineAfterSec: 90,
    now: NOW,
    ...overrides,
  })
}

describe('здоровье экрана', () => {
  it('свежий heartbeat означает связь', () => {
    expect(health()).toBe('online')
  })

  it('молчание дольше порога означает «нет связи»', () => {
    expect(health({ lastSeenAt: new Date(NOW.getTime() - 91_000) })).toBe('offline')
    // Ровно на пороге ещё считаем связью: порог включительно, иначе экран
    // «мигает» офлайном на ровно границе.
    expect(health({ lastSeenAt: new Date(NOW.getTime() - 90_000) })).toBe('online')
  })

  it('отозванный экран остаётся отозванным даже со свежим heartbeat', () => {
    // Иначе устройство с удалённым доверием числилось бы онлайн, и оператор
    // не увидел бы, что доступ убран.
    expect(health({ recordStatus: 'revoked' })).toBe('revoked')
    expect(health({ recordStatus: 'disabled' })).toBe('disabled')
    expect(health({ recordStatus: 'unpaired' })).toBe('unpaired')
  })

  it('экран без heartbeat офлайн, а не «в сети неизвестно сколько»', () => {
    expect(health({ lastSeenAt: null })).toBe('offline')
  })

  it('начало молчания считается от последнего heartbeat, а не от момента обнаружения', () => {
    // Разница между этими двумя моментами и попала бы в отчёт о простоях.
    const lastSeenAt = new Date('2026-11-20T11:50:00Z')
    const began = silenceBeganAt({ lastSeenAt, offlineAfterSec: 90 })

    expect(began?.toISOString()).toBe('2026-11-20T11:51:30.000Z')
    // Обнаружено насосом на 12:00 — на 8,5 минуты позже.
    expect(began!.getTime()).toBeLessThan(NOW.getTime())
  })

  it('нет heartbeat — начало неизвестно, и это не выдумывается', () => {
    expect(silenceBeganAt({ lastSeenAt: null, offlineAfterSec: 90 })).toBeNull()
    expect(silentSeconds(null, NOW)).toBeNull()
  })
})

describe('инциденты', () => {
  const base = {
    recordStatus: 'paired' as const,
    lastSeenAt: new Date(NOW.getTime() - 30_000),
    offlineAfterSec: 90,
    now: NOW,
    open: [],
  }

  it('молчание открывает инцидент один раз, а не каждый тик', () => {
    const silent = { ...base, lastSeenAt: new Date(NOW.getTime() - 600_000) }

    const first = decideIncidents(silent)
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ action: 'open', type: 'offline' })

    // Тот же тик при уже открытом инциденте не должен ничего делать, иначе
    // лента событий засорялась бы одной и той же записью каждые полминуты.
    const again = decideIncidents({ ...silent, open: [{ type: 'offline', openedAt: first[0]!.openedAt as Date }] })
    expect(again).toEqual([])
  })

  it('возврат закрывает простой и записывает событие', () => {
    const actions = decideIncidents({
      ...base,
      open: [{ type: 'offline', openedAt: new Date(NOW.getTime() - 5 * 60_000) }],
    })

    expect(actions.map((action) => `${action.action}:${action.type}`)).toEqual([
      'close:offline',
      'open:reconnected',
    ])

    const close = actions[0]
    expect(close?.action).toBe('close')
    // Закрытие по последнему подтверждённому heartbeat, а не по моменту
    // обнаружения: между ними экран уже был жив.
    if (close?.action === 'close') {
      expect(close.closedAt.toISOString()).toBe(new Date(NOW.getTime() - 30_000).toISOString())
    }
  })

  it('событие возврата говорит, сколько экран молчал', () => {
    const actions = decideIncidents({
      ...base,
      open: [{ type: 'offline', openedAt: new Date(NOW.getTime() - 5 * 60_000) }],
    })

    const reopened = actions.find((action) => action.action === 'open')
    expect(reopened && 'detail' in reopened ? reopened.detail : '').toContain('5 мин')
  })

  it('устаревшая версия плеера открывает инцидент ровно один раз', () => {
    const outdated = { ...base, playerVersion: '0.1.0', requiredPlayerVersion: '0.2.0' }

    expect(decideIncidents(outdated)).toHaveLength(1)
    expect(decideIncidents({ ...outdated, open: [{ type: 'version_mismatch', openedAt: NOW }] })).toEqual([])
  })

  it('совпадающая версия инцидента не открывает', () => {
    expect(decideIncidents({ ...base, playerVersion: '0.2.0', requiredPlayerVersion: '0.2.0' })).toEqual([])
  })

  it('версии сравниваются по числам, а не по строкам', () => {
    // «0.10.0» меньше «0.9.0» при сравнении строк — типичная ошибка, из-за
    // которой рассинхронизация форматов проходила бы незамеченной.
    expect(comparePlayerVersions('0.10.0', '0.9.0')).toBe(1)
    expect(comparePlayerVersions('0.9.0', '0.10.0')).toBe(-1)
    expect(comparePlayerVersions('1.2.3', '1.2.3')).toBe(0)
    expect(comparePlayerVersions('0.2.0', '0.2')).toBe(0)
    // Пре-релиз предшествует релизу: переход с 0.2.0 на 0.2.0-rc.1 — это
// откат, и он должен поднимать тревогу, а не считаться обновлением.
expect(comparePlayerVersions('0.2.0-rc.1', '0.2.0')).toBe(-1)
expect(comparePlayerVersions('0.2.0', '0.2.0-rc.1')).toBe(1)
expect(comparePlayerVersions('0.2.0-rc.1', '0.2.0-rc.2')).toBe(-1)
  })

  it('длительность читается словами, а не секундами', () => {
    expect(formatDuration(45)).toBe('45 с')
    expect(formatDuration(300)).toBe('5 мин')
    expect(formatDuration(3600 * 2)).toBe('2 ч')
    expect(formatDuration(3600 * 26)).toBe('1 дн 2 ч')
  })
})

describe('доступность', () => {
  const from = new Date('2026-11-20T00:00:00Z')
  const to = new Date('2026-11-21T00:00:00Z')
  const hour = 60 * 60_000

  const downtime = (startHour: number, endHour: number): DowntimeInterval => ({
    start: new Date(from.getTime() + startHour * hour),
    end: new Date(from.getTime() + endHour * hour),
  })

  it('считает простой и доступность за сутки', () => {
    const result = computeAvailability({ from, to, downtimes: [downtime(2, 3), downtime(10, 12)] })

    expect(result.totalMs).toBe(24 * hour)
    expect(result.offlineMs).toBe(3 * hour)
    expect(result.uptimeMs).toBe(21 * hour)
    expect(result.uptimePercent).toBe(87.5)
  })

  it('наложившиеся интервалы не считаются дважды', () => {
    // Простой с 10:00 до 12:00 и с 11:00 до 13:00 — это три часа, а не четыре.
    const result = computeAvailability({ from, to, downtimes: [downtime(10, 12), downtime(11, 13)] })

    expect(result.offlineMs).toBe(3 * hour)
  })

  it('простой обрезается по границам периода', () => {
    // Инцидент начался накануне и закончился после полуночи: за сутки из него
    // попадает ровно час.
    const result = computeAvailability({
      from,
      to,
      downtimes: [
        { start: new Date(from.getTime() - 2 * hour), end: new Date(from.getTime() + 1 * hour) },
      ],
    })

    expect(result.offlineMs).toBe(1 * hour)
  })

  it('пустой период не выдаёт «0% доступности»', () => {
    // «0%» звучит как измерение, а отсутствие данных не должно выглядеть
    // как измерение.
    const result = computeAvailability({ from, to: from, downtimes: [] })

    expect(result.totalMs).toBe(0)
    expect(result.uptimePercent).toBeNull()
  })

  it('на связи со старым контентом — не то же самое, что простои', () => {
    const result = computeAvailability({
      from,
      to,
      downtimes: [downtime(2, 3)],
      staleWindows: [downtime(4, 6)],
    })

    expect(result.offlineMs).toBe(1 * hour)
    expect(result.uptimeMs).toBe(23 * hour)
    // Экран был на связи, но показывал не ту публикацию: доступность это
    // не отменяет, а «показывало нужное» — отдельное число.
    expect(result.staleMs).toBe(2 * hour)
    expect(result.servingMs).toBe(21 * hour)
  })

  it('устаревание не вычитается дважды из интервалов', () => {
    // Экран отставал и до пропажи сети: пересечение не должно попасть ни в
    // простой, ни в устаревание.
    const result = computeAvailability({
      from,
      to,
      downtimes: [downtime(5, 7)],
      staleWindows: [downtime(4, 8)],
    })

    expect(result.offlineMs).toBe(2 * hour)
    // Устаревание шло с 4:00 до 8:00, но 5:00–7:00 вычтено как простой.
    // Остаётся 4:00–5:00 и 7:00–8:00 — два разных отрезка, а не один.
    expect(result.staleMs).toBe(2 * hour)
  })

  it('открытый инцидент растёт до текущего момента, а не сам по себе', () => {
    // Иначе лежащий сутки экран накапливал бы простоя быстрее реального времени.
    const result = computeAvailability({
      from,
      to: new Date(from.getTime() + 4 * hour),
      downtimes: openDowntime([{ start: new Date(from.getTime() + 2 * hour) }], new Date(from.getTime() + 4 * hour)),
    })

    expect(result.offlineMs).toBe(2 * hour)
  })

  it('суммирует несмежные интервалы', () => {
    expect(measureDowntime([downtime(0, 1), downtime(3, 4)])).toBe(2 * hour)
    expect(measureDowntime([])).toBe(0)
  })
})