/**
 * Движок публикации: назначение контента экранам, сборка манифеста,
 * доставка и учёт подтверждений.
 *
 * Здесь появляются четыре числа, ради которых написан продукт:
 * отправлено, применили, загружают, нет связи. Они не рисуются — они
 * считаются из receipts и времени последнего heartbeat.
 */
import { and, asc, desc, eq, inArray, lt, or, sql } from 'drizzle-orm'
import { db, withImmediateTransaction } from '@/db/client'
import {
  branches,
  deliveryReceipts,
  mediaAssets,
  playlistVersionItems,
  playlistVersions,
  releaseAssignments,
  releaseTargets,
  releases,
  screenGroups,
  screenPublications,
  screens,
} from '@/db/schema'
import { serverConfig } from '@/config/server'
import { buildManifest } from '@/domain/release/manifest'
import { extensionForMime } from '@/server/services/media-service'
import type { PlayerManifest } from '@/player/engine'
import { HttpError } from '@/server/http/errors'
import { logger } from '@/lib/logger'

/** Адрес файла, который телевизор запрашивает у сервера. */
export function playbackUrl(mediaId: string): string {
  return `/api/player/media/${mediaId}`
}

/**
 * Раскрытие области назначения в конкретные экраны.
 *
 * Назначение может быть на компанию, филиал, группу или конкретный экран.
 * Экраны ищутся напрямую в базе, а не собираются каскадом: так назначение
 * на всю сеть из 80 экранов остаётся одним запросом с индексом, а не
 * семьюдесятью.
 */
export function resolveScreens(companyId: string, scopeType: string, scopeId: string): string[] {
  const conditions = [eq(screens.companyId, companyId), ne_(screens.status, 'revoked')]

  switch (scopeType) {
    case 'company':
      break
    case 'branch':
      conditions.push(eq(screens.branchId, scopeId))
      break
    case 'group':
      conditions.push(eq(screens.groupId, scopeId))
      break
    case 'screen':
      conditions.push(eq(screens.id, scopeId))
      break
    default:
      throw HttpError.badRequest('invalid_scope', 'Неизвестная область назначения')
  }

  return db
    .select({ id: screens.id })
    .from(screens)
    .where(and(...conditions))
    .orderBy(asc(screens.id))
    .all()
    .map((row) => row.id)
}

/** SQLite не знает оператора «не равно» для перечисления, поэтому здесь явная форма. */
function ne_(column: typeof screens.status, value: string) {
  return sql`${column} <> ${value}`
}

export type AssignInput = {
  companyId: string
  scopeType: 'screen' | 'group' | 'branch' | 'company'
  scopeId: string
  playlistVersionId: string
  /** Запасной плейлист, когда основной недоступен. */
  fallbackPlaylistVersionId?: string | null
  priority?: number
}

/**
 * Назначение плейлиста на область экранов.
 *
 * Назначение перезаписывает предыдущее для той же области: оператор
 * не должен знать про слои назначений, ему нужно «здесь показывать это».
 */
export function assignPlaylist(input: AssignInput): { screens: number } {
  const version = db
    .select({ id: playlistVersions.id, playlistId: playlistVersions.playlistId })
    .from(playlistVersions)
    .where(eq(playlistVersions.id, input.playlistVersionId))
    .get()

  if (!version) {
    throw HttpError.badRequest('unknown_version', 'Версия плейлиста не найдена')
  }

  const targetScreens = resolveScreens(input.companyId, input.scopeType, input.scopeId)

  if (targetScreens.length === 0) {
    throw HttpError.badRequest('empty_scope', 'В выбранной области нет экранов')
  }

  withImmediateTransaction((tx) => {
    tx.delete(releaseAssignments)
      .where(
        and(
          eq(releaseAssignments.companyId, input.companyId),
          eq(releaseAssignments.scopeType, input.scopeType),
          eq(releaseAssignments.scopeId, input.scopeId),
        ),
      )
      .run()

    tx.insert(releaseAssignments)
      .values({
        id: crypto.randomUUID(),
        companyId: input.companyId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        playlistVersionId: input.playlistVersionId,
        fallbackPlaylistVersionId: input.fallbackPlaylistVersionId ?? null,
        priority: input.priority ?? 0,
      })
      .run()
  })

  return { screens: targetScreens.length }
}

