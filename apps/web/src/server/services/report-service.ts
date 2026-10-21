/**
 * Отчёты: где и когда была недоступность.
 *
 * Считается из инцидентов, а не из строк журнала событий воспроизведения.
 * Разница принципиальна: событие «материал показан 8 секунд» может потеряться —
 * телевизор отправляет его только по живому каналу и молча пропускает, если
 * канала нет (§9.6). Инцидент простоя не теряется: он открывается и закрывается
 * по данным сервера, а не по данным устройства.
 *
 * Из этого следует граница отчёта: он говорит, был ли экран доступен и показывал
 * ли он ту публикацию, которую должен был. Он не говорит, видел ли это
 * человек, — камер и датчиков внимания нет, и утверждать обратное было бы
 * выдумкой (§7.4).
 */
import { and, asc, eq, gte, lte } from 'drizzle-orm'
import { db } from '@/db/client'
import { branches, playerErrors, screenGroups, screens, screenPublications } from '@/db/schema'
import { computeAvailability, openDowntime, type Availability } from '@/domain/monitoring/availability'
import { incidentsBetween } from '@/server/services/incident-service'
import { HttpError } from '@/server/http/errors'

export type AvailabilityRow = Availability & {
  screenId: string
  screenName: string
  branchId: string | null
  branchName: string | null
  groupId: string | null
  groupName: string | null
  /** Сколько эпизодов простоя пришлось на период. */
  downtimeCount: number
}

export type GroupAvailability = {
  key: string
  name: string
  screens: number
  offlineMs: number
  staleMs: number
  uptimePercent: number | null
}

export type AvailabilityReport = {
  from: Date
  to: Date
  screens: AvailabilityRow[]
  /** Разбивка по филиалам или группам — по запросу, а не всегда. */
  branches: GroupAvailability[] | null
  totals: {
    screens: number
    offlineMs: number
    staleMs: number
    /** Простой одного экрана: восемьдесят лежащих часов дают 80 часов простоя. */
    uptimePercent: number | null
  }
}

/** Экраны компании с ветками и группами. Отозванные и отключённые не считаем. */
function screensForReport(companyId: string, branchId?: string, groupId?: string) {
  const conditions = [eq(screens.companyId, companyId), eq(screens.status, 'paired')]

  if (branchId) conditions.push(eq(screens.branchId, branchId))
  if (groupId) conditions.push(eq(screens.groupId, groupId))

  return db
    .select({
      screenId: screens.id,
      screenName: screens.name,
      branchId: screens.branchId,
      branchName: branches.name,
      groupId: screens.groupId,
      groupName: screenGroups.name,
    })
    .from(screens)
    .leftJoin(branches, eq(branches.id, screens.branchId))
    .leftJoin(screenGroups, eq(screenGroups.id, screens.groupId))
    .where(and(...conditions))
    .orderBy(asc(screens.name))
    .all()
}

/**
 * Отрезки «на связи, но показывает не ту публикацию».
 *
 * Считаются из несостыковки желаемой и применённой версии, а не из событий:
 * событие потерять можно, разницу версий — нет. Длительность при этом известна
 * только приблизительно, поэтому берётся **нижняя** оценка: с момента, когда
 * экран последний раз подтверждал применение. Завышать её нельзя — тогда «был
 * на связи со старым контентом» выглядело бы хуже, чем было на самом деле.
 */
function staleWindowsFor(screenId: string, from: Date, to: Date, now: Date) {
  const publication = db
    .select({ desiredVersion: screenPublications.desiredVersion, appliedAt: screenPublications.appliedAt })
    .from(screenPublications)
    .where(eq(screenPublications.screenId, screenId))
    .get()

  if (!publication || publication.desiredVersion == null || publication.appliedAt == null) return []

  // Публикация применена внутри периода — по этой причине простоя не было.
  if (publication.appliedAt.getTime() >= from.getTime()) return []

  const start = publication.appliedAt.getTime() > from.getTime() ? publication.appliedAt : from
  const end = to.getTime() < now.getTime() ? to : now

  return start < end ? [{ start, end }] : []
}

export function availabilityReport(options: {
  companyId: string
  from: Date
  to: Date
  branchId?: string
  groupId?: string
  groupBy?: 'branch' | 'group'
}): AvailabilityReport {
  const { companyId, from, to } = options

  if (to.getTime() <= from.getTime()) {
    throw HttpError.badRequest('invalid_period', 'Конец периода должен быть позже начала')
  }

  const now = new Date()
  const screenRows = screensForReport(companyId, options.branchId, options.groupId)

  const incidents = screenRows.length > 0 ? incidentsBetween(companyId, from, to) : []

  const byScreen = new Map<string, { start: Date; end: Date | null }[]>()
  for (const incident of incidents) {
    const list = byScreen.get(incident.screenId) ?? []
    list.push({ start: incident.openedAt, end: incident.closedAt })
    byScreen.set(incident.screenId, list)
  }

  const rows: AvailabilityRow[] = screenRows.map((screen) => {
    const entries = byScreen.get(screen.screenId) ?? []

    const closed = entries
      .filter((entry): entry is { start: Date; end: Date } => entry.end !== null)
      .map((entry) => ({ start: entry.start, end: entry.end }))

    // Открытый простой растёт до текущего момента, а не сам по себе.
    const opened = openDowntime(
      entries.filter((entry) => entry.end === null).map((entry) => ({ start: entry.start })),
      now,
    )

    const availability = computeAvailability({
      from,
      to,
      downtimes: [...closed, ...opened],
      staleWindows: staleWindowsFor(screen.screenId, from, to, now),
    })

    return {
      ...availability,
      screenId: screen.screenId,
      screenName: screen.screenName,
      branchId: screen.branchId,
      branchName: screen.branchName,
      groupId: screen.groupId,
      groupName: screen.groupName,
      downtimeCount: entries.length,
    }
  })

  const periodMs = to.getTime() - from.getTime()
  const offlineMs = rows.reduce((sum, row) => sum + row.offlineMs, 0)
  const staleMs = rows.reduce((sum, row) => sum + row.staleMs, 0)

  return {
    from,
    to,
    screens: rows,
    branches: options.groupBy ? groupAvailability(rows, options.groupBy, periodMs) : null,
    totals: {
      screens: rows.length,
      offlineMs,
      staleMs,
      // Знаменатель — сумма времени работы всех экранов, а не длина периода:
      // восемьдесят экранов, лежавших по часу одновременно, отработали 80
      // часов простоя, и одна цифра «час недоступности» была бы в 80 раз
      // оптимистичнее reality.
      uptimePercent: periodMs > 0 ? Math.round(((periodMs * rows.length - offlineMs) / (periodMs * rows.length)) * 1000) / 10 : null,
    },
  }
}

