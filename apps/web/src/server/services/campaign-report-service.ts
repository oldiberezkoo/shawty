/**
 * Отчёт по кампаниям.
 *
 * Главное решение: связка кампании с событием **точная**, а не восстановленная
 * по времени. У события воспроизведения есть `release_id` и `screen_id`, у
 * таргета публикации — `campaign_id`, и пара `(release_id, screen_id)`
 * уникальна. Поэтому «какая кампания дала этот показ» — прочитанное поле, а
 * не догадка.
 *
 * Упрощать до «время публикации попало в интервал кампании» было бы заметно
 * дешевле, и именно поэтому так делать не надо: при пересечении расписаний одна
 * кампания шла бы два часа, другая десять, а по времени обе считались бы
 * одинаково. Такая цифра выглядела бы правдоподобно и врала бы.
 *
 * Граница честности сохраняется: утверждается «плеер сообщил, что материал
 * начал показываться», а не «человек увидел». Камер и датчиков внимания нет
 * (§9.6).
 */
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  branches,
  campaigns,
  deliveryReceipts,
  playbackEvents,
  releaseTargets,
  releases,
  screens,
} from '@/db/schema'
import { formatDuration } from '@/domain/monitoring/incidents'

export type CampaignRow = {
  campaignId: string
  campaignName: string
  /** Экранов, на которые кампания вообще выходила за период. */
  screensReached: number
  /** Из них подтвердили применение публикации с этой кампанией. */
  screensApplied: number
  /** Подтверждённых стартов показа. Это не «показы» и не «зрители». */
  started: number
  /** Материалов доигранных до конца. */
  completed: number
  skipped: number
  errors: number
  /** Подтверждённое время показа, мс. */
  playedMs: number
  /** Где показывалось: филиалы с числом экранов. */
  branches: { name: string; screens: number }[]
}

export type CampaignReport = {
  from: Date
  to: Date
  campaigns: CampaignRow[]
  totals: {
    started: number
    completed: number
    skipped: number
    errors: number
    playedMs: number
    /** Старты без связи с публикацией: их нельзя приписать ни одной кампании. */
    unattributed: number
  }
}

/**
 * События периода с точной привязкой к кампании.
 *
 * JOIN идёт по паре «публикация + экран», а не только по публикации: одна
 * публикация обслуживает всю сеть, и на разных экранах в ней идут разные
 * кампании. JOIN только по публикации приписал бы показ не той кампании.
 */
function attributedEvents(companyId: string, from: Date, to: Date, campaignIds: string[]) {
  return db
    .select({
      screenId: playbackEvents.screenId,
      event: playbackEvents.event,
      positionMs: playbackEvents.positionMs,
      campaignId: releaseTargets.campaignId,
    })
    .from(playbackEvents)
    .innerJoin(
      releaseTargets,
      and(
        eq(releaseTargets.releaseId, playbackEvents.releaseId),
        eq(releaseTargets.screenId, playbackEvents.screenId),
      ),
    )
    .where(
      and(
        eq(playbackEvents.companyId, companyId),
        gte(playbackEvents.at, from),
        lte(playbackEvents.at, to),
        inArray(releaseTargets.campaignId, campaignIds),
      ),
    )
    .all()
}

/** Старты, которым нельзя приписать кампанию: потерялись при перезагрузке ТВ. */
function unattributedStarts(companyId: string, from: Date, to: Date): number {
  const rows = db
    .select({ releaseId: playbackEvents.releaseId, screenId: playbackEvents.screenId })
    .from(playbackEvents)
    .where(
      and(
        eq(playbackEvents.companyId, companyId),
        eq(playbackEvents.event, 'started'),
        gte(playbackEvents.at, from),
        lte(playbackEvents.at, to),
      ),
    )
    .all()

  if (rows.length === 0) return 0

  // Публикация без таргета — не кампания: обычная публикация по назначению.
  // Такие события не приписываются никому, иначе сумма по кампаниям была бы
  // больше, чем произошло на самом деле.
  const pairs = rows
    .filter((row) => row.releaseId !== null)
    .map((row) => `${row.releaseId}:${row.screenId}`)

  if (pairs.length === 0) return rows.length

  const known = db
    .select({ releaseId: releaseTargets.releaseId, screenId: releaseTargets.screenId, campaignId: releaseTargets.campaignId })
    .from(releaseTargets)
    .where(inArray(releaseTargets.releaseId, rows.map((row) => row.releaseId!).filter(Boolean)))
    .all()

  const withCampaign = new Set(known.filter((row) => row.campaignId !== null).map((row) => `${row.releaseId}:${row.screenId}`))

  return rows.filter((row) => row.releaseId === null || !withCampaign.has(`${row.releaseId}:${row.screenId}`)).length
}

/**
 * Охват кампании: до каких экранов дошла и кто подтвердил применение.
 *
 * Применение берётся из чеков доставки, а не из текущего состояния публикации:
 * «применена сейчас» и «применялась за период» — разные вопросы, и для
 * отчёта нужен второй.
 */
