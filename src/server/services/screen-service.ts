import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  branches,
  deviceCredentials,
  deviceIncidents,
  deviceTelemetrySamples,
  playbackEvents,
  playerErrors,
  screenGroups,
  screenPublications,
  screens,
} from '@/db/schema'
import { computeHealth, silentSeconds, type ScreenHealth } from '@/domain/monitoring/health'
import type { ScreenState } from '@/components/ui/status-badge'
import { HttpError } from '@/server/http/errors'
import { recordAudit } from '@/server/services/audit-service'
import { describePlaylistVersion, planForScreen } from '@/server/services/schedule-service'
import { requireBranch, requireGroup } from '@/server/services/structure-service'

export type ScreenListItem = {
  id: string
  name: string
  /** Состояние в базе: экран существует, но может быть отключён или отвязан. */
  recordStatus: 'paired' | 'disabled' | 'revoked' | 'unpaired'
  /** Итоговое состояние для интерфейса, с учётом живого соединения. */
  onlineState: ScreenState
  hasCredential: boolean
  /** Публичная часть учётных данных: безопасна для показа в панели. */
  deviceId: string | null
  branchId: string | null
  branchName: string | null
  groupId: string | null
  groupName: string | null
  lastSeenAt: Date | null
  /** Сколько секунд назад был heartbeat. */
  lastSeenSecondsAgo: number | null
  playerVersion: string | null
  desiredVersion: number | null
  appliedVersion: number | null
  /** Есть ли неприменённая публикация: экран онлайн, но показывает старое. */
  pendingRelease: boolean
  offlineAfterSec: number
}

/**
 * Итоговое состояние экрана для интерфейса.
 *
 * Правило «нет связи» живёт в `domain/monitoring/health`, потому что тем же
 * правилом считает простой насос мониторинга. Две копии этого правила
 * разошлись бы за неделю: список показывал бы «онлайн», а отчёт о простое —
 * «недоступность», и согласовать их было бы невозможно.
 *
 * Порог `offlineAfterSec` (по умолчанию 90 секунд) существует для терпимости:
 * сеть торгового центра мигает постоянно, и по одному пропущенному heartbeat
 * экран выглядел бы «нет связи» каждые полторы минуты.
 */
function computeOnlineState(params: {
  recordStatus: ScreenListItem['recordStatus']
  lastSeenAt: Date | null
  offlineAfterSec: number
  now: number
}): ScreenState {
  return computeHealth({
    recordStatus: params.recordStatus,
    lastSeenAt: params.lastSeenAt,
    offlineAfterSec: params.offlineAfterSec,
    now: new Date(params.now),
  })
}

export function listScreens(companyId: string, options: { branchId?: string | null } = {}): ScreenListItem[] {
  const filters = [eq(screens.companyId, companyId)]
  if (options.branchId) filters.push(eq(screens.branchId, options.branchId))

  const rows = db
    .select({
      id: screens.id,
      name: screens.name,
      recordStatus: screens.status,
      lastSeenAt: screens.lastSeenAt,
      playerVersion: screens.playerVersion,
      offlineAfterSec: screens.offlineAfterSec,
      branchId: screens.branchId,
      branchName: branches.name,
      groupId: screens.groupId,
      groupName: screenGroups.name,
      desiredVersion: screenPublications.desiredVersion,
      appliedVersion: screenPublications.appliedVersion,
      deviceId: deviceCredentials.deviceId,
    })
    .from(screens)
    .leftJoin(branches, eq(branches.id, screens.branchId))
    .leftJoin(screenGroups, eq(screenGroups.id, screens.groupId))
    .leftJoin(screenPublications, eq(screenPublications.screenId, screens.id))
    .leftJoin(
      // Только действующие учётные данные: отозванные не считаются наличием привязки.
      deviceCredentials,
      and(eq(deviceCredentials.screenId, screens.id), isNull(deviceCredentials.revokedAt)),
    )
    .where(and(...filters))
    .orderBy(asc(branches.name), asc(screens.name))
    .all()

  const now = Date.now()

  return rows.map((row) => {
    const onlineState = computeOnlineState({
      recordStatus: row.recordStatus,
      lastSeenAt: row.lastSeenAt,
      offlineAfterSec: row.offlineAfterSec,
      now,
    })

    const pendingRelease =
      row.desiredVersion != null && row.desiredVersion !== row.appliedVersion && onlineState === 'online'

    return {
      id: row.id,
      name: row.name,
      recordStatus: row.recordStatus,
      onlineState: pendingRelease ? 'syncing' : onlineState,
      hasCredential: row.deviceId != null,
      deviceId: row.deviceId,
      branchId: row.branchId,
      branchName: row.branchName,
      groupId: row.groupId,
      groupName: row.groupName,
      lastSeenAt: row.lastSeenAt,
      lastSeenSecondsAgo: row.lastSeenAt ? Math.floor((now - row.lastSeenAt.getTime()) / 1000) : null,
      playerVersion: row.playerVersion,
      desiredVersion: row.desiredVersion,
      appliedVersion: row.appliedVersion,
      pendingRelease,
      offlineAfterSec: row.offlineAfterSec,
    }
  })
}

