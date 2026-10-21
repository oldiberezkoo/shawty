/**
 * Список экранов: одна строка на экран.
 *
 * Проверяется не форма ответа, а его кратность. В выборку списка подмешивались
 * действующие учётные данные, а у экрана их может оказаться больше одной —
 * тогда join размножал строку, и один телевизор появлялся в панели несколько
 * раз. Снаружи это выглядело как повторяющиеся ключи в списке и как завышенное
 * «всего экранов» в сводке, хотя в базе была одна запись.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { db, sqlite } from '@/db/client'
import { branches, companies, deviceCredentials, screens, users } from '@/db/schema'
import { listScreens, summarizeScreens } from '@/server/services/screen-service'

const COMPANY = 'cmp_screens'
const BRANCH = 'brn_screens'
const OWNER = 'usr_screens_owner'

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

function seedScreen(id: string, name: string): void {
  db.insert(screens)
    .values({
      id,
      companyId: COMPANY,
      branchId: BRANCH,
      name,
      status: 'paired',
      lastSeenAt: new Date(),
      offlineAfterSec: 90,
    })
    .run()
}

function seedCredential(params: {
  id: string
  screenId: string
  deviceId: string
  issuedAt: Date
  revokedAt?: Date | null
}): void {
  db.insert(deviceCredentials)
    .values({
      id: params.id,
      screenId: params.screenId,
      deviceId: params.deviceId,
      secretHash: 'x',
      issuedAt: params.issuedAt,
      revokedAt: params.revokedAt ?? null,
    })
    .run()
}

beforeEach(() => {
  wipeAllTables()
  db.insert(users).values({ id: OWNER, email: 'screens@test.local', passwordHash: 'x', name: 'Владелец' }).run()
  db.insert(companies).values({ id: COMPANY, slug: 'screens', name: 'Экраны', timezone: 'Asia/Tashkent' }).run()
  db.insert(branches).values({ id: BRANCH, companyId: COMPANY, name: 'Филиал' }).run()
})

describe('список экранов', () => {
  it('не дублирует экран с несколькими действующими учётными данными', () => {
    seedScreen('scr_dup', 'Зал')

    const base = Date.now() - 60_000
    seedCredential({
      id: 'cred_old',
      screenId: 'scr_dup',
      deviceId: 'dev_old',
      issuedAt: new Date(base),
    })
    seedCredential({
      id: 'cred_mid',
      screenId: 'scr_dup',
      deviceId: 'dev_mid',
      issuedAt: new Date(base + 10_000),
    })
    seedCredential({
      id: 'cred_new',
      screenId: 'scr_dup',
      deviceId: 'dev_new',
      issuedAt: new Date(base + 20_000),
    })

    const items = listScreens(COMPANY)

    expect(items).toHaveLength(1)
    const [screen] = items
    expect(screen!.id).toBe('scr_dup')
    // Показывается самая свежая выдача: она и есть текущая привязка.
    expect(screen!.deviceId).toBe('dev_new')
    expect(screen!.hasCredential).toBe(true)
  })

  it('считает каждый экран один раз в сводке', () => {
    seedScreen('scr_one', 'Первый')
    seedScreen('scr_two', 'Второй')

    const base = Date.now() - 60_000
    for (const [index, deviceId] of ['dev_a', 'dev_b', 'dev_c'].entries()) {
      seedCredential({
        id: `cred_${deviceId}`,
        screenId: 'scr_one',
        deviceId,
        issuedAt: new Date(base + index * 1000),
      })
    }

    expect(listScreens(COMPANY)).toHaveLength(2)
    expect(summarizeScreens(COMPANY).total).toBe(2)
  })

  it('не считает отозванные учётные данные привязкой', () => {
    seedScreen('scr_revoked', 'Отвязанный')
    seedCredential({
      id: 'cred_revoked',
      screenId: 'scr_revoked',
      deviceId: 'dev_revoked',
      issuedAt: new Date(Date.now() - 60_000),
      revokedAt: new Date(),
    })

    const items = listScreens(COMPANY)

    expect(items).toHaveLength(1)
    const [screen] = items
    expect(screen!.deviceId).toBeNull()
    expect(screen!.hasCredential).toBe(false)
  })
})