function reachOf(companyId: string, from: Date, to: Date, campaignIds: string[]) {
  return db
    .select({
      campaignId: releaseTargets.campaignId,
      screenId: releaseTargets.screenId,
      applied: deliveryReceipts.state,
      branchName: branches.name,
    })
    .from(releaseTargets)
    .innerJoin(releases, eq(releases.id, releaseTargets.releaseId))
    .leftJoin(deliveryReceipts, and(eq(deliveryReceipts.releaseId, releaseTargets.releaseId), eq(deliveryReceipts.screenId, releaseTargets.screenId)))
    .leftJoin(screens, eq(screens.id, releaseTargets.screenId))
    .leftJoin(branches, eq(branches.id, screens.branchId))
    .where(
      and(
        eq(releases.companyId, companyId),
        inArray(releaseTargets.campaignId, campaignIds),
        gte(releases.createdAt, from),
        lte(releases.createdAt, to),
      ),
    )
    .all()
}

export function campaignReport(options: {
  companyId: string
  from: Date
  to: Date
  campaignId?: string
}): CampaignReport {
  const { companyId, from, to } = options

  const campaignRows = db
    .select({ id: campaigns.id, name: campaigns.name })
    .from(campaigns)
    .where(
      options.campaignId
        ? and(eq(campaigns.companyId, companyId), eq(campaigns.id, options.campaignId))
        : eq(campaigns.companyId, companyId),
    )
    .orderBy(desc(campaigns.createdAt))
    .all()

  const campaignIds = campaignRows.map((row) => row.id)

  if (campaignIds.length === 0) {
    return {
      from,
      to,
      campaigns: [],
      totals: { started: 0, completed: 0, skipped: 0, errors: 0, playedMs: 0, unattributed: 0 },
    }
  }

  const events = attributedEvents(companyId, from, to, campaignIds)
  const reach = reachOf(companyId, from, to, campaignIds)

  const rows: CampaignRow[] = campaignRows.map((campaign) => {
    const own = events.filter((event) => event.campaignId === campaign.id)
    const targets = reach.filter((row) => row.campaignId === campaign.id)

    const completed = own.filter((event) => event.event === 'ended')

    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      screensReached: new Set(targets.map((row) => row.screenId)).size,
      screensApplied: new Set(targets.filter((row) => row.applied === 'applied').map((row) => row.screenId)).size,
      started: own.filter((event) => event.event === 'started').length,
      completed: completed.length,
      skipped: own.filter((event) => event.event === 'skipped').length,
      errors: own.filter((event) => event.event === 'error').length,
      // Время берётся из событий окончания: у них есть `positionMs`, а у
      // старта его нет. Складывать «длительность слайда» значило бы суммировать
      // намерение плеера вместо его фактических действий.
      playedMs: completed.reduce((sum, event) => sum + (event.positionMs ?? 0), 0),
      branches: groupBranches(targets.map((row) => row.branchName)),
    }
  })

  return {
    from,
    to,
    campaigns: rows,
    totals: {
      started: rows.reduce((sum, row) => sum + row.started, 0),
      completed: rows.reduce((sum, row) => sum + row.completed, 0),
      skipped: rows.reduce((sum, row) => sum + row.skipped, 0),
      errors: rows.reduce((sum, row) => sum + row.errors, 0),
      playedMs: rows.reduce((sum, row) => sum + row.playedMs, 0),
      unattributed: unattributedStarts(companyId, from, to),
    },
  }
}

function groupBranches(names: (string | null)[]): { name: string; screens: number }[] {
  const counts = new Map<string, number>()

  for (const name of names) {
    const key = name ?? 'Без филиала'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([name, screens]) => ({ name, screens }))
    .sort((a, b) => b.screens - a.screens)
}

/**
 * Выгрузка CSV.
 *
 * Заголовки названы так, чтобы их нельзя было прочитать как «показы»:
 * `started_plays`, а не `views`. Файл уходит человеку, который увидит его
 * раньше, чем документация.
 */
export function campaignCsv(report: CampaignReport): string {
  const header = [
    'campaign_id',
    'campaign_name',
    'screens_reached',
    'screens_applied',
    'started_plays',
    'completed_plays',
    'skipped',
    'errors',
    'played_minutes',
  ]

  const lines = report.campaigns.map((row) =>
    [
      row.campaignId,
      row.campaignName,
      String(row.screensReached),
      String(row.screensApplied),
      String(row.started),
      String(row.completed),
      String(row.skipped),
      String(row.errors),
      String(Math.round((row.playedMs / 60_000) * 10) / 10),
    ]
      .map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
      .join(','),
  )

  return [header.join(','), ...lines].join('\n')
}

/** Время показа для интерфейса. */
export function playedLabel(ms: number): string {
  if (ms <= 0) return '—'
  return formatDuration(Math.round(ms / 1000))
}