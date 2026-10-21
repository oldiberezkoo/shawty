/**
 * Кампании: правила показа, а не только файлы.
 *
 * Кампания отвечает на вопрос «что и когда должно идти на этих экранах».
 * Плейлист в ней неизменяемый: правка состава после запуска не должна
 * молча менять то, что уже висит в магазине.
 *
 * Сервис не решает, что показывать: решение — в `domain/schedule`, а здесь
 * только хранение правил и их проверка. Единственное исключение — разбор
 * областей в конкретные экраны, и он одинаков для назначений и кампаний.
 */
import { and, asc, eq, inArray, lt } from 'drizzle-orm'
import { db, withImmediateTransaction } from '@/db/client'
import {
  auditLog,
  campaigns,
  campaignTargets,
  playlists,
  playlistVersions,
  scheduleWindows,
  type ScopeType,
} from '@/db/schema'
import { isValidTimezone } from '@/domain/schedule/timezone'
import { isValidWindow } from '@/domain/schedule/window'
import { HttpError } from '@/server/http/errors'
import { companyToday, invalidatePlanCache, resolveScreens } from '@/server/services/schedule-service'

export type CampaignStatus = 'draft' | 'in_review' | 'approved' | 'scheduled' | 'active' | 'ended' | 'archived'

/**
 * Статусы, в которых кампания участвует в расписании, живут в домене рядом с
 * решателем: сервис хранения и код показа обязаны понимать список одинаково,
 * иначе «активная» кампания в интерфейсе окажется незаметной для плеера.
 */
export { LIVE_CAMPAIGN_STATUSES } from '@/domain/schedule/resolve'

export type CampaignTargetInput = { scopeType: ScopeType; scopeId: string }

export type CampaignWindowInput = {
  daysOfWeek: number
  startMinute: number
  endMinute: number
  timezoneSource: 'branch' | 'company' | 'campaign'
}

export type CampaignInput = {
  name: string
  kind: 'internal' | 'commercial'
  priority: number
  startsOn: string
  endsOn: string | null
  /** Точные границы, если оператор указал время вместе с датой. */
  startsAt?: string | null
  endsAt?: string | null
  approvalRequired: boolean
  playlistVersionId: string | null
  fallbackPlaylistVersionId: string | null
  timezoneOverride: string | null
  targets: CampaignTargetInput[]
  windows: CampaignWindowInput[]
}

export type CampaignSummary = {
  id: string
  name: string
  kind: 'internal' | 'commercial'
  priority: number
  status: CampaignStatus
  startsOn: string
  endsOn: string | null
  startsAt: Date | null
  endsAt: Date | null
  approvalRequired: boolean
  playlistVersionId: string | null
  playlistName: string | null
  playlistVersion: number | null
  fallbackPlaylistVersionId: string | null
  timezoneOverride: string | null
  targets: CampaignTargetInput[]
  windows: CampaignWindowInput[]
  /** Активна ли кампания по датам прямо сейчас. */
  withinDates: boolean
  createdAt: Date
  updatedAt: Date
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function requireDate(value: string, field: string): string {
  if (!DATE_PATTERN.test(value)) {
    throw HttpError.badRequest('invalid_input', `Некорректная дата в поле «${field}»: ожидается ГГГГ-ММ-ДД`)
  }

  return value
}

/**
 * Дата кампании — локальная, без времени и зоны.
 *
 * Хранить её как `2026-03-15T00:00:00Z` нельзя: такая строка в UTC означает
 * полночь по Гринвичу, и в Ташкенте кампания начиналась бы в пять утра —
 * на пять часов раньше, чем оператор указал в интерфейсе.
 */
function validateDates(startsOn: string, endsOn: string | null): void {
  requireDate(startsOn, 'начало')

  if (!endsOn) return
  requireDate(endsOn, 'окончание')

  if (endsOn < startsOn) {
    throw HttpError.badRequest('invalid_dates', 'Дата окончания раньше даты начала')
  }
}

/**
 * Точные границы периода.
 *
 * В интерфейсе дата и время стоят рядом, но в базе это абсолютные моменты:
 * переход на летнее время или смена часового пояса филиала не должны
 * незаметно сдвигать уже согласованную кампанию.
 */
function parseBoundary(value: string | null | undefined, field: string): Date | null {
  if (!value) return null

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    throw HttpError.badRequest('invalid_dates', `Некорректное время в поле «${field}»`)
  }

  return parsed
}

