/**
 * Автосохранение плейлиста на экраны.
 *
 * В продукте больше нет отдельной кнопки «опубликовать версию»: оператор
 * меняет состав, и это сразу становится текущей программой. Технически версии
 * остаются внутри — на них ссылаются публикации и кампании, — но каждая правка
 * выпускает новую версию и переключает на неё существующие назначения.
 *
 * Иначе получалось бы ровно то, на что жаловался оператор: плейлист изменён,
 * а телевизор продолжает играть старый снимок до ручной публикации.
 */
import { and, eq, inArray, ne, or } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  campaigns,
  campaignTargets,
  playlistVersions,
  releaseAssignments,
  screens,
} from '@/db/schema'
import { logger } from '@/lib/logger'
import { publishPlaylist } from './playlist-service'
import { publishScreens, resolveScreens } from './release-service'
import { invalidatePlanCache } from './schedule-service'

export type PlaylistSyncResult = {
  /** Удалось ли выпустить новую версию и переключить назначения. */
  applied: boolean
  version: number | null
  /** Сколько экранов получило обновление. */
  screens: number
  reason?: string
}

/**
 * Пересобрать версию и разослать её туда, где плейлист уже назначен.
 *
 * Вызывается после каждого изменения состава. Ошибка автосохранения не должна
 * отменять само изменение: состав уже записан, а оператор увидит предупреждение
 * и сможет повторить позже.
 */
export function syncPlaylistToScreens(params: {
  companyId: string
  playlistId: string
  actorUserId: string
}): PlaylistSyncResult {
  const oldVersions = db
    .select({ id: playlistVersions.id })
    .from(playlistVersions)
    .where(eq(playlistVersions.playlistId, params.playlistId))
    .all()
    .map((row) => row.id)

  let published
  try {
    published = publishPlaylist({
      companyId: params.companyId,
      playlistId: params.playlistId,
      actorUserId: params.actorUserId,
      note: 'автосохранение',
      allowEmpty: true,
      // Каждое движение стрелки не должно выглядеть в журнале как ручная
      // публикация. Сам факт правки состава остаётся в истории плейлиста.
      audit: false,
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'не удалось обновить версию'
    logger.warn({ err: error, playlistId: params.playlistId }, 'плейлист сохранён, но не отправлен на экраны')
    return { applied: false, version: null, screens: 0, reason }
  }

  const now = new Date()

  // Переключаем все места, которые ссылались на прежние версии этого
  // плейлиста: постоянные назначения и кампании. Иначе расписание продолжало
  // бы выбирать старый снимок.
  db.transaction((tx) => {
    if (oldVersions.length > 0) {
      tx.update(releaseAssignments)
        .set({ playlistVersionId: published.versionId, updatedAt: now })
        .where(inArray(releaseAssignments.playlistVersionId, oldVersions))
        .run()

      tx.update(releaseAssignments)
        .set({ fallbackPlaylistVersionId: published.versionId, updatedAt: now })
        .where(inArray(releaseAssignments.fallbackPlaylistVersionId, oldVersions))
        .run()

      tx.update(campaigns)
        .set({ playlistVersionId: published.versionId, updatedAt: now })
        .where(inArray(campaigns.playlistVersionId, oldVersions))
        .run()

      tx.update(campaigns)
        .set({ fallbackPlaylistVersionId: published.versionId, updatedAt: now })
        .where(inArray(campaigns.fallbackPlaylistVersionId, oldVersions))
        .run()
    }
  })

  invalidatePlanCache(params.companyId)

  const screenIds = new Set<string>()

  const assignments = db
    .select({
      scopeType: releaseAssignments.scopeType,
      scopeId: releaseAssignments.scopeId,
    })
    .from(releaseAssignments)
    .where(
      and(
        eq(releaseAssignments.companyId, params.companyId),
        or(
          eq(releaseAssignments.playlistVersionId, published.versionId),
          eq(releaseAssignments.fallbackPlaylistVersionId, published.versionId),
        ),
      ),
    )
    .all()

  for (const assignment of assignments) {
    for (const screenId of resolveScreens(params.companyId, assignment.scopeType, assignment.scopeId)) {
      screenIds.add(screenId)
    }
  }

  const campaignRows = db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.companyId, params.companyId),
        or(
          eq(campaigns.playlistVersionId, published.versionId),
          eq(campaigns.fallbackPlaylistVersionId, published.versionId),
        ),
      ),
    )
    .all()

  if (campaignRows.length > 0) {
    const targets = db
      .select({ scopeType: campaignTargets.scopeType, scopeId: campaignTargets.scopeId })
      .from(campaignTargets)
      .where(inArray(campaignTargets.campaignId, campaignRows.map((row) => row.id)))
      .all()

    for (const target of targets) {
      for (const screenId of resolveScreens(params.companyId, target.scopeType, target.scopeId)) {
        screenIds.add(screenId)
      }
    }
  }

  if (screenIds.size === 0) {
    return { applied: true, version: published.version, screens: 0 }
  }

  const known = db
    .select({ id: screens.id })
    .from(screens)
    .where(
      and(
        eq(screens.companyId, params.companyId),
        ne(screens.status, 'revoked'),
        inArray(screens.id, [...screenIds]),
      ),
    )
    .all()

  if (known.length === 0) {
    return { applied: true, version: published.version, screens: 0 }
  }

  try {
    // Именно publishScreens, а не прямая рассылка: он создаёт манифест,
    // чеки доставки и желаемую версию, а канал доставляет его за секунды.
    publishScreens({
      companyId: params.companyId,
      screenIds: known.map((row) => row.id),
      actorUserId: params.actorUserId,
      reason: 'плейлист обновлён',
      audit: false,
    })
  } catch (error) {
    logger.error({ err: error, playlistId: params.playlistId }, 'не удалось опубликовать обновление плейлиста')
    return {
      applied: true,
      version: published.version,
      screens: 0,
      reason: 'версия обновлена, но публикация на экраны не создана',
    }
  }

  logger.info(
    { playlistId: params.playlistId, version: published.version, screens: known.length },
    'плейлист автосохранён на экраны',
  )

  return { applied: true, version: published.version, screens: known.length }
}