/**
 * Группировка простоя по филиалу или группе экранов.
 *
 * Нужна отдельно от суммы: «часов простоя в сети» не отвечает на вопрос «где».
 * Вопрос «где» — и есть причина, по которой в отчёте есть и строки по экранам,
 * и разбивка.
 */
function groupAvailability(rows: AvailabilityRow[], by: 'branch' | 'group', periodMs: number): GroupAvailability[] {
  const groups = new Map<string, GroupAvailability>()

  for (const row of rows) {
    const key = (by === 'branch' ? row.branchId : row.groupId) ?? 'none'
    const name = (by === 'branch' ? row.branchName : row.groupName) ?? (key === 'none' ? 'Без области' : key)

    const existing = groups.get(key)

    if (existing) {
      existing.screens += 1
      existing.offlineMs += row.offlineMs
      existing.staleMs += row.staleMs
      continue
    }

    groups.set(key, { key, name, screens: 1, offlineMs: row.offlineMs, staleMs: row.staleMs, uptimePercent: null })
  }

  for (const group of groups.values()) {
    const capacity = periodMs * group.screens
    group.uptimePercent =
      capacity > 0 ? Math.round(((capacity - group.offlineMs) / capacity) * 1000) / 10 : null
  }

  return [...groups.values()].sort((a, b) => b.offlineMs - a.offlineMs)
}

/**
 * CSV по экранам.
 *
 * Запятая и кавычки экранируются: названия филиалов вводят руками, и «Магазин,
 * центр» не должно разъезжать колонки в чужой таблице.
 */
export function availabilityCsv(report: AvailabilityReport): string {
  const header = [
    'screen_id',
    'screen_name',
    'branch',
    'group',
    'downtime_count',
    'offline_minutes',
    'stale_minutes',
    'uptime_percent',
    'serving_minutes',
  ]

  const lines = report.screens.map((row) =>
    [
      row.screenId,
      row.screenName,
      row.branchName ?? '',
      row.groupName ?? '',
      String(row.downtimeCount),
      String(Math.round((row.offlineMs / 60_000) * 10) / 10),
      String(Math.round((row.staleMs / 60_000) * 10) / 10),
      row.uptimePercent === null ? '' : String(row.uptimePercent),
      String(Math.round((row.servingMs / 60_000) * 10) / 10),
    ]
      .map(csvCell)
      .join(','),
  )

  return [header.join(','), ...lines].join('\n')
}

function csvCell(value: string): string {
  if (!/[",\n]/.test(value)) return value

  return `"${value.replace(/"/g, '""')}"`
}

/** Разбор периода из запроса. Границы — сутки по умолчанию. */
export function parsePeriod(fromRaw: string | null, toRaw: string | null): { from: Date; to: Date } {
  const now = new Date()

  const to = toRaw ? new Date(toRaw) : now
  const from = fromRaw ? new Date(fromRaw) : new Date(to.getTime() - 24 * 60 * 60_000)

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw HttpError.badRequest('invalid_period', 'Не удалось разобрать дату периода')
  }

  return { from, to }
}

/** Экраны, молчащие дольше порога. */
export function silentScreens(companyId: string, thresholdSec: number, now = new Date()) {
  return db
    .select({
      screenId: screens.id,
      screenName: screens.name,
      branchName: branches.name,
      lastSeenAt: screens.lastSeenAt,
    })
    .from(screens)
    .leftJoin(branches, eq(branches.id, screens.branchId))
    .where(and(eq(screens.companyId, companyId), eq(screens.status, 'paired')))
    .all()
    .map((row) => ({
      ...row,
      silentSeconds: row.lastSeenAt ? Math.floor((now.getTime() - row.lastSeenAt.getTime()) / 1000) : null,
    }))
    // Экран без heartbeat молчит не «очень долго», а неизвестно сколько:
    // сортировать его первым значит permanently показывать его как худший.
    .filter((row) => row.silentSeconds !== null && row.silentSeconds >= thresholdSec)
    .sort((a, b) => (b.silentSeconds ?? 0) - (a.silentSeconds ?? 0))
}

/** Ошибки воспроизведения за период: что конкретно не грузилось. */
export function playbackErrors(companyId: string, from: Date, to: Date, limit = 50) {
  return db
    .select({
      screenId: playerErrors.screenId,
      code: playerErrors.code,
      message: playerErrors.message,
      at: playerErrors.at,
    })
    .from(playerErrors)
    .where(and(eq(playerErrors.companyId, companyId), gte(playerErrors.at, from), lte(playerErrors.at, to)))
    .orderBy(asc(playerErrors.at))
    .limit(limit)
    .all()
}