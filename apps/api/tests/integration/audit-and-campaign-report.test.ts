/**
 * Журнал действий и отчёт по кампаниям.
 *
 * Два свойства проверяются здесь, и оба относятся к тому, врёт ли цифра:
 *
 * 1. Журнал не молчит об отвязке и ротации — самых чувствительных действиях.
 * 2. Связка кампании с показом точная: при пересечении расписаний одна акция не
 *    должна получать показы другой.
 *
 * Второе — главное. Восстановление «по времени публикации» было бы дешевле и
 * тихо присвоило бы двум разным кампаниям один и тот же итог.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { db, sqlite } from '@/db/client'
import {
  auditLog,
  branches,
  campaigns,
  campaignTargets,
  companies,
  deliveryReceipts,
  deviceCredentials,
  playbackEvents,
  releases,
  releaseTargets,
  screens,
  users,
} from '@/db/schema'
import { AUDIT_ACTIONS, auditCsv, listAudit, recordAudit } from '@/server/services/audit-service'
import { campaignCsv, campaignReport } from '@/server/services/campaign-report-service'
import { publishScreens } from '@/server/services/release-service'
import { unpairScreen } from '@/server/services/device-service'

const COMPANY = 'cmp_audit'
const OTHER_COMPANY = 'cmp_other'
const BRANCH = 'brn_audit'
const OWNER = 'usr_audit_owner'

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

function seedCampaign(id: string, name: string): void {
  db.insert(campaigns)
    .values({
      id,
      companyId: COMPANY,
      name,
      kind: 'commercial',
      priority: 10,
      status: 'approved',
      startsOn: '2026-01-01',
      endsOn: null,
    })
    .run()

  db.insert(campaignTargets)
    .values({ id: `tgt_${id}`, campaignId: id, scopeType: 'company', scopeId: COMPANY })
    .run()
}

/**
 * Запись события показа, привязанного к конкретной публикации и экрану.
 *
 * Связка делается по паре «публикация + экран», потому что одна публикация
 * обслуживает всю сеть, и на разных экранах в ней идут разные кампании.
 */
function seedPlayback(
  screenId: string,
  releaseId: string,
  event: 'started' | 'ended' | 'skipped' | 'error',
  positionMs: number | null,
): void {
  db.insert(playbackEvents)
    .values({
      id: crypto.randomUUID(),
      screenId,
      companyId: COMPANY,
      releaseId,
      itemId: 'pvi_1',
      event,
      at: new Date(),
      positionMs,
    })
    .run()
}

function seedFixture(): void {
  db.insert(users).values({ id: OWNER, email: 'audit@test.local', passwordHash: 'x', name: 'Анна Ким' }).run()
  db.insert(companies).values({ id: COMPANY, slug: 'audit', name: 'Аудит', timezone: 'Asia/Tashkent' }).run()
  db.insert(companies).values({ id: OTHER_COMPANY, slug: 'other', name: 'Чужая', timezone: 'Asia/Tashkent' }).run()
  db.insert(branches).values({ id: BRANCH, companyId: COMPANY, name: 'Филиал' }).run()

  seedScreen('scr_a', 'Витрина')
  seedScreen('scr_b', 'Касса')
  seedCampaign('cmp_one', 'Акция первая')
  seedCampaign('cmp_two', 'Акция вторая')
}

beforeEach(() => {
  wipeAllTables()
  seedFixture()
})

