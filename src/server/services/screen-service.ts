import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { branches, deviceCredentials, screenGroups, screenPublications, screens } from '@/db/schema'
import { deviceHub } from '@/server/ws/hub'
import type { ScreenState } from '@/components/ui/status-badge'

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
 * Итоговое состояние экрана.
 *
 * Живое соединение важнее отметки времени: сеть торгового центра мигает
 * постоянно, и по одному только heartbeat экран выглядел бы «нет связи»
 * каждые несколько секунд. Порог `offlineAfterSec` (по умолчанию 90 секунд)
 * существует именно для этой терпимости.
 */
function computeOnlineState(params: {
  recordStatus: ScreenListItem['recordStatus']
  live: boolean
  lastSeenAt: Date | null
  offlineAfterSec: number
  now: number
}): ScreenState {
  const { recordStatus, live, lastSeenAt, offlineAfterSec, now } = params

  if (recordStatus === 'revoked') return 'revoked'
  if (recordStatus === 'disabled') return 'disabled'
  if (recordStatus === 'unpaired') return 'unpaired'

  if (live) return 'online'

  if (lastSeenAt) {
    const ageSeconds = Math.floor((now - lastSeenAt.getTime()) / 1000)
    if (ageSeconds <= offlineAfterSec) return 'online'
  }

  return 'offline'
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
      live: deviceHub.isOnline(row.id),
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

export function getRecentActivity(companyId: string, limit = 10) {
  return db
    .select()
    .from(screens)
    .where(eq(screens.companyId, companyId))
    .orderBy(desc(screens.updatedAt))
    .limit(limit)
    .all()
}
