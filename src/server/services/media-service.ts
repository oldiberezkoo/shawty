import { unlink } from 'node:fs/promises'
import { and, desc, eq, inArray, like, ne, or, sql } from 'drizzle-orm'
import { join } from 'node:path'
import { db } from '@/db/client'
import {
  mediaAssets,
  mediaFolders,
  mediaTagLinks,
  playlists,
  playlistItems,
  playlistVersions,
  plans,
  releaseAssignments,
  subscriptions,
} from '@/db/schema'
import { serverConfig } from '@/config/server'
import {
  detectFormat,
  needsTranscode,
  validateDimensions,
  validateDuration,
  validateSize,
  type MediaLimits,
} from '@/domain/media/policy'
import type { MediaProbe } from '@/media/probe'
import { probeMedia } from '@/media/probe'
import {
  blobExists,
  blobPath,
  commitBlob,
  fileSize,
  hashAndSize,
  readHead,
  removeBlobAndReport,
} from '@/media/store'
import { extractImagePoster, extractPoster, transcodeToMp4 } from '@/media/transcode'
import { getMediaQueue } from '@/media/queue'
import { HttpError } from '@/server/http/errors'
import { logger } from '@/lib/logger'

export const TMP_ROOT = join(process.cwd(), 'data', 'tmp')