export type ScreenSummary = {
  total: number
  online: number
  offline: number
  /** Требуют внимания: ждут привязки или отключены. */
  needsAttention: number
  syncing: number
  unpaired: number
}

export function summarizeScreens(companyId: string): ScreenSummary {
  const items = listScreens(companyId)

  return {
    total: items.length,
    online: items.filter((item) => item.onlineState === 'online').length,
    syncing: items.filter((item) => item.onlineState === 'syncing').length,
    offline: items.filter((item) => item.onlineState === 'offline').length,
    unpaired: items.filter((item) => item.recordStatus === 'unpaired').length,
    needsAttention: items.filter(
      (item) => item.onlineState === 'offline' || item.recordStatus === 'unpaired' || item.onlineState === 'disabled',
    ).length,
  }
}

export function getBranchOptions(companyId: string) {
  return db
    .select({ id: branches.id, name: branches.name, timezone: branches.timezone })
    .from(branches)
    .where(eq(branches.companyId, companyId))
    .orderBy(asc(branches.name))
    .all()
}

export function getGroupOptions(companyId: string) {
  return db
    .select({ id: screenGroups.id, name: screenGroups.name, branchId: screenGroups.branchId })
    .from(screenGroups)
    .where(eq(screenGroups.companyId, companyId))
    .orderBy(asc(screenGroups.name))
    .all()
}

export function listBranches(companyId: string) {
  return db.select().from(branches).where(eq(branches.companyId, companyId)).orderBy(asc(branches.name)).all()
}

export function listGroups(companyId: string) {
  return db
    .select()
    .from(screenGroups)
    .where(eq(screenGroups.companyId, companyId))
    .orderBy(asc(screenGroups.name))
    .all()
}

export function listScreenIds(companyId: string, screenIds: readonly string[]): string[] {
  if (screenIds.length === 0) return []
  const rows = db
    .select({ id: screens.id })
    .from(screens)
    .where(and(eq(screens.companyId, companyId), inArray(screens.id, [...screenIds])))
    .all()
  return rows.map((row) => row.id)
}

export type DeviceTelemetry = {
  pingMs: number | null
  downlinkKbps: number | null
  networkRttMs: number | null
  stateLatencyMs: number | null
  effectiveType: string | null
  at: Date
}

/**
 * Последний замер по каждому экрану компании.
 *
 * Отдельная выборка, а не поле в списке: замер нужен карточкам экранов, и
 * делать по запросу на экран значило бы получить сотню запросов на список.
 */
export function latestTelemetryByScreen(companyId: string): Map<string, DeviceTelemetry> {
  const rows = db
    .select({
      screenId: deviceTelemetrySamples.screenId,
      at: deviceTelemetrySamples.at,
      pingMs: deviceTelemetrySamples.pingMs,
      downlinkKbps: deviceTelemetrySamples.downlinkKbps,
      networkRttMs: deviceTelemetrySamples.networkRttMs,
      stateLatencyMs: deviceTelemetrySamples.stateLatencyMs,
      effectiveType: deviceTelemetrySamples.effectiveType,
    })
    .from(deviceTelemetrySamples)
    .where(eq(deviceTelemetrySamples.companyId, companyId))
    .orderBy(desc(deviceTelemetrySamples.at))
    .all()

  const byScreen = new Map<string, DeviceTelemetry>()

  for (const row of rows) {
    // Первый встреченный замер — самый свежий: список отсортирован по времени.
    if (byScreen.has(row.screenId)) continue
    byScreen.set(row.screenId, {
      pingMs: row.pingMs,
      downlinkKbps: row.downlinkKbps,
      networkRttMs: row.networkRttMs,
      stateLatencyMs: row.stateLatencyMs,
      effectiveType: row.effectiveType,
      at: row.at,
    })
  }

  return byScreen
}

/** История замеров экрана: свежие сверху, ограниченная глубина. */
export function telemetryHistory(companyId: string, screenId: string, limit = 288): DeviceTelemetry[] {
  return db
    .select({
      pingMs: deviceTelemetrySamples.pingMs,
      downlinkKbps: deviceTelemetrySamples.downlinkKbps,
      networkRttMs: deviceTelemetrySamples.networkRttMs,
      stateLatencyMs: deviceTelemetrySamples.stateLatencyMs,
      effectiveType: deviceTelemetrySamples.effectiveType,
      at: deviceTelemetrySamples.at,
    })
    .from(deviceTelemetrySamples)
    .where(and(eq(deviceTelemetrySamples.companyId, companyId), eq(deviceTelemetrySamples.screenId, screenId)))
    .orderBy(desc(deviceTelemetrySamples.at))
    .limit(limit)
    .all()
}

/** Разобранные возможности устройства: сохраняет плеер, читает панель. */
export function parseCapabilities(json: string | null): Record<string, unknown> | null {
  if (!json) return null

  try {
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    // Повреждённый JSON — это «неизвестно», а не повод уронить страницу экрана.
    return null
  }
}