function validateExactRange(
  startsAtValue: string | null | undefined,
  endsAtValue: string | null | undefined,
  endsOn: string | null,
): { startsAt: Date | null; endsAt: Date | null } {
  const startsAt = parseBoundary(startsAtValue, 'начало')
  const endsAt = parseBoundary(endsAtValue, 'окончание')

  if (endsAt && !endsOn) {
    throw HttpError.badRequest('invalid_dates', 'Для времени окончания укажите дату окончания')
  }

  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw HttpError.badRequest('invalid_dates', 'Окончание периода должно быть позже начала')
  }

  return { startsAt, endsAt }
}

function validateWindows(windows: CampaignWindowInput[]): void {
  for (const window of windows) {
    if (!isValidWindow({ daysOfWeek: window.daysOfWeek, startMinute: window.startMinute, endMinute: window.endMinute })) {
      throw HttpError.badRequest(
        'invalid_window',
        'Окно показа задано неверно: нужен хотя бы один день недели и разные минуты начала и конца',
      )
    }
  }
}

/**
 * Принадлежность версии плейлиста компании.
 *
 * Проверка на уровне запроса, а не фильтрацией результата: версия чужой
 * компании — это уже отказ, а не «пустой плейлист».
 */
function requirePlaylistVersion(companyId: string, versionId: string | null): void {
  if (!versionId) return

  const row = db
    .select({ id: playlistVersions.id })
    .from(playlistVersions)
    .innerJoin(playlists, eq(playlists.id, playlistVersions.playlistId))
    .where(and(eq(playlistVersions.id, versionId), eq(playlists.companyId, companyId)))
    .get()

  if (!row) {
    throw HttpError.notFound('Версия плейлиста не найдена')
  }
}

/** Экраны, попадающие в область назначения. Правило общее с назначениями. */
function screensInScope(companyId: string, scopeType: string, scopeId: string): string[] {
  return resolveScreens(companyId, scopeType, scopeId)
}

function validateTargets(companyId: string, targets: CampaignTargetInput[]): void {
  if (targets.length === 0) {
    throw HttpError.badRequest('no_targets', 'Кампания нуждается хотя бы в одной области экранов')
  }

  const seen = new Set<string>()

  for (const target of targets) {
    const key = `${target.scopeType}:${target.scopeId}`

    if (seen.has(key)) {
      throw HttpError.badRequest('duplicate_target', 'Область указана дважды')
    }

    seen.add(key)

    // Пустая область — почти всегда ошибка выбора в интерфейсе: филиал без
    // экранов или удалённая группа. Молча создавать кампанию «в никуда»
    // нельзя: оператор увидит «активна», а на экранах ничего не изменится.
    if (screensInScope(companyId, target.scopeType, target.scopeId).length === 0) {
      throw HttpError.badRequest('empty_scope', 'В выбранной области нет экранов')
    }
  }
}

function validateInput(companyId: string, input: CampaignInput): void {
  if (input.name.trim().length === 0) {
    throw HttpError.badRequest('invalid_input', 'Укажите название кампании')
  }

  validateDates(input.startsOn, input.endsOn)
  validateExactRange(input.startsAt, input.endsAt, input.endsOn)
  validateWindows(input.windows)
  validateTargets(companyId, input.targets)
  requirePlaylistVersion(companyId, input.playlistVersionId)
  requirePlaylistVersion(companyId, input.fallbackPlaylistVersionId)

  if (input.timezoneOverride && !isValidTimezone(input.timezoneOverride)) {
    throw HttpError.badRequest('invalid_timezone', 'Часовой пояс не поддерживается средой')
  }
}

function loadTargets(campaignId: string): CampaignTargetInput[] {
  return db
    .select({ scopeType: campaignTargets.scopeType, scopeId: campaignTargets.scopeId })
    .from(campaignTargets)
    .where(eq(campaignTargets.campaignId, campaignId))
    .orderBy(asc(campaignTargets.scopeType), asc(campaignTargets.scopeId))
    .all()
}

function loadWindows(campaignId: string): CampaignWindowInput[] {
  return db
    .select({
      daysOfWeek: scheduleWindows.daysOfWeek,
      startMinute: scheduleWindows.startMinute,
      endMinute: scheduleWindows.endMinute,
      timezoneSource: scheduleWindows.timezoneSource,
    })
    .from(scheduleWindows)
    .where(eq(scheduleWindows.campaignId, campaignId))
    .orderBy(asc(scheduleWindows.startMinute))
    .all()
}

function writeChildren(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], campaignId: string, input: CampaignInput): void {
  tx.delete(campaignTargets).where(eq(campaignTargets.campaignId, campaignId)).run()
  tx.delete(scheduleWindows).where(eq(scheduleWindows.campaignId, campaignId)).run()

  for (const target of input.targets) {
    tx.insert(campaignTargets)
      .values({ id: crypto.randomUUID(), campaignId, scopeType: target.scopeType, scopeId: target.scopeId })
      .run()
  }

  for (const window of input.windows) {
    tx.insert(scheduleWindows)
      .values({
        id: crypto.randomUUID(),
        campaignId,
        daysOfWeek: window.daysOfWeek,
        startMinute: window.startMinute,
        endMinute: window.endMinute,
        timezoneSource: window.timezoneSource,
      })
      .run()
  }
}