export function mediaLimits(): MediaLimits {
  return {
    maxBytes: serverConfig.media.maxBytes,
    maxWidth: serverConfig.media.maxWidth,
    maxHeight: serverConfig.media.maxHeight,
    maxDurationMs: serverConfig.media.maxDurationMs,
    minDurationMs: serverConfig.media.minDurationMs,
    defaultImageDurationMs: serverConfig.media.defaultImageDurationMs,
  }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} ГБ`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} МБ`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${bytes} Б`
}

export function extensionForMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    case 'image/bmp':
      return 'bmp'
    case 'image/avif':
      return 'avif'
    case 'image/heic':
      return 'heic'
    case 'video/mp4':
      return 'mp4'
    case 'video/webm':
      return 'webm'
    case 'video/x-msvideo':
      return 'avi'
    case 'video/mpeg':
      return 'mpg'
    default:
      return 'bin'
  }
}

// ─── Квота хранилища ─────────────────────────────────────────────────────────

export type StorageUsage = { usedBytes: number; limitBytes: number; files: number }

export function storageUsage(companyId: string): StorageUsage {
  const subscription = db
    .select({ limitBytes: plans.storageBytesLimit })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.companyId, companyId))
    .get()

  const row = db
    .select({
      used: sql<number>`coalesce(sum(${mediaAssets.bytes}), 0)`,
      files: sql<number>`count(*)`,
    })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.companyId, companyId), ne(mediaAssets.state, 'archived')))
    .get()

  return {
    usedBytes: Number(row?.used ?? 0),
    limitBytes: subscription?.limitBytes ?? 0,
    files: Number(row?.files ?? 0),
  }
}

function assertStorageQuota(companyId: string, additionalBytes: number): void {
  const usage = storageUsage(companyId)

  if (usage.limitBytes === 0) {
    throw HttpError.conflict('no_subscription', 'У компании нет активной подписки')
  }

  if (usage.usedBytes + additionalBytes > usage.limitBytes) {
    const free = Math.max(0, usage.limitBytes - usage.usedBytes)
    throw HttpError.conflict(
      'storage_limit',
      `Хранилище переполнено: свободно ${formatBytes(free)} из ${formatBytes(usage.limitBytes)}`,
    )
  }
}

// ─── Пути файлов ─────────────────────────────────────────────────────────────

export type AssetPaths = {
  /** Оригинал: сохраняется всегда, нужен для повторной обработки. */
  original: string
  /** То, что отдаётся телевизорам. */
  playback: string
  poster: string | null
}

export function assetPaths(asset: typeof mediaAssets.$inferSelect): AssetPaths {
  const playbackSha = asset.playbackSha256 ?? asset.sha256

  return {
    original: blobPath(asset.sha256, extensionForMime(asset.mime)),
    playback: blobPath(playbackSha, asset.transcoded ? 'mp4' : extensionForMime(asset.mime)),
    poster: asset.posterSha256 ? blobPath(asset.posterSha256, 'jpg') : null,
  }
}

export function posterFilePath(sha256: string): string {
  return blobPath(sha256, 'jpg')
}

// ─── Приём файла ─────────────────────────────────────────────────────────────

export type IngestResult = {
  assetId: string
  /** true — содержимое уже было в библиотеке, новый ассет не создавался. */
  deduplicated: boolean
  state: 'ready' | 'processing'
}

/**
 * Приём файла.
 *
 * Порядок проверок выбран так, чтобы лишняя работа не делалась никогда:
 * сигнатура → размер → хеш → дубликат → квота → ffprobe → лимиты → очередь.
 *
 * Временный файл удаляется в `finally` при любом исходе: иначе неудачная
 * загрузка оставляет мусор, который никто не посчитает и не уберёт.
 */
export async function ingestUpload(params: {
  companyId: string
  actorUserId: string
  temporaryPath: string
  folderId?: string | null
  /** Имя файла от оператора: без него карточки в медиатеке неразличимы. */
  fileName?: string | null
}): Promise<IngestResult> {
  // Владение временным файлом передаётся задаче обработки: она переносит его
  // в хранилище. Поэтому удаляем файл только если до постановки в очередь
  // не дошли — иначе задача получит уже удалённый файл.
  let handedOver = false

  try {
    const detected = detectFormat(await readHead(params.temporaryPath))

    if (!detected.ok) {
      throw HttpError.badRequest(
        'unsupported_format',
        detected.reason === 'empty'
          ? 'Файл пустой'
          : 'Формат не распознан по содержимому. Поддерживаются JPEG, PNG, GIF, WebP, MP4, WebM, MOV.',
      )
    }

    const { sha256, bytes } = await hashAndSize(params.temporaryPath)

    const sizeVerdict = validateSize(bytes, mediaLimits())
    if (!sizeVerdict.ok) {
      throw HttpError.badRequest(sizeVerdict.reason, sizeVerdict.message)
    }

    const existing = db
      .select({ id: mediaAssets.id, state: mediaAssets.state })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.companyId, params.companyId), eq(mediaAssets.sha256, sha256)))
      .get()

    if (existing) {
      // Duplicate is determined by content, not by readiness: the same file
      // that is still being processed is the same file. Checking only `ready`
      // fell through to the insert, which then hit the unique index and
      // returned 500 - so dragging five files of which two matched reported
      // a server error instead of quietly ignoring the second one.
      if (existing.state === 'ready') {
        return { assetId: existing.id, deduplicated: true, state: 'ready' }
      }

      // A failed asset occupies the same hash. Re-uploading the same file after
      // a failure must work, so the previous one is removed: it is useless to
      // anyone, since processing never finished and it could not have been used.
      if (existing.state === 'failed' || existing.state === 'archived') {
        db.delete(mediaAssets).where(eq(mediaAssets.id, existing.id)).run()
      } else {
        return { assetId: existing.id, deduplicated: true, state: existing.state }
      }
    }

    assertStorageQuota(params.companyId, bytes)

    // Опрашиваем и изображения тоже: без этого размер остался бы неизвестным,
    // лимит разрешения не проверялся бы, а в сетке медиатеки показывалось «—».
    const probe = await probeMedia(params.temporaryPath)

    if (probe) {
      const durationVerdict = validateDuration(
        detected.kind === 'video' ? probe.durationMs : null,
        mediaLimits(),
      )
      if (!durationVerdict.ok) {
        throw HttpError.badRequest(durationVerdict.reason, durationVerdict.message)
      }

      const dimensionVerdict = validateDimensions(probe.width, probe.height, mediaLimits())
      if (!dimensionVerdict.ok) {
        throw HttpError.badRequest(dimensionVerdict.reason, dimensionVerdict.message)
      }
    }

    const assetId = crypto.randomUUID()

    db.insert(mediaAssets)
      .values({
        id: assetId,
        companyId: params.companyId,
        sha256,
        // До обработки проигрываемый файл ещё не существует.
        playbackSha256: sha256,
        kind: detected.kind,
        state: 'processing',
        mime: detected.mime,
        bytes,
        width: probe?.width ?? null,
        height: probe?.height ?? null,
        durationMs:
          probe?.durationMs ?? (detected.kind === 'image' ? serverConfig.media.defaultImageDurationMs : null),
        probeJson: probe ? JSON.stringify(probe) : null,
        transcoded: false,
        // Имя обрезается по длине колонки: путь оператора может быть длиннее,
        // и обрезка на уровне вставки предсказуемее, чем усечение интерфейса.
        fileName: params.fileName ? params.fileName.slice(0, 255) : null,
        folderId: params.folderId ?? null,
        createdByUserId: params.actorUserId,
      })
      .run()

    // Ошибка обработки не должна валить загрузку: пользователь увидит ассет
    // с причиной и сможет его удалить.
    void getMediaQueue()
      .submit(assetId, () => processAsset({ assetId, temporaryPath: params.temporaryPath, detected, probe }))
      .catch((error: unknown) => {
        logger.error({ err: error, assetId }, 'обработка ассета не удалась')
        // Задача не справилась: временный файл остался в data/tmp.
        void unlink(params.temporaryPath).catch(() => {})
      })

    handedOver = true

    return { assetId, deduplicated: false, state: 'processing' }
  } finally {
    if (!handedOver) {
      await unlink(params.temporaryPath).catch(() => {})
    }
  }
}

/**
 * Обработка ассета: сохранение оригинала, при необходимости транскод,
 * превью, финализация.
 *
 * Оригинал сохраняется всегда: он нужен для повторной обработки с другими
 * настройками и для скачивания. Телевизорам отдаётся производный MP4, если
 * исходник не соответствует профилю сети.
 */
async function processAsset(params: {
  assetId: string
  temporaryPath: string
  detected: { kind: 'image' | 'video'; mime: string; extension: string }
  probe: MediaProbe | null
}): Promise<void> {
  const { assetId, temporaryPath, detected, probe } = params

  const mustTranscode = detected.kind === 'video' && probe ? needsTranscode(probe, detected.mime) : false
  const sourceHash = await hashAndSize(temporaryPath)
  const originalPath = await commitBlob(temporaryPath, sourceHash.sha256, detected.extension)

  let playbackSha = sourceHash.sha256
  let playbackPath = originalPath
  let playbackBytes = sourceHash.bytes
  let transcoded = false
  let finalProbe = probe

  if (mustTranscode) {
    // Кодируем рядом с оригиналом, хешируем результат и кладём в хранилище
    // уже под собственным содержимым.
    const working = `${originalPath}.working.mp4`

    await transcodeToMp4({
      input: originalPath,
      output: working,
      hasAudio: probe?.hasAudio ?? false,
    })

    const hashed = await hashAndSize(working)
    playbackSha = hashed.sha256
    playbackBytes = hashed.bytes
    transcoded = true

    playbackPath = await commitBlob(working, playbackSha, 'mp4')
    await unlink(working).catch(() => {})

    // После кодирования метаданные меняются, поэтому перечитываем их:
    // длительность и размер кадра в отчёте должны описывать то, что играет.
    finalProbe = await probeMedia(playbackPath)
  }

  const poster = await createPoster({
    playbackPath,
    kind: detected.kind,
    durationMs: finalProbe?.durationMs ?? null,
  })

  db.update(mediaAssets)
    .set({
      state: 'ready',
      // sha256 остаётся хешем ОРИГИНАЛА: по нему работает дедупликация
      // при повторной загрузке того же файла.
      playbackSha256: playbackSha,
      mime: transcoded ? 'video/mp4' : detected.mime,
      bytes: playbackBytes,
      transcoded,
      width: finalProbe?.width ?? null,
      height: finalProbe?.height ?? null,
      durationMs:
        finalProbe?.durationMs ??
        (detected.kind === 'image' ? serverConfig.media.defaultImageDurationMs : null),
      probeJson: finalProbe ? JSON.stringify(finalProbe) : null,
      posterSha256: poster.sha256,
      posterBytes: poster.bytes,
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(mediaAssets.id, assetId))
    .run()

  logger.info(
    { assetId, transcoded, playbackSha, bytes: playbackBytes, poster: Boolean(poster.sha256) },
    'ассет обработан',
  )
}

async function createPoster(params: {
  playbackPath: string
  kind: 'image' | 'video'
  durationMs: number | null
}): Promise<{ sha256: string | null; bytes: number | null }> {
  const working = `${params.playbackPath}.poster.jpg`

  try {
    if (params.kind === 'video') {
      await extractPoster({
        input: params.playbackPath,
        output: working,
        durationMs: params.durationMs,
        width: 640,
      })
    } else {
      await extractImagePoster({ input: params.playbackPath, output: working, width: 640 })
    }

    const hashed = await hashAndSize(working)
    await commitBlob(working, hashed.sha256, 'jpg')
    await unlink(working).catch(() => {})

    return { sha256: hashed.sha256, bytes: hashed.bytes }
  } catch (error) {
    // Превью — вспомогательное: его отсутствие не должно ломать загрузку.
    logger.warn({ err: error }, 'превью не создано')
    await unlink(working).catch(() => {})
    return { sha256: null, bytes: null }
  }
}

/**
 * Освобождение зависших ассетов после перезапуска.
 *
 * Если процесс упал во время обработки, ассет навсегда остался бы
 * в состоянии `processing`: интерфейс показывал бы вечную «обработку»,
 * а добавить его в плейлист было бы нельзя.
 */
export function reapStaleAssets(olderThanMs = 30 * 60_000): number {
  const threshold = Date.now() - olderThanMs

  return db
    .update(mediaAssets)
    .set({
      state: 'failed',
      error: 'Обработка прервана. Загрузите файл заново.',
      updatedAt: new Date(),
    })
    .where(and(eq(mediaAssets.state, 'processing'), sql`${mediaAssets.createdAt} < ${threshold}`))
    .run().changes
}

// ─── Выборка ─────────────────────────────────────────────────────────────────

export type MediaListFilter = {
  kind?: 'image' | 'video'
  folderId?: string
  state?: 'processing' | 'ready' | 'failed'
  search?: string
  limit?: number
}

export function listMedia(companyId: string, filter: MediaListFilter = {}) {
  const conditions = [eq(mediaAssets.companyId, companyId)]

  if (filter.kind) conditions.push(eq(mediaAssets.kind, filter.kind))
  if (filter.folderId) conditions.push(eq(mediaAssets.folderId, filter.folderId))

  if (filter.state) {
    conditions.push(eq(mediaAssets.state, filter.state))
  } else {
    const visible = [eq(mediaAssets.state, 'ready'), eq(mediaAssets.state, 'processing'), eq(mediaAssets.state, 'failed')]
    conditions.push(or(...visible) as never)
  }

  if (filter.search) {
    // Поиск идёт по имени файла прежде всего: это то, что человек помнит.
    // Тип и разрешение оставлены как запасной вариант — ими пользуются,
    // когда имя потерялось, а «найти все 1920×1080» действительно нужно.
    const pattern = `%${filter.search.trim().toLowerCase()}%`
    conditions.push(
      or(
        like(sql`lower(${mediaAssets.fileName})`, pattern),
        like(sql`lower(${mediaAssets.mime})`, pattern),
        like(sql`cast(${mediaAssets.width} as text)`, pattern),
      ) as never,
    )
  }

  return db
    .select()
    .from(mediaAssets)
    .where(and(...conditions))
    .orderBy(desc(mediaAssets.createdAt))
    .limit(filter.limit ?? 300)
    .all()
}

export function listFolders(companyId: string) {
  return db
    .select()
    .from(mediaFolders)
    .where(eq(mediaFolders.companyId, companyId))
    .orderBy(mediaFolders.name)
    .all()
}

// ─── Использование и удаление ────────────────────────────────────────────────

/**
 * Где используется файл.
 *
 * Требование ТЗ: файл, участвующий в активной публикации, удалять нельзя.
 * Считаем по всей цепочке: ассет → плейлисты → версии плейлистов →
 * назначения версий на экраны. Только этот путь даёт честный ответ, потому
 * что публикация ссылается на неизменяемую версию, а не на сам плейлист.
 */
export type MediaUsage = {
  playlists: { id: string; name: string }[]
  items: number
  published: boolean
}

export function findUsage(companyId: string, assetId: string): MediaUsage {
  const rows = db
    .select({ playlistId: playlists.id, playlistName: playlists.name })
    .from(playlistItems)
    .innerJoin(playlists, eq(playlists.id, playlistItems.playlistId))
    .where(eq(playlistItems.mediaAssetId, assetId))
    .all()

  const playlistIds = [...new Set(rows.map((row) => row.playlistId))]

  if (playlistIds.length === 0) {
    return { playlists: [], items: 0, published: false }
  }

  const versions = db
    .select({ id: playlistVersions.id })
    .from(playlistVersions)
    .where(inArray(playlistVersions.playlistId, playlistIds))
    .all()

  let published = false
  if (versions.length > 0) {
    const assigned = db
      .select({ n: sql<number>`count(*)` })
      .from(releaseAssignments)
      .where(
        and(
          eq(releaseAssignments.companyId, companyId),
          inArray(
            releaseAssignments.playlistVersionId,
            versions.map((version) => version.id),
          ),
        ),
      )
      .get()
    published = Number(assigned?.n ?? 0) > 0
  }

  return {
    playlists: playlistIds.map((id) => ({
      id,
      name: rows.find((row) => row.playlistId === id)?.playlistName ?? '—',
    })),
    items: rows.length,
    published,
  }
}

export type DeleteOutcome = { ok: true; asset: typeof mediaAssets.$inferSelect } | { ok: false; usage: MediaUsage }

/**
 * Удаление файла.
 *
 * Сначала архивируем запись, потом стираем файлы: порядок обратный был бы
 * опасен — при сбое между шагами осталась бы живая ссылка на несуществующий
 * файл, и плейлист сломался бы на следующей публикации.
 */
export async function deleteMedia(
  companyId: string,
  assetId: string,
  force = false,
): Promise<DeleteOutcome> {
  const asset = db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId)).get()
  if (!asset || asset.companyId !== companyId) {
    throw HttpError.notFound('Файл не найден')
  }

  const usage = findUsage(companyId, assetId)

  if (usage.items > 0 && !force) {
    return { ok: false, usage }
  }

  db.transaction((tx) => {
    tx.delete(mediaTagLinks).where(eq(mediaTagLinks.assetId, assetId)).run()
    tx.update(mediaAssets)
      .set({ state: 'archived', archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(mediaAssets.id, assetId))
      .run()
  })

  await purgeAssetFiles(asset)

  return { ok: true, asset }
}

/** Стирает файлы ассета с диска и возвращает освобождённый объём. */
export async function purgeAssetFiles(asset: typeof mediaAssets.$inferSelect): Promise<number> {
  const { original, playback, poster } = assetPaths(asset)
  // Оригинал и проигрываемый файл совпадают, если транскодирования не было.
  const targets = [...new Set([original, playback, poster].filter((path): path is string => Boolean(path)))]

  let freed = 0
  for (const path of targets) {
    if (!(await blobExists(path))) continue
    freed += await removeBlobAndReport(path)
  }

  return freed
}

export function getAsset(companyId: string, assetId: string) {
  return db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.companyId, companyId)))
    .get()
}

export function queueStats() {
  return getMediaQueue().stats()
}
