/**
 * Интеграционные тесты мониторинга: инциденты и доступность.
 *
 * Проверяется то, что чистыми функциями не проверить: что насос открывает
 * интервал ровно один раз, закрывает его по факту возврата, и что отчёт
 * отвечает на вопрос «где и когда была недоступность».
 *
 * Особое внимание к границам интервала: простой начинается в момент молчания,
 * а не в момент обнаружения, и на этом расходятся два числа, которые
 * оператор сравнивает с журналом событий устройства.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { db, sqlite } from '@/db/client'
import { branches, companies, deviceIncidents, screens, users } from '@/db/schema'
import {
  listIncidents,
  openOfflineIncidents,
  recordEventIncident,
  scanCompanyIncidents,
} from '@/server/services/incident-service'
import { unpairScreen } from '@/server/services/device-service'
import { runMonitoringPumpOnce } from '@/server/ws/monitoring-pump'
import { availabilityCsv, availabilityReport } from '@/server/services/report-service'

const COMPANY = 'cmp_mon'
const BRANCH = 'brn_mon'
const OWNER = 'usr_mon_owner'

function wipeAllTables(): void {
  const rows = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'",
    )
    .all() as { name: string }[]

  sqlite.pragma('foreign_keys = OFF')
  for (const row of rows) sqlite.exec(`DELETE FROM "${row.name}"`)
  sqlite.pragma('foreign_keys = ON')
}

/**
 * Экран с явным «молчал N секунд».
 *
 * Параметр в секундах, а не в минутах, намеренно: 30 в минутах означает «на
 * связи», а в тестах на границе порога это постоянно приводило к проверке не
 * того состояния, которое задумано.
 */
function seedScreen(
  id: string,
  silentSeconds: number | null,
  options: { companyId?: string; branchId?: string; status?: string; lastSeenAt?: Date } = {},
): void {
  db.insert(screens)
    .values({
      id,
      companyId: options.companyId ?? COMPANY,
      branchId: options.branchId ?? BRANCH,
      name: id,
      status: (options.status ?? 'paired') as 'paired',
      lastSeenAt:
        options.lastSeenAt ??
        (silentSeconds === null ? new Date(Date.now() - 30 * 60_000) : new Date(Date.now() - silentSeconds * 1000)),
      offlineAfterSec: 90,
      playerVersion: '0.1.0',
    })
    .run()
}

function seedFixture(): void {
  db.insert(users).values({ id: OWNER, email: 'mon@test.local', passwordHash: 'x', name: 'Владелец' }).run()
  db.insert(companies).values({ id: COMPANY, slug: 'mon', name: 'Мониторинг', timezone: 'Asia/Tashkent' }).run()
  db.insert(branches).values({ id: BRANCH, companyId: COMPANY, name: 'Филиал' }).run()
}

beforeEach(() => {
  wipeAllTables()
  seedFixture()
})