export function listAssignments(companyId: string) {
  return db
    .select()
    .from(releaseAssignments)
    .where(eq(releaseAssignments.companyId, companyId))
    .orderBy(desc(releaseAssignments.priority))
    .all()
}

/**
 * Выбор назначения для конкретного экрана.
 *
 * Порядок тот же, что в §7 плана: сначала приоритет, затем специфичность
 * области, затем стабильный тай-брейкер по идентификатору. Без последнего
 * два одинаковых назначения давали бы разный результат в зависимости от
 * порядка строк в базе.
 */
const SPECIFICITY: Record<string, number> = {
  screen: 4,
  group: 3,
  branch: 2,
  company: 1,
}

export function pickAssignment(companyId: string, screenId: string) {
  const screen = db.select().from(screens).where(eq(screens.id, screenId)).get()
  if (!screen) return null

  const candidates = db
    .select()
    .from(releaseAssignments)
    .where(eq(releaseAssignments.companyId, companyId))
    .all()

  if (candidates.length === 0) return null

  const matches = candidates.filter((assignment) => {
    switch (assignment.scopeType) {
      case 'company':
        return true
      case 'branch':
        return assignment.scopeId === screen.branchId
      case 'group':
        return assignment.scopeId === screen.groupId
      case 'screen':
        return assignment.scopeId === screenId
      default:
        return false
    }
  })

  if (matches.length === 0) return null

  matches.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    const specA = SPECIFICITY[a.scopeType] ?? 0
    const specB = SPECIFICITY[b.scopeType] ?? 0
    if (specB !== specA) return specB - specA
    // Тай-брейкер: результат обязан быть воспроизводимым.
    return a.id.localeCompare(b.id)
  })

  return matches[0] ?? null
}

/** Сборка манифеста экрана из назначенной версии плейлиста. */
export function buildScreenManifest(companyId: string, screenId: string, version: number): PlayerManifest | null {
  const assignment = pickAssignment(companyId, screenId)
  if (!assignment) return null

  const rows = db
    .select({
      itemId: playlistVersionItems.id,
      position: playlistVersionItems.position,
      durationMs: playlistVersionItems.durationMs,
      playPolicy: playlistVersionItems.playPolicy,
      transition: playlistVersionItems.transition,
      audio: playlistVersionItems.audio,
      assetId: mediaAssets.id,
      assetKind: mediaAssets.kind,
      assetDurationMs: mediaAssets.durationMs,
      state: mediaAssets.state,
      playbackSha256: mediaAssets.playbackSha256,
      mime: mediaAssets.mime,
    })
    .from(playlistVersionItems)
    .innerJoin(mediaAssets, eq(mediaAssets.id, playlistVersionItems.mediaAssetId))
    .where(eq(playlistVersionItems.versionId, assignment.playlistVersionId))
    .orderBy(asc(playlistVersionItems.position))
    .all()

  // Неготовый файл исключаем, а не показываем: экран обязан показывать
  // что-то рабочее, а оператор увидит пропуск в отчёте.
  const playable = rows.filter((row) => row.state === 'ready' && row.assetKind !== 'template')

  if (playable.length === 0) return null

  const now = new Date()

  return buildManifest({
    version,
    screenId,
    companyId,
    nextChangeAt: null,
    items: playable.map((row) => ({
      id: row.itemId,
      kind: row.assetKind === 'video' ? ('video' as const) : ('image' as const),
      assetDurationMs: row.assetDurationMs,
      durationMs: row.durationMs,
      playPolicy: row.playPolicy,
      url: playbackUrl(row.assetId),
      mime: extensionForMime(row.mime) ? row.mime : 'application/octet-stream',
      transition: row.transition,
      audio: row.audio,
    })),
    now,
  })
}