describe('журнал действий', () => {
  it('записывает действие с исполнителем и адресом', () => {
    recordAudit({
      companyId: COMPANY,
      actorUserId: OWNER,
      action: 'screen.unpaired',
      targetType: 'screen',
      targetId: 'scr_a',
      meta: { name: 'Витрина' },
      ip: '10.0.0.7',
    })

    const { rows } = listAudit({ companyId: COMPANY })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.actionLabel).toBe('Экран отвязан')
    expect(rows[0]?.actorName).toBe('Анна Ким')
    expect(rows[0]?.meta).toEqual({ name: 'Витрина' })
    expect(rows[0]?.ip).toBe('10.0.0.7')
  })

  it('отвязка экрана попадает в журнал, а не остаётся только в логе процесса', () => {
    db.insert(deviceCredentials)
      .values({
        id: 'dc_1',
        screenId: 'scr_a',
        deviceId: 'scr_dev',
        secretHash: 'x',
        version: 1,
        issuedAt: new Date(),
      })
      .run()

    unpairScreen('scr_a')

    // Отвязка — самое чувствительное действие в продукте. Если её нет в
    // журнале, журнал выглядит полным и перестаёт им быть.
    const { rows } = listAudit({ companyId: COMPANY })
    expect(rows.map((row) => row.action)).toContain('screen.unpaired')
  })

  it('публикация пишется один раз и не пишется для фоновой публикации расписания', () => {
    publishScreens({ companyId: COMPANY, screenIds: ['scr_a'], actorUserId: OWNER, reason: 'кнопка' })

    const afterManual = listAudit({ companyId: COMPANY }).rows
    expect(afterManual.filter((row) => row.action === 'release.published')).toHaveLength(1)

    // Насос расписания работает без человека, и его публикация не должна
    // засорять журнал решений сотрудников.
    publishScreens({ companyId: COMPANY, screenIds: ['scr_a'], reason: 'смена по расписанию', audit: false })

    const afterPump = listAudit({ companyId: COMPANY }).rows
    expect(afterPump.filter((row) => row.action === 'release.published')).toHaveLength(1)
  })

  it('журнал другой компании не отдаётся', () => {
    recordAudit({ companyId: OTHER_COMPANY, action: 'screen.unpaired', actorUserId: OWNER })

    expect(listAudit({ companyId: COMPANY }).rows).toHaveLength(0)
    expect(listAudit({ companyId: OTHER_COMPANY }).rows).toHaveLength(1)
  })

  it('фильтр по группе и по сотруднику', () => {
    recordAudit({ companyId: COMPANY, actorUserId: OWNER, action: 'screen.unpaired' })
    recordAudit({ companyId: COMPANY, actorUserId: OWNER, action: 'playlist.published' })

    expect(listAudit({ companyId: COMPANY, prefix: 'screen.' }).rows).toHaveLength(1)
    expect(listAudit({ companyId: COMPANY, prefix: 'playlist.' }).rows).toHaveLength(1)
    expect(listAudit({ companyId: COMPANY, actorUserId: 'usr_none' }).rows).toHaveLength(0)
  })

  it('битые метаданные не роняют чтение журнала', () => {
    // Запись могла остаться от старой версии кода или обрезаться по длине.
    db.insert(auditLog)
      .values({
        id: crypto.randomUUID(),
        companyId: COMPANY,
        actorUserId: OWNER,
        action: 'screen.unpaired',
        metaJson: '{"name":"обрезано',
        at: new Date(),
      })
      .run()

    const { rows } = listAudit({ companyId: COMPANY })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.meta).toBeNull()
    expect(rows[0]?.actionLabel).toBe('Экран отвязан')
  })

  it('действие вне каталога не ломает интерфейс подписью', () => {
    // Такой ключ означал бы опечатку в имени действия; интерфейс обязан
    // показать сам ключ, а не пустую ячейку.
    db.insert(auditLog)
      .values({
        id: crypto.randomUUID(),
        companyId: COMPANY,
        actorUserId: OWNER,
        action: 'screen.teleported',
        at: new Date(),
      })
      .run()

    expect(listAudit({ companyId: COMPANY }).rows[0]?.actionLabel).toBe('screen.teleported')
  })

  it('каталог действий покрывает все записи сервисов', () => {
    // Реестр без проверки расползается: новое действие появляется в коде и
    // молча исчезает из фильтра интерфейса.
    expect(Object.keys(AUDIT_ACTIONS)).toContain('screen.unpaired')
    expect(Object.keys(AUDIT_ACTIONS)).toContain('media.forced_deleted')
    expect(Object.keys(AUDIT_ACTIONS)).toContain('release.published')
  })

  it('CSV повторяет состав журнала', () => {
    recordAudit({ companyId: COMPANY, actorUserId: OWNER, action: 'screen.unpaired', meta: { name: 'Витрина, вход' } })

    const csv = auditCsv(listAudit({ companyId: COMPANY }).rows)
    expect(csv.split('\n')[0]).toContain('action_label')
    // Название с запятой экранируется, иначе колонки разъезжаются.
    expect(csv).toContain('"Витрина, вход"')
  })
})