describe('инциденты', () => {
  // Порог «нет связи» в фикстуре — 90 секунд. Значения выбраны так, чтобы
  // переход через порог был однозначным: 30 секунд — связь, 600 — молчание.
  const ONLINE = 30
  const SILENT = 600

  it('живой экран не порождает инцидента', () => {
    seedScreen('scr_live', ONLINE)

    scanCompanyIncidents(COMPANY)

    expect(listIncidents(COMPANY)).toHaveLength(0)
  })

  it('молчание открывает интервал простоя один раз, а не каждый тик', () => {
    seedScreen('scr_silent', SILENT)

    scanCompanyIncidents(COMPANY)
    expect(listIncidents(COMPANY, { openOnly: true })).toHaveLength(1)

    // Повторные тики не должны плодить записи: иначе лента событий
    // засорялась бы одной и той же записью каждые полминуты.
    scanCompanyIncidents(COMPANY)
    scanCompanyIncidents(COMPANY)

    expect(listIncidents(COMPANY, { openOnly: true })).toHaveLength(1)
  })

  it('простой начинается в момент молчания, а не в момент обнаружения', () => {
    // Это ровно тот случай, ради которого существует `silenceBeganAt`.
    const lastSeenAt = new Date(Date.now() - 20 * 60_000)
    seedScreen('scr_silent', SILENT)
    db.update(screens).set({ lastSeenAt }).where(eq(screens.id, 'scr_silent')).run()

    scanCompanyIncidents(COMPANY)

    const incident = listIncidents(COMPANY, { openOnly: true })[0]
    const expectedBegan = lastSeenAt.getTime() + 90_000

    expect(incident?.openedAt.getTime()).toBe(expectedBegan)
    // Начало заметно раньше «сейчас»: иначе отчёт врал бы о времени простоя.
    expect(expectedBegan).toBeLessThan(Date.now() - 60_000)
  })

  it('возврат закрывает простой и оставляет его в истории', () => {
    seedScreen('scr_back', SILENT)

    scanCompanyIncidents(COMPANY)
    expect(listIncidents(COMPANY, { openOnly: true })).toHaveLength(1)

    db.update(screens).set({ lastSeenAt: new Date() }).where(eq(screens.id, 'scr_back')).run()
    scanCompanyIncidents(COMPANY)

    expect(listIncidents(COMPANY, { openOnly: true })).toHaveLength(0)
    expect(listIncidents(COMPANY).map((incident) => incident.type).sort()).toEqual(['offline', 'reconnected'])
  })

  it('возврат закрывает простой по последнему heartbeat, а не по моменту обнаружения', () => {
    // Экран вернулся минуту назад, насос заметил только сейчас. Простой должен
    // закончиться в момент, когда экран был живым: иначе в отчёт попадает
    // недоступность там, где экрана уже не было.
    seedScreen('scr_back', SILENT)
    scanCompanyIncidents(COMPANY)

    db.update(screens)
      .set({ lastSeenAt: new Date(Date.now() - 30_000) })
      .where(eq(screens.id, 'scr_back'))
      .run()
    scanCompanyIncidents(COMPANY)

    const offline = listIncidents(COMPANY).find((incident) => incident.type === 'offline')
    expect(offline?.closedAt).not.toBeNull()
    expect(offline!.closedAt!.getTime()).toBeLessThan(Date.now() - 10_000)
  })

  it('отключённый администратором экран не считается простоем', () => {
    // Экран выключен по решению человека. Записывать это как «недоступность» —
    // значит портить статистику сети чужим решением.
    seedScreen('scr_off', SILENT, { status: 'disabled' })

    scanCompanyIncidents(COMPANY)

    expect(listIncidents(COMPANY)).toHaveLength(0)
  })

  it('отвязка попадает в ленту сразу, а не на следующем тике насоса', () => {
    seedScreen('scr_unpair', ONLINE)

    unpairScreen('scr_unpair')

    const feed = listIncidents(COMPANY)
    expect(feed).toHaveLength(1)
    expect(feed[0]?.type).toBe('revoked')
    expect(feed[0]?.detail).toContain('отозван')
  })

  it('повторная отвязка не дублирует запись', () => {
    seedScreen('scr_unpair2', ONLINE)

    unpairScreen('scr_unpair2')
    recordEventIncident({ screenId: 'scr_unpair2', companyId: COMPANY, type: 'revoked', detail: 'ещё раз' })

    expect(listIncidents(COMPANY)).toHaveLength(1)
  })

  it('насос обходит все компании сразу', () => {
    seedScreen('scr_a', SILENT)

    db.insert(companies).values({ id: 'cmp_mon2', slug: 'mon2', name: 'Вторая' }).run()
    db.insert(branches).values({ id: 'brn_mon2', companyId: 'cmp_mon2', name: 'Филиал' }).run()
    seedScreen('scr_b', SILENT, { companyId: 'cmp_mon2', branchId: 'brn_mon2' })

    runMonitoringPumpOnce()

    expect(listIncidents(COMPANY)).toHaveLength(1)
    expect(listIncidents('cmp_mon2')).toHaveLength(1)
  })
})