/**
 * Создание кампании.
 *
 * Без согласования кампания сразу попадает в расписание; с требованием
 * согласования — ждёт в `in_review`, и до решения она не участвует в
 * разрешении конфликтов.
 */
export function createCampaign(params: {
  companyId: string
  actorUserId: string
  input: CampaignInput
}): { id: string; status: CampaignStatus } {
  validateInput(params.companyId, params.input)

  const id = crypto.randomUUID()
  const status: CampaignStatus = params.input.approvalRequired ? 'in_review' : 'approved'
  const { startsAt, endsAt } = validateExactRange(params.input.startsAt, params.input.endsAt, params.input.endsOn)

  withImmediateTransaction((tx) => {
    tx.insert(campaigns)
      .values({
        id,
        companyId: params.companyId,
        name: params.input.name.trim().slice(0, 120),
        kind: params.input.kind,
        priority: params.input.priority,
        status,
        startsOn: params.input.startsOn,
        endsOn: params.input.endsOn,
        startsAt,
        endsAt,
        approvalRequired: params.input.approvalRequired,
        playlistVersionId: params.input.playlistVersionId,
        fallbackPlaylistVersionId: params.input.fallbackPlaylistVersionId,
        timezoneOverride: params.input.timezoneOverride,
        createdByUserId: params.actorUserId,
      })
      .run()

    writeChildren(tx, id, params.input)

    tx.insert(auditLog)
      .values({
        id: crypto.randomUUID(),
        companyId: params.companyId,
        actorUserId: params.actorUserId,
        action: 'campaign.created',
        targetType: 'campaign',
        targetId: id,
        metaJson: JSON.stringify({ name: params.input.name, status }),
        at: new Date(),
      })
      .run()
  })

  invalidatePlanCache(params.companyId)

  return { id, status }
}

/**
 * Кэш плана сбрасывается сразу после любой правки кампании, а не в насосе:
 * иначе оператор увидел бы старый результат ещё полминуты после согласования,
 * и это выглядело бы как «кнопка не работает».
 */

export function updateCampaign(params: {
  companyId: string
  campaignId: string
  actorUserId: string
  input: CampaignInput
}): void {
  const existing = requireCampaign(params.companyId, params.campaignId)
  validateInput(params.companyId, params.input)
  const { startsAt, endsAt } = validateExactRange(params.input.startsAt, params.input.endsAt, params.input.endsOn)

  // Правка кампании, которая уже показывалась на экранах, обязана возвращать
  // её на согласование: иначе согласование проверяло бы только исходный
  // текст, а показывалось бы что-то другое.
  const status: CampaignStatus = existing.status === 'active' || existing.status === 'approved'
    ? existing.approvalRequired || params.input.approvalRequired
      ? 'in_review'
      : 'approved'
    : existing.status

  withImmediateTransaction((tx) => {
    tx.update(campaigns)
      .set({
        name: params.input.name.trim().slice(0, 120),
        kind: params.input.kind,
        priority: params.input.priority,
        startsOn: params.input.startsOn,
        endsOn: params.input.endsOn,
        startsAt,
        endsAt,
        approvalRequired: params.input.approvalRequired,
        playlistVersionId: params.input.playlistVersionId,
        fallbackPlaylistVersionId: params.input.fallbackPlaylistVersionId,
        timezoneOverride: params.input.timezoneOverride,
        status,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, params.campaignId))
      .run()

    writeChildren(tx, params.campaignId, params.input)
  })

  invalidatePlanCache(params.companyId)
}

function requireCampaign(companyId: string, campaignId: string) {
  const campaign = db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.companyId, companyId)))
    .get()

  if (!campaign) throw HttpError.notFound('Кампания не найдена')
  return campaign
}

/**
 * Смена состояния кампании.
 *
 * Переходы явные и ограничены списком: произвольная запись статуса из
 * интерфейса рано или поздно даст кампанию в состоянии, которого нет в
 * продуктовой модели, и она молча перестанет показываться.
 */
