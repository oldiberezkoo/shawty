import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  auditLog,
  mediaAssets,
  playlistItems,
  playlistVersionItems,
  playlistVersions,
  playlists,
  releaseAssignments,
} from '@/db/schema'
import { serverConfig } from '@/config/server'
import {
  cycleDurationMs,
  effectiveDurationMs,
  normalizePositions,
  PlaylistRuleError,
  reorderByIds,
  validateDraft,
  type PlaylistItemInput,
} from '@/domain/playlist/rules'
import { HttpError } from '@/server/http/errors'

export type PlaylistItemView = PlaylistItemInput & {
  mime: string
  bytes: number
  state: string
  assetKind: 'image' | 'video' | 'template'
  hasPoster: boolean
  width: number | null
  height: number | null
  transition: 'none' | 'fade'
  audio: 'keep' | 'mute'
}

export type PlaylistDetail = {
  id: string
  name: string
  state: 'draft' | 'published'
  version: number | null
  cycleDurationMs: number
  items: PlaylistItemView[]
  updatedAt: Date
  /** Назначен ли плейлист хоть куда-то: от этого зависит, можно ли его удалить. */
  assigned: boolean
}

function loadItems(playlistId: string): PlaylistItemView[] {
  const rows = db
    .select({
      id: playlistItems.id,
      position: playlistItems.position,
      // Длительность показа задаётся в плейлисте и может переопределять
      // длительность ассета. Это два разных поля, и путать их нельзя.
      durationMs: playlistItems.durationMs,
      playPolicy: playlistItems.playPolicy,
      transition: playlistItems.transition,
      audio: playlistItems.audio,
      assetKind: mediaAssets.kind,
      assetDurationMs: mediaAssets.durationMs,
      mime: mediaAssets.mime,
      bytes: mediaAssets.bytes,
      state: mediaAssets.state,
      hasPoster: sql<boolean>`${mediaAssets.posterSha256} is not null`,
      width: mediaAssets.width,
      height: mediaAssets.height,
    })
    .from(playlistItems)
    .innerJoin(mediaAssets, eq(mediaAssets.id, playlistItems.mediaAssetId))
    .where(eq(playlistItems.playlistId, playlistId))
    .orderBy(asc(playlistItems.position))
    .all()

  return rows.map((row) => ({
    id: row.id,
    position: row.position,
    durationMs: row.durationMs,
    playPolicy: row.playPolicy,
    transition: row.transition,
    audio: row.audio,
    assetKind: row.assetKind,
    assetDurationMs: row.assetDurationMs,
    mime: row.mime,
    bytes: row.bytes,
    state: row.state,
    hasPoster: Boolean(row.hasPoster),
    width: row.width,
    height: row.height,
  }))
}

function isAssigned(playlistId: string): boolean {
  const count = db
    .select({ n: sql<number>`count(*)` })
    .from(releaseAssignments)
    .innerJoin(playlistVersions, eq(playlistVersions.id, releaseAssignments.playlistVersionId))
    .where(eq(playlistVersions.playlistId, playlistId))
    .get()

  return Number(count?.n ?? 0) > 0
}

export function getPlaylist(companyId: string, playlistId: string): PlaylistDetail {
  const playlist = db
    .select()
    .from(playlists)
    .where(and(eq(playlists.id, playlistId), eq(playlists.companyId, companyId)))
    .get()

  if (!playlist) {
    throw HttpError.notFound('Плейлист не найден')
  }

  const items = loadItems(playlistId)

  return {
    id: playlist.id,
    name: playlist.name,
    state: playlist.state,
    version: playlist.currentVersionId ? versionNumber(playlist.currentVersionId) : null,
    cycleDurationMs: cycleDurationMs(items, serverConfig.media.defaultImageDurationMs),
    items,
    updatedAt: playlist.updatedAt,
    assigned: isAssigned(playlistId),
  }
}

function versionNumber(versionId: string): number | null {
  const row = db
    .select({ version: playlistVersions.version })
    .from(playlistVersions)
    .where(eq(playlistVersions.id, versionId))
    .get()
  return row?.version ?? null
}