export type PublishResult = {
  releaseId: string
  version: number
  screens: number
}

/**
 * Публикация назначенного контента на экраны.
 *
 * Номер версии растёт на компанию, а не на экран: экран получает ту же
 * версию, что и соседние, и публикация «на всю сеть» остаётся одной
 * операцией с одним набором receipts.
 */
export function publishCompany(companyId: string, actorUserId: string, reason?: string): PublishResult {
  const companyScreens = db
    .select({ id: screens.id, offlineAfterSec: screens.offlineAfterSec, lastSeenAt: screens.lastSeenAt })
    .from(screens)
    .where(and(eq(screens.companyId, companyId), ne_(screens.status, 'revoked')))
    .all()

  const assigned = companyScreens
    .map((screen) => ({ screen, assignment: pickAssignment(companyId, screen.id) }))
    .filter((entry) => entry.assignment !== null)

  if (assigned.length === 0) {
    throw HttpError.badRequest('nothing_assigned', 'Ни одному экрану не назначен плейлист')
  }

  return withImmediateTransaction((tx) => {
    const last = tx
      .select({ max: sql<number | null>`max(${releases.manifestVersion})` })
      .from(releases)
      .where(eq(releases.companyId, companyId))
      .get()?.max

    const version = (last ?? 0) + 1
    const releaseId = crypto.randomUUID()

    // Один релиз на публикацию, таргеты — по экранам.
    // Манифесты хранятся по экранам: состав может отличаться из-за
    // специфичных назначений и доступности файлов.
    tx.insert(releases)
      .values({
        id: releaseId,
        companyId,
        manifestVersion: version,
        manifestJson: '{}',
        manifestHash: '',
        itemCount: 0,
        reason: reason ?? null,
        createdByUserId: actorUserId,
      })
      .run()

    const now = new Date()
    let itemCount = 0

    for (const { screen } of assigned) {
      const manifest = buildScreenManifest(companyId, screen.id, version)

      tx.insert(releaseTargets).values({ id: crypto.randomUUID(), releaseId, screenId: screen.id }).run()

      tx.insert(screenPublications)
        .values({
          screenId: screen.id,
          companyId,
          desiredReleaseId: releaseId,
          desiredVersion: version,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: screenPublications.screenId,
          set: { desiredReleaseId: releaseId, desiredVersion: version, updatedAt: now },
        })
        .run()

      tx.insert(deliveryReceipts)
        .values({
          id: crypto.randomUUID(),
          releaseId,
          screenId: screen.id,
          state: 'queued',
          updatedAt: now,
        })
        .onConflictDoNothing()
        .run()

      if (manifest) {
        itemCount = Math.max(itemCount, manifest.items.length)
      }
    }

    tx.update(releases)
      .set({ itemCount, manifestHash: hashAll(assigned.map((entry) => entry.screen.id), version) })
      .where(eq(releases.id, releaseId))
      .run()

    return { releaseId, version, screens: assigned.length }
  })
}

/** Общий хеш публикации: даёт детерминированный идентификатор набора экранов. */
function hashAll(screenIds: string[], version: number): string {
  return sha256Hex(JSON.stringify({ version, screens: [...screenIds].sort() }))
}

function sha256Hex(value: string): string {
  // Импортируется выше как sha256Hex; локальная обёртка не нужна.
  return require_sha(value)
}

import { sha256Hex as require_sha } from '@/lib/crypto'

/** Состояние публикации для устройства. */
export function stateForScreen(companyId: string, screenId: string) {
  const publication = db
    .select()
    .from(screenPublications)
    .where(eq(screenPublications.screenId, screenId))
    .get()

  const manifest =
    publication?.desiredVersion != null
      ? buildScreenManifest(companyId, screenId, publication.desiredVersion)
      : null

  return {
    manifest,
    desiredVersion: publication?.desiredVersion ?? null,
    appliedVersion: publication?.appliedVersion ?? null,
    appliedAt: publication?.appliedAt ?? null,
  }
}