describe('отчёт о недоступности', () => {
  it('отвечает на вопрос «где и когда»: экран, интервалы и длительность', () => {
    const from = new Date(Date.now() - 24 * 60 * 60_000)

    seedScreen('scr_a', null, { lastSeenAt: new Date(from.getTime() + 10 * 60_000) })
    seedScreen('scr_b', 5)

    // Экран A лежал с 12:00 до 14:00, экран B не выходил на связь последний час.
    db.insert(deviceIncidents)
      .values({
        id: 'inc_a',
        screenId: 'scr_a',
        companyId: COMPANY,
        type: 'offline',
        openedAt: new Date(from.getTime() + 2 * 60 * 60_000),
        closedAt: new Date(from.getTime() + 4 * 60 * 60_000),
        detail: null,
      })
      .run()

    db.insert(deviceIncidents)
      .values({
        id: 'inc_b',
        screenId: 'scr_b',
        companyId: COMPANY,
        type: 'offline',
        openedAt: new Date(Date.now() - 60 * 60_000),
        closedAt: null,
        detail: null,
      })
      .run()

    const report = availabilityReport({ companyId: COMPANY, from, to: new Date() })

    expect(report.screens).toHaveLength(2)

    const screenA = report.screens.find((row) => row.screenId === 'scr_a')
    expect(screenA?.offlineMs).toBe(2 * 60 * 60_000)
    expect(screenA?.uptimePercent).toBeGreaterThan(90)

    const screenB = report.screens.find((row) => row.screenId === 'scr_b')
    // Открытый инцидент растёт до текущего момента: экран лежит час.
    expect(screenB?.offlineMs).toBe(60 * 60_000)

    // Итог по компании: два часа первого плюс час второго.
    expect(report.totals.offlineMs).toBe(3 * 60 * 60_000)
  })

  it('простой в соседнем филиале не портит отчёт по своему', () => {
    const from = new Date(Date.now() - 24 * 60 * 60_000)

    db.insert(branches).values({ id: 'brn_other', companyId: COMPANY, name: 'Другой' }).run()
    seedScreen('scr_here', 5)
    seedScreen('scr_there', null, { branchId: 'brn_other', lastSeenAt: new Date(from.getTime() + 60 * 60_000) })

    db.insert(deviceIncidents)
      .values({
        id: 'inc_there',
        screenId: 'scr_there',
        companyId: COMPANY,
        type: 'offline',
        openedAt: new Date(from.getTime() + 2 * 60 * 60_000),
        closedAt: null,
        detail: null,
      })
      .run()

    const report = availabilityReport({ companyId: COMPANY, from, to: new Date(), branchId: BRANCH })

    expect(report.screens.map((row) => row.screenId)).toEqual(['scr_here'])
    expect(report.totals.offlineMs).toBe(0)
  })

  it('простой делится по филиалам, а не смешивается в одну цифру', () => {
    const from = new Date(Date.now() - 24 * 60 * 60_000)

    db.insert(branches).values({ id: 'brn_other', companyId: COMPANY, name: 'Другой' }).run()
    seedScreen('scr_here', null, { lastSeenAt: new Date(from.getTime() + 60 * 60_000) })
    seedScreen('scr_there', null, { branchId: 'brn_other', lastSeenAt: new Date(from.getTime() + 60 * 60_000) })

    for (const screenId of ['scr_here', 'scr_there']) {
      db.insert(deviceIncidents)
        .values({
          id: `inc_${screenId}`,
          screenId,
          companyId: COMPANY,
          type: 'offline',
          openedAt: new Date(from.getTime() + 2 * 60 * 60_000),
          closedAt: new Date(from.getTime() + 3 * 60 * 60_000),
          detail: null,
        })
        .run()
    }

    const report = availabilityReport({ companyId: COMPANY, from, to: new Date(), groupBy: 'branch' })

    expect(report.branches).toHaveLength(2)
    for (const branch of report.branches ?? []) {
      expect(branch.offlineMs).toBe(60 * 60_000)
    }
  })

  it('CSV отвечает тем же, что и отчёт', () => {
    const from = new Date(Date.now() - 24 * 60 * 60_000)
    seedScreen('scr_a', 5)

    const report = availabilityReport({ companyId: COMPANY, from, to: new Date() })
    const csv = availabilityCsv(report)

    expect(csv.split('\n').length).toBeGreaterThanOrEqual(report.screens.length)
    expect(csv).toContain('scr_a')
  })
})

describe('открытые простои', () => {
  it('список открытых инцидентов отвечает на вопрос «что лежит прямо сейчас»', () => {
    seedScreen('scr_open', null, { lastSeenAt: new Date(Date.now() - 60 * 60_000) })
    seedScreen('scr_ok', 1)

    scanCompanyIncidents(COMPANY)

    const open = openOfflineIncidents(COMPANY)
    expect(open).toHaveLength(1)
    expect(open[0]?.screenId).toBe('scr_open')
  })
})