describe('отчёт по кампаниям', () => {
  /** Публикация, несущая кампанию, с подтверждённым применением. */
  function releaseWithCampaign(campaignId: string, screens: string[], version: number): string {
    const releaseId = crypto.randomUUID()

    db.insert(releases)
      .values({
        id: releaseId,
        companyId: COMPANY,
        manifestVersion: version,
        manifestJson: '{}',
        manifestHash: 'h',
        itemCount: 1,
        createdAt: new Date(),
      })
      .run()

    for (const screenId of screens) {
      db.insert(releaseTargets).values({ id: crypto.randomUUID(), releaseId, screenId, campaignId }).run()
      db.insert(deliveryReceipts)
        .values({ id: crypto.randomUUID(), releaseId, screenId, state: 'applied', updatedAt: new Date() })
        .run()
    }

    return releaseId
  }

  it('приписывает показ той кампании, чей плейлист лежал на этом экране', () => {
    const release = releaseWithCampaign('cmp_one', ['scr_a', 'scr_b'], 1)

    seedPlayback('scr_a', release, 'started', null)
    seedPlayback('scr_a', release, 'ended', 8000)
    seedPlayback('scr_b', release, 'started', null)
    seedPlayback('scr_b', release, 'ended', 8000)

    const report = campaignReport({ companyId: COMPANY, from: new Date(Date.now() - 60_000), to: new Date() })

    const one = report.campaigns.find((row) => row.campaignId === 'cmp_one')
    const two = report.campaigns.find((row) => row.campaignId === 'cmp_two')

    expect(one?.started).toBe(2)
    expect(one?.completed).toBe(2)
    expect(one?.playedMs).toBe(16_000)
    expect(one?.screensReached).toBe(2)
    expect(one?.screensApplied).toBe(2)

    // Вторая кампания не идёт на этих экранах и не должна получить их показы.
    expect(two?.started ?? 0).toBe(0)
  })

  it('при пересечении расписаний показы не смешиваются между акциями', () => {
    // То самое место, где «привяжем по времени» развалилось бы: обе публикации
    // в один и тот же час, и по времени обе кампании получили бы оба показа.
    const firstRelease = releaseWithCampaign('cmp_one', ['scr_a'], 1)
    const secondRelease = releaseWithCampaign('cmp_two', ['scr_b'], 2)

    seedPlayback('scr_a', firstRelease, 'started', null)
    seedPlayback('scr_a', firstRelease, 'ended', 5000)
    seedPlayback('scr_b', secondRelease, 'started', null)
    seedPlayback('scr_b', secondRelease, 'ended', 3000)

    const report = campaignReport({ companyId: COMPANY, from: new Date(Date.now() - 60_000), to: new Date() })

    expect(report.campaigns.find((row) => row.campaignId === 'cmp_one')?.playedMs).toBe(5000)
    expect(report.campaigns.find((row) => row.campaignId === 'cmp_two')?.playedMs).toBe(3000)
  })

  it('событие публикации без кампании не приписывается никому', () => {
    // Публикация по постоянному назначению: показы настоящие, но к какой
    // кампании они относятся — неизвестно.
    const releaseId = crypto.randomUUID()

    db.insert(releases)
      .values({
        id: releaseId,
        companyId: COMPANY,
        manifestVersion: 1,
        manifestJson: '{}',
        manifestHash: 'h',
        itemCount: 1,
        createdAt: new Date(),
      })
      .run()

    db.insert(releaseTargets)
      .values({ id: crypto.randomUUID(), releaseId, screenId: 'scr_a', campaignId: null })
      .run()

    seedPlayback('scr_a', releaseId, 'started', null)
    seedPlayback('scr_a', releaseId, 'ended', 4000)

    const report = campaignReport({ companyId: COMPANY, from: new Date(Date.now() - 60_000), to: new Date() })

    expect(report.campaigns.every((row) => row.started === 0)).toBe(true)
    expect(report.totals.unattributed).toBe(1)
  })

  it('пропуски и ошибки считаются отдельно от стартов', () => {
    const release = releaseWithCampaign('cmp_one', ['scr_a'], 1)

    seedPlayback('scr_a', release, 'started', null)
    seedPlayback('scr_a', release, 'skipped', null)
    seedPlayback('scr_a', release, 'error', null)

    const report = campaignReport({ companyId: COMPANY, from: new Date(Date.now() - 60_000), to: new Date() })
    const row = report.campaigns.find((entry) => entry.campaignId === 'cmp_one')

    // Пропуск — это результат, а не сбой показа: экран продолжает крутить
    // плейлист, и оператор должен видеть, что конкретный файл не грузится.
    expect(row?.started).toBe(1)
    expect(row?.skipped).toBe(1)
    expect(row?.errors).toBe(1)
    expect(row?.completed).toBe(0)
  })

  it('в CSV нет колонки «показы»', () => {
    // Выгруженный файл уходит человеку раньше документации; называть
    // подтверждённые старты «показами» значит выдумать метрику, которой нет.
    const report = campaignReport({ companyId: COMPANY, from: new Date(Date.now() - 60_000), to: new Date() })
    const header = campaignCsv(report).split('\n')[0]

    expect(header).toContain('started_plays')
    expect(header).not.toMatch(/views|impressions/)
  })
})