export type ScreenIncident = {
  id: string
  type: string
  openedAt: Date
  closedAt: Date | null
  detail: string | null
}

export type ScreenDetail = ScreenListItem & {
  /** Что решатель расписания хочет показывать на этом экране сейчас. */
  planned: { id: string; name: string; version: number } | null
  /** Что реально выложено и подтверждено. */
  published: { id: string; name: string; version: number } | null
  nextChangeAt: Date | null
  capabilities: Record<string, unknown> | null
  telemetry: DeviceTelemetry | null
  telemetryHistory: DeviceTelemetry[]
  incidents: ScreenIncident[]
  errors: { code: string; message: string; at: Date }[]
  playedLast24h: number
}

/**
 * Карточка экрана: всё, что нужно, чтобы понять состояние одного телевизора.
 *
 * Собрано в одном месте намеренно: оператор приходит сюда с вопросом «что с
 * этим экраном», и разложить ответ по пяти страницам значило бы заставить его
 * искать самому.
 */
export function getScreenDetail(companyId: string, screenId: string): ScreenDetail {
  const list = listScreens(companyId)
  const base = list.find((item) => item.id === screenId)

  if (!base) throw HttpError.notFound('Экран не найден')

  const publishedVersionId = db
    .select({ playlistVersionId: screenPublications.playlistVersionId })
    .from(screenPublications)
    .where(eq(screenPublications.screenId, screenId))
    .get()?.playlistVersionId ?? null

  const plan = planForScreen(companyId, screenId)

  const telemetryRows = telemetryHistory(companyId, screenId)

  const incidents = db
    .select({
      id: deviceIncidents.id,
      type: deviceIncidents.type,
      openedAt: deviceIncidents.openedAt,
      closedAt: deviceIncidents.closedAt,
      detail: deviceIncidents.detail,
    })
    .from(deviceIncidents)
    .where(eq(deviceIncidents.screenId, screenId))
    .orderBy(desc(deviceIncidents.openedAt))
    .limit(10)
    .all()

  const errors = db
    .select({ code: playerErrors.code, message: playerErrors.message, at: playerErrors.at })
    .from(playerErrors)
    .where(eq(playerErrors.screenId, screenId))
    .orderBy(desc(playerErrors.at))
    .limit(5)
    .all()

  const played = db
    .select({ count: sql<number>`count(*)` })
    .from(playbackEvents)
    .where(
      and(
        eq(playbackEvents.screenId, screenId),
        eq(playbackEvents.event, 'started'),
        gte(playbackEvents.at, new Date(Date.now() - 24 * 60 * 60_000)),
      ),
    )
    .get()

  return {
    ...base,
    planned: describePlaylistVersion(plan.playlistVersionId),
    published: describePlaylistVersion(publishedVersionId),
    nextChangeAt: plan.nextChangeAt,
    capabilities: parseCapabilities(capabilitiesJsonOf(screenId)),
    telemetry: telemetryRows[0] ?? null,
    telemetryHistory: telemetryRows,
    incidents,
    errors,
    playedLast24h: Number(played?.count ?? 0),
  }
}

function capabilitiesJsonOf(screenId: string): string | null {
  return (
    db
      .select({ capabilitiesJson: screens.capabilitiesJson })
      .from(screens)
      .where(eq(screens.id, screenId))
      .get()?.capabilitiesJson ?? null
  )
}

/** Правка экрана: имя и принадлежность. Это не «перепривязка» — доступ не меняется. */
export function updateScreen(params: {
  companyId: string
  screenId: string
  name?: string
  branchId?: string | null
  groupId?: string | null
  offlineAfterSec?: number
}): void {
  const screen = db
    .select()
    .from(screens)
    .where(and(eq(screens.id, params.screenId), eq(screens.companyId, params.companyId)))
    .get()

  if (!screen) throw HttpError.notFound('Экран не найден')

  const update: Partial<typeof screens.$inferInsert> = { updatedAt: new Date() }

  if (params.name !== undefined) {
    const name = params.name.trim().slice(0, 120)
    if (name.length === 0) throw HttpError.badRequest('invalid_input', 'Укажите название экрана')
    update.name = name
  }

  if (params.branchId !== undefined) {
    if (params.branchId) requireBranch(params.companyId, params.branchId)
    update.branchId = params.branchId
  }

  if (params.groupId !== undefined) {
    if (params.groupId) requireGroup(params.companyId, params.groupId)
    update.groupId = params.groupId
  }

  if (params.offlineAfterSec !== undefined) {
    const value = Math.min(3600, Math.max(30, Math.round(params.offlineAfterSec)))
    update.offlineAfterSec = value
  }

  db.update(screens).set(update).where(eq(screens.id, params.screenId)).run()

  recordAudit({
    companyId: params.companyId,
    action: 'screen.updated',
    targetType: 'screen',
    targetId: params.screenId,
    meta: {
      name: update.name ?? screen.name,
      branchId: update.branchId ?? screen.branchId,
      groupId: update.groupId ?? screen.groupId,
    },
  })
}