export type PlaylistSummary = {
  id: string
  name: string
  state: 'draft' | 'published'
  version: number | null
  items: number
  cycleDurationMs: number
  updatedAt: Date
  assigned: boolean
}

export function listPlaylists(companyId: string): PlaylistSummary[] {
  const rows = db
    .select()
    .from(playlists)
    .where(eq(playlists.companyId, companyId))
    .orderBy(asc(playlists.name))
    .all()

  return rows.map((playlist) => {
    const items = loadItems(playlist.id)
    return {
      id: playlist.id,
      name: playlist.name,
      state: playlist.state,
      version: playlist.currentVersionId ? versionNumber(playlist.currentVersionId) : null,
      items: items.length,
      cycleDurationMs: cycleDurationMs(items, serverConfig.media.defaultImageDurationMs),
      updatedAt: playlist.updatedAt,
      assigned: isAssigned(playlist.id),
    }
  })
}

export function createPlaylist(params: {
  companyId: string
  actorUserId: string
  name: string
}): { id: string } {
  const name = params.name.trim().slice(0, 120)
  if (name.length === 0) {
    throw HttpError.badRequest('invalid_input', 'Укажите название плейлиста')
  }

  const id = crypto.randomUUID()

  db.insert(playlists)
    .values({ id, companyId: params.companyId, name, state: 'draft', createdByUserId: params.actorUserId })
    .run()

  return { id }
}

export function renamePlaylist(companyId: string, playlistId: string, name: string): void {
  const trimmed = name.trim().slice(0, 120)
  if (trimmed.length === 0) {
    throw HttpError.badRequest('invalid_input', 'Укажите название плейлиста')
  }

  requirePlaylist(companyId, playlistId)
  db.update(playlists).set({ name: trimmed, updatedAt: new Date() }).where(eq(playlists.id, playlistId)).run()
}

function requirePlaylist(companyId: string, playlistId: string) {
  const playlist = db
    .select()
    .from(playlists)
    .where(and(eq(playlists.id, playlistId), eq(playlists.companyId, companyId)))
    .get()

  if (!playlist) throw HttpError.notFound('Плейлист не найден')
  return playlist
}

/**
 * Копирование плейлиста вместе с составом.
 *
 * Версии при этом НЕ копируются: новая копия начинается как черновик.
 * Иначе копия была бы навсегда привязана к снимку чужого состояния.
 */
export function duplicatePlaylist(companyId: string, playlistId: string, actorUserId: string): { id: string } {
  const source = requirePlaylist(companyId, playlistId)
  const items = loadItems(playlistId)

  const newId = crypto.randomUUID()
  const name = `${source.name} — копия`.slice(0, 120)

  db.transaction((tx) => {
    tx.insert(playlists)
      .values({ id: newId, companyId, name, state: 'draft', createdByUserId: actorUserId })
      .run()

    for (const item of items) {
      tx.insert(playlistItems)
        .values({
          id: crypto.randomUUID(),
          playlistId: newId,
          mediaAssetId: mediaAssetIdOf(item.id),
          position: item.position,
          durationMs: item.durationMs,
          playPolicy: item.playPolicy,
          transition: item.transition,
          audio: item.audio,
        })
        .run()
    }
  })

  return { id: newId }
}

/** Идентификатор ассета по элементу плейлиста. */
function mediaAssetIdOf(itemId: string): string {
  const row = db
    .select({ assetId: playlistItems.mediaAssetId })
    .from(playlistItems)
    .where(eq(playlistItems.id, itemId))
    .get()

  if (!row) throw new HttpError(500, 'internal', 'Элемент плейлиста не найден')
  return row.assetId
}