/**
 * Четыре числа доставки.
 *
 * «Нет связи» определяется по heartbeat, а не по наличию сокета: сетевые
 * подключения разных сокетов не видны обработчикам маршрутов, а в базе
 * хранится истина. Порог берётся из настроек экрана.
 */
export type DeliverySummary = {
  sent: number
  applied: number
  downloading: number
  noContact: number
  total: number
}

export function deliverySummary(companyId: string, releaseId?: string): DeliverySummary {
  const now = Date.now()

  const rows = db
    .select({
      screenId: deliveryReceipts.screenId,
      state: deliveryReceipts.state,
      sentAt: deliveryReceipts.sentAt,
      offlineAfterSec: screens.offlineAfterSec,
      lastSeenAt: screens.lastSeenAt,
      recordStatus: screens.status,
    })
    .from(deliveryReceipts)
    .innerJoin(screens, eq(screens.id, deliveryReceipts.screenId))
    .leftJoin(releaseTargets, eq(releaseTargets.screenId, screens.id))
    .where(
      releaseId
        ? eq(deliveryReceipts.releaseId, releaseId)
        : eq(screens.companyId, companyId),
    )
    .all()

  const summary: DeliverySummary = { sent: 0, applied: 0, downloading: 0, noContact: 0, total: rows.length }

  for (const row of rows) {
    const ageSeconds = row.lastSeenAt ? Math.floor((now - row.lastSeenAt.getTime()) / 1000) : Number.MAX_SAFE_INTEGER
    const isOffline = ageSeconds > (row.offlineAfterSec ?? serverConfig.player.offlineAfterSec)

    // Экран без связи не может быть «применил»: его последнее подтверждение
    // относится к прошлой публикации.
    if (isOffline || row.recordStatus !== 'paired') {
      summary.noContact += 1
      continue
    }

    if (row.state === 'applied') {
      summary.applied += 1
      summary.sent += 1
      continue
    }

    if (row.state === 'sent' || row.state === 'downloading' || row.state === 'queued') {
      summary.sent += 1
      summary.downloading += 1
    }
  }

  return summary
}

export function listRecentReleases(companyId: string, limit = 20) {
  return db
    .select()
    .from(releases)
    .where(eq(releases.companyId, companyId))
    .orderBy(desc(releases.manifestVersion))
    .limit(limit)
    .all()
}

export function getRelease(releaseId: string) {
  return db.select().from(releases).where(eq(releases.id, releaseId)).get()
}

export function receiptsForRelease(releaseId: string) {
  return db
    .select({
      screenId: deliveryReceipts.screenId,
      state: deliveryReceipts.state,
      sentAt: deliveryReceipts.sentAt,
      ackedAt: deliveryReceipts.ackedAt,
      errorCode: deliveryReceipts.errorCode,
      screenName: screens.name,
      lastSeenAt: screens.lastSeenAt,
    })
    .from(deliveryReceipts)
    .innerJoin(screens, eq(screens.id, deliveryReceipts.screenId))
    .where(eq(deliveryReceipts.releaseId, releaseId))
    .orderBy(asc(screens.name))
    .all()
}

/** Публикации, которые экраны ещё не применили: их имеет смысл повторить. */
export function staleReceipts(olderThanMs = 5 * 60_000) {
  const threshold = Date.now() - olderThanMs

  return db
    .select()
    .from(deliveryReceipts)
    .where(
      and(
        inArray(deliveryReceipts.state, ['queued', 'sent', 'downloading', 'failed']),
        lt(deliveryReceipts.updatedAt, new Date(threshold)),
      ),
    )
    .all()
}

export { branches, screenGroups, releaseTargets, deliveryReceipts, releaseAssignments, playlistVersions }