export function changeCampaignStatus(params: {
  companyId: string
  campaignId: string
  actorUserId: string
  action: 'approve' | 'activate' | 'end' | 'archive'
}): { status: CampaignStatus } {
  const campaign = requireCampaign(params.companyId, params.campaignId)

  const allowed: Record<typeof params.action, CampaignStatus[]> = {
    approve: ['draft', 'in_review'],
    activate: ['draft', 'approved', 'scheduled'],
    end: ['approved', 'scheduled', 'active'],
    archive: ['ended', 'draft', 'in_review', 'approved', 'scheduled', 'active'],
  }

  if (!allowed[params.action].includes(campaign.status)) {
    throw HttpError.conflict(
      'invalid_transition',
      `Нельзя выполнить «${params.action}» для кампании в состоянии ${campaign.status}`,
    )
  }

  const next: CampaignStatus = params.action === 'approve' ? 'approved' : (params.action as CampaignStatus)

  withImmediateTransaction((tx) => {
    tx.update(campaigns)
      .set({
        status: next,
        approvedByUserId: params.action === 'approve' ? params.actorUserId : campaign.approvedByUserId,
        approvedAt: params.action === 'approve' ? new Date() : campaign.approvedAt,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, params.campaignId))
      .run()

    tx.insert(auditLog)
      .values({
        id: crypto.randomUUID(),
        companyId: params.companyId,
        actorUserId: params.actorUserId,
        action: `campaign.${params.action}`,
        targetType: 'campaign',
        targetId: params.campaignId,
        metaJson: JSON.stringify({ from: campaign.status, to: next }),
        at: new Date(),
      })
      .run()
  })

  invalidatePlanCache(params.companyId)

  return { status: next }
}

export function deleteCampaign(companyId: string, campaignId: string): void {
  const campaign = requireCampaign(companyId, campaignId)

  if (campaign.status === 'active') {
    throw HttpError.conflict('campaign_active', 'Активную кампанию сначала завершите')
  }

  db.transaction((tx) => {
    tx.delete(scheduleWindows).where(eq(scheduleWindows.campaignId, campaignId)).run()
    tx.delete(campaignTargets).where(eq(campaignTargets.campaignId, campaignId)).run()
    tx.delete(campaigns).where(eq(campaigns.id, campaignId)).run()

    tx.insert(auditLog)
      .values({
        id: crypto.randomUUID(),
        companyId,
        action: 'campaign.deleted',
        targetType: 'campaign',
        targetId: campaign.id,
        metaJson: JSON.stringify({ name: campaign.name }),
        at: new Date(),
      })
      .run()
  })

  invalidatePlanCache(companyId)
}

export function listCampaigns(companyId: string, now: Date = new Date()): CampaignSummary[] {
  const today = companyToday(companyId, now)

  const rows = db
    .select()
    .from(campaigns)
    .where(eq(campaigns.companyId, companyId))
    .orderBy(asc(campaigns.name))
    .all()

  const versions = db
    .select({
      id: playlistVersions.id,
      version: playlistVersions.version,
      playlistId: playlistVersions.playlistId,
      playlistName: playlists.name,
    })
    .from(playlistVersions)
    .innerJoin(playlists, eq(playlists.id, playlistVersions.playlistId))
    .all()

  return rows.map((row) => toSummary(row, versions, loadTargets(row.id), loadWindows(row.id), today))
}

export function getCampaign(companyId: string, campaignId: string, now: Date = new Date()): CampaignSummary {
  const today = companyToday(companyId, now)

  const row = requireCampaign(companyId, campaignId)
  const versions = db
    .select({
      id: playlistVersions.id,
      version: playlistVersions.version,
      playlistName: playlists.name,
    })
    .from(playlistVersions)
    .innerJoin(playlists, eq(playlists.id, playlistVersions.playlistId))
    .all()

  return toSummary(row, versions, loadTargets(campaignId), loadWindows(campaignId), today)
}

function toSummary(
  row: typeof campaigns.$inferSelect,
  versions: { id: string; version: number; playlistName?: string }[],
  targets: CampaignTargetInput[],
  windows: CampaignWindowInput[],
  today: string,
): CampaignSummary {
  const version = versions.find((entry) => entry.id === row.playlistVersionId) ?? null

  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    priority: row.priority,
    status: row.status,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    approvalRequired: row.approvalRequired,
    playlistVersionId: row.playlistVersionId,
    // Без названия «версия 3» ничего не говорит: версии нумеруются внутри
    // каждого плейлиста, и у двух плейлистов есть версия 3.
    playlistName: version?.playlistName ?? null,
    playlistVersion: version?.version ?? null,
    fallbackPlaylistVersionId: row.fallbackPlaylistVersionId,
    timezoneOverride: row.timezoneOverride,
    targets,
    windows,
    withinDates:
      (row.startsAt ? row.startsAt.getTime() <= Date.now() : row.startsOn <= today) &&
      (row.endsAt ? row.endsAt.getTime() > Date.now() : !row.endsOn || row.endsOn >= today),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}