export function addItems(params: {
  companyId: string
  playlistId: string
  assetIds: string[]
  durationMs?: number | null
}): { added: number; skipped: string[] } {
  requirePlaylist(params.companyId, params.playlistId)

  if (params.assetIds.length === 0) return { added: 0, skipped: [] }

  const assets = db
    .select({ id: mediaAssets.id, kind: mediaAssets.kind, state: mediaAssets.state })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.companyId, params.companyId), inArray(mediaAssets.id, params.assetIds)))
    .all()

  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  const skipped: string[] = []
  const usable: typeof assets = []

  for (const assetId of params.assetIds) {
    const asset = byId.get(assetId)
    if (!asset) {
      throw HttpError.notFound(`Файл не найден: ${assetId}`)
    }
    // Шаблон макета нельзя показать на экране: это документ, а не файл (P9).
    if (asset.state !== 'ready' || asset.kind === 'template') {
      skipped.push(assetId)
      continue
    }
    usable.push(asset)
  }

  const startPosition =
    db
      .select({ max: sql<number | null>`max(${playlistItems.position})` })
      .from(playlistItems)
      .where(eq(playlistItems.playlistId, params.playlistId))
      .get()?.max ?? -1

  db.transaction((tx) => {
    usable.forEach((asset, index) => {
      tx.insert(playlistItems)
        .values({
          id: crypto.randomUUID(),
          playlistId: params.playlistId,
          mediaAssetId: asset.id,
          position: startPosition + 1 + index,
          durationMs: params.durationMs ?? null,
          playPolicy: 'loop_once',
          transition: 'none',
          audio: asset.kind === 'video' ? 'keep' : 'mute',
        })
        .run()
    })

    tx.update(playlists)
      .set({ state: 'draft', updatedAt: new Date() })
      .where(eq(playlists.id, params.playlistId))
      .run()
  })

  return { added: usable.length, skipped }
}

/**
 * Перестановка.
 *
 * Изменение всегда переводит плейлист в черновик: опубликованная версия
 * остаётся неизменной и продолжает играть на экранах, пока оператор
 * не выпустит новую.
 */
export function reorderItems(companyId: string, playlistId: string, orderedItemIds: string[]): void {
  requirePlaylist(companyId, playlistId)

  const items = db
    .select({ id: playlistItems.id, position: playlistItems.position })
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, playlistId))
    .all()

  try {
    const reordered = reorderByIds(items, orderedItemIds)

    db.transaction((tx) => {
      for (const item of reordered) {
        tx.update(playlistItems).set({ position: item.position }).where(eq(playlistItems.id, item.id)).run()
      }
      tx.update(playlists).set({ state: 'draft', updatedAt: new Date() }).where(eq(playlists.id, playlistId)).run()
    })
  } catch (error) {
    if (error instanceof PlaylistRuleError) {
      throw HttpError.badRequest('invalid_order', error.message)
    }
    throw error
  }
}

export function removeItem(companyId: string, playlistId: string, itemId: string): void {
  requirePlaylist(companyId, playlistId)

  db.transaction((tx) => {
    tx.delete(playlistItems)
      .where(and(eq(playlistItems.id, itemId), eq(playlistItems.playlistId, playlistId)))
      .run()
    tx.update(playlists).set({ state: 'draft', updatedAt: new Date() }).where(eq(playlists.id, playlistId)).run()
  })

  compactPositions(playlistId)
}

/**
 * Перенумерация позиций после удаления.
 *
 * Пропуски в позициях не ломают порядок, но делают следующий `max(position)`
 * завышенным и мешают считать длительность цикла, поэтому схлопываем.
 */
function compactPositions(playlistId: string): void {
  const items = db
    .select({ id: playlistItems.id, position: playlistItems.position })
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, playlistId))
    .orderBy(asc(playlistItems.position))
    .all()

  const normalized = normalizePositions(items)

  db.transaction((tx) => {
    for (const [index, item] of normalized.entries()) {
      const original = items[index]
      // Позиция уже совпадает — писать в базу незачем.
      if (original && original.position === item.position) continue
      tx.update(playlistItems).set({ position: item.position }).where(eq(playlistItems.id, item.id)).run()
    }
  })
}

export type PublishResult = { versionId: string; version: number; itemCount: number; cycleDurationMs: number }

/**
 * Фиксация версии.
 *
 * Версия — неизменяемый снимок состава. Это то, на что ссылается публикация,
 * поэтому дальнейшие правки черновика не могут её изменить задним числом.
 */
export function publishPlaylist(params: {
  companyId: string
  playlistId: string
  actorUserId: string
  note?: string | null
}): PublishResult {
  requirePlaylist(params.companyId, params.playlistId)

  const items = loadItems(params.playlistId)
  const unready = items.filter((item) => item.state !== 'ready').map((item) => item.id)

  const problems = validateDraft(items, { unreadyAssetIds: unready })
  if (problems.length > 0) {
    throw HttpError.badRequest(
      problems[0]?.code ?? 'invalid_draft',
      problems.map((problem) => problem.message).join('; '),
      { problems },
    )
  }

  const total = cycleDurationMs(items, serverConfig.media.defaultImageDurationMs)

  return db.transaction((tx) => {
    const lastVersion = tx
      .select({ max: sql<number | null>`max(${playlistVersions.version})` })
      .from(playlistVersions)
      .where(eq(playlistVersions.playlistId, params.playlistId))
      .get()?.max

    const version = (lastVersion ?? 0) + 1
    const versionId = crypto.randomUUID()

    tx.insert(playlistVersions)
      .values({
        id: versionId,
        playlistId: params.playlistId,
        version,
        totalDurationMs: total,
        note: params.note ?? null,
        createdByUserId: params.actorUserId,
      })
      .run()

    for (const item of items) {
      tx.insert(playlistVersionItems)
        .values({
          id: crypto.randomUUID(),
          versionId,
          position: item.position,
          mediaAssetId: mediaAssetIdOf(item.id),
          durationMs: effectiveDurationMs(item, serverConfig.media.defaultImageDurationMs),
          playPolicy: item.playPolicy,
          transition: 'none',
          audio: item.assetKind === 'video' ? 'keep' : 'mute',
        })
        .run()
    }

    tx.update(playlists)
      .set({ state: 'published', currentVersionId: versionId, updatedAt: new Date() })
      .where(eq(playlists.id, params.playlistId))
      .run()

    tx.insert(auditLog)
      .values({
        id: crypto.randomUUID(),
        companyId: params.companyId,
        actorUserId: params.actorUserId,
        action: 'playlist.published',
        targetType: 'playlist',
        targetId: params.playlistId,
        metaJson: JSON.stringify({ version, itemCount: items.length }),
        at: new Date(),
      })
      .run()

    return { versionId, version, itemCount: items.length, cycleDurationMs: total }
  })
}

export function listVersions(companyId: string, playlistId: string) {
  requirePlaylist(companyId, playlistId)

  return db
    .select()
    .from(playlistVersions)
    .where(eq(playlistVersions.playlistId, playlistId))
    .orderBy(sql`${playlistVersions.version} desc`)
    .all()
}

/**
 * Удаление плейлиста.
 *
 * Если версия плейлиста назначена хотя бы одному экрану, удаление запрещено:
 * иначе опубликованная сетка осталась бы ссылаться на исчезнувший контент.
 */
export function deletePlaylist(companyId: string, playlistId: string): void {
  const playlist = requirePlaylist(companyId, playlistId)

  if (isAssigned(playlistId)) {
    throw HttpError.conflict(
      'playlist_assigned',
      'Плейлист назначен экранам. Сначала снимите назначение.',
    )
  }

  db.transaction((tx) => {
    tx.delete(playlistItems).where(eq(playlistItems.playlistId, playlistId)).run()

    const versionIds = tx
      .select({ id: playlistVersions.id })
      .from(playlistVersions)
      .where(eq(playlistVersions.playlistId, playlistId))
      .all()
      .map((row) => row.id)

    if (versionIds.length > 0) {
      tx.delete(playlistVersionItems).where(inArray(playlistVersionItems.versionId, versionIds)).run()
    }

    tx.delete(playlistVersions).where(eq(playlistVersions.playlistId, playlistId)).run()
    tx.delete(playlists).where(eq(playlists.id, playlistId)).run()

    tx.insert(auditLog)
      .values({
        id: crypto.randomUUID(),
        companyId,
        action: 'playlist.deleted',
        targetType: 'playlist',
        targetId: playlist.id,
        metaJson: JSON.stringify({ name: playlist.name }),
        at: new Date(),
      })
      .run()
  })
}
