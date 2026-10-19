/**
 * Движок публикации: назначение контента экранам, сборка манифеста,
 * доставка и учёт подтверждений.
 *
 * Здесь появляются четыре числа, ради которых написан продукт:
 * отправлено, применили, загружают, нет связи. Они не рисуются — они
 * считаются из receipts и времени последнего heartbeat.
 */
import { and, asc, desc, eq, inArray, lt, ne, sql } from 'drizzle-orm'
import { db, withImmediateTransaction } from '@/db/client'
import {
  deliveryReceipts,
  mediaAssets,
  playlistVersionItems,
  playlistVersions,
  releaseAssignments,
  releaseTargets,
  releases,
  screenPublications,
  screens,
} from '@/db/schema'
import { sha256Hex } from '@/lib/crypto'
import { serverConfig } from '@/config/server'
import { buildManifest } from '@/domain/release/manifest'
import { issueMediaTicket } from '@/domain/release/media-ticket'
import { extensionForMime } from '@/server/services/media-service'
import {
  invalidatePlanCache,
  pickAssignment as schedulePickAssignment,
  planForScreen,
  resolveScreens as resolveScopeScreens,
} from '@/server/services/schedule-service'
import type { PlayerManifest } from '@/player/engine'
import { HttpError } from '@/server/http/errors'
import { recordAudit, recordAuditTx } from '@/server/services/audit-service'
import { logger } from '@/lib/logger'

/**
 * Адрес файла, который телевизор запрашивает у сервера.
 *
 * Пропуск выдаётся на момент сборки манифеста и подписывается под конкретный
 * экран и файл. `<img>` и `<video>` не умеют слать заголовок авторизации,
 * поэтому постоянный токен устройства в адрес не попадает никогда —
 * в URL лежит только этот ограниченный пропуск (см. domain/release/media-ticket).
 */
export function playbackUrl(screenId: string, mediaId: string): string {
  return `/api/player/media/${mediaId}?t=${issueMediaTicket(screenId, mediaId)}`
}

/**
 * Раскрытие области назначения в конкретные экраны.
 *
 * Назначение может быть на компанию, филиал, группу или конкретный экран.
 * Экраны ищутся напрямую в базе, а не собираются каскадом: так назначение
 * на всю сеть из 80 экранов остаётся одним запросом с индексом, а не
 * семьюдесятью.
 *
 * Функция живёт в сервисе расписания: ту же область раскрывают и кампании,
 * и держать две копии одного правила означало бы, что однажды они разойдутся.
 */
export function resolveScreens(companyId: string, scopeType: string, scopeId: string): string[] {
  return resolveScopeScreens(companyId, scopeType, scopeId)
}

export type AssignInput = {
  companyId: string
  scopeType: 'screen' | 'group' | 'branch' | 'company'
  scopeId: string
  playlistVersionId: string
  /** Запасной плейлист, когда основной недоступен. */
  fallbackPlaylistVersionId?: string | null
  priority?: number
  /** Кто менял назначение: без этого в журнале не было бы исполнителя. */
  actorUserId?: string
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

  recordAudit({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'assignment.changed',
    targetType: input.scopeType,
    targetId: input.scopeId,
    meta: {
      playlistVersionId: input.playlistVersionId,
      fallbackPlaylistVersionId: input.fallbackPlaylistVersionId ?? null,
      screens: targetScreens.length,
    },
  })

  // План показа кэшируется на полминуты. После правки назначения кэш надо
  // сбросить сразу: иначе оператор увидит «показывается старый плейлист»
  // ещё полминуты после того, как назначил новый.
  invalidatePlanCache(input.companyId)

  return { screens: targetScreens.length }
}

/**
 * Снятие назначения.
 *
 * Нужно, чтобы можно было честно вернуть экран в состояние «ничего не
 * назначено»: без этого единственным способом «убрать» программу было
 * назначить другую, что для оператора не то же самое.
 *
 * Публикация при этом не выпускается: экран продолжит показывать последнюю
 * выложенную программу, пока не выйдет следующая публикация.
 */
export function removeAssignment(params: {
  companyId: string
  actorUserId?: string
  scopeType?: 'screen' | 'group' | 'branch' | 'company'
  scopeId?: string
  screenIds?: string[]
}): { removed: number } {
  const conditions = [eq(releaseAssignments.companyId, params.companyId)]

  if (params.screenIds && params.screenIds.length > 0) {
    conditions.push(
      and(eq(releaseAssignments.scopeType, 'screen'), inArray(releaseAssignments.scopeId, [...params.screenIds]))!,
    )
  } else if (params.scopeType && params.scopeId) {
    conditions.push(eq(releaseAssignments.scopeType, params.scopeType))
    conditions.push(eq(releaseAssignments.scopeId, params.scopeId))
  } else {
    throw HttpError.badRequest('invalid_input', 'Укажите экраны или область назначения')
  }

  const existing = db
    .select({ id: releaseAssignments.id })
    .from(releaseAssignments)
    .where(and(...conditions))
    .all()

  if (existing.length === 0) return { removed: 0 }

  db.delete(releaseAssignments)
    .where(and(...conditions))
    .run()

  invalidatePlanCache(params.companyId)

  recordAudit({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    action: 'assignment.removed',
    targetType: params.screenIds ? 'screen' : (params.scopeType ?? 'screen'),
    targetId: params.screenIds ? params.screenIds.join(',') : (params.scopeId ?? null),
    meta: { removed: existing.length },
  })

  return { removed: existing.length }
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
 * Живёт в сервисе расписания вместе с кампаниями: и то, и другое отвечает на
 * вопрос «что показывать на этом экране», и разбирать их в разных местах
 * значило бы однажды получить два разных ответа на один и тот же вопрос.
 */
export const pickAssignment = schedulePickAssignment

/**
 * Сборка манифеста экрана.
 *
 * Содержимое выбирает решатель расписания: активная кампания имеет приоритет
 * над постоянным назначением, а если ни одна кампания сейчас не идёт — берётся
 * назначение филиала, группы или компании.
 *
 * `nextChangeAt` кладётся в манифест, чтобы телевизор заранее знал момент
 * следующей смены программы и подготовил её, вместо того чтобы узнать о ней
 * в момент переключения.
 */
export function buildScreenManifest(
  companyId: string,
  screenId: string,
  version: number,
  at: Date = new Date(),
): PlayerManifest | null {
  const plan = planForScreen(companyId, screenId, at)

  if (!plan.playlistVersionId) return null

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
      mime: mediaAssets.mime,
    })
    .from(playlistVersionItems)
    .innerJoin(mediaAssets, eq(mediaAssets.id, playlistVersionItems.mediaAssetId))
    .where(eq(playlistVersionItems.versionId, plan.playlistVersionId))
    .orderBy(asc(playlistVersionItems.position))
    .all()

  // Неготовый файл исключаем, а не показываем: экран обязан показывать
  // что-то рабочее, а оператор увидит пропуск в отчёте.
  const playable = rows.filter((row) => row.state === 'ready' && row.assetKind !== 'template')

  if (playable.length === 0) return null

  return buildManifest(
    {
      version,
      screenId,
      companyId,
      nextChangeAt: plan.nextChangeAt,
      items: playable.map((row) => ({
        id: row.itemId,
        kind: row.assetKind === 'video' ? ('video' as const) : ('image' as const),
        assetDurationMs: row.assetDurationMs,
        durationMs: row.durationMs,
        playPolicy: row.playPolicy,
        url: playbackUrl(screenId, row.assetId),
        mime: row.mime,
        transition: row.transition,
        audio: row.audio,
      })),
    },
    at,
  )
}

/** Версия плейлиста, которую решатель назначил экрану прямо сейчас. */
export function playlistVersionForScreen(companyId: string, screenId: string, at: Date = new Date()): string | null {
  return planForScreen(companyId, screenId, at).playlistVersionId
}

export type PublishResult = {
  releaseId: string
  version: number
  screens: number
}

/**
 * Публикация на указанные экраны.
 *
 * Номер версии растёт на компанию, а не на экран: экран получает ту же
 * версию, что и соседние, и публикация «на всю сеть» остаётся одной
 * операцией с одним набором receipts.
 *
 * Содержимое берётся из решателя расписания, поэтому один и тот же вызов
 * обслуживает и ручную публикацию оператора, и смену программы по расписанию.
 * Разница только в том, кто инициировал вызов.
 *
 * Экраны без пригодного содержимого получают и манифест, и запись о
 * желаемой версии: экран с пустой программой обязан честно показать
 * «нет назначенного контента», а не молча остаться на старой публикации.
 */
export function publishScreens(params: {
  companyId: string
  screenIds: string[]
  actorUserId?: string
  reason?: string
  campaignId?: string | null
  at?: Date
  /** Писать ли в журнал действий. Фоновая публикация расписания — не действие человека. */
  audit?: boolean
}): PublishResult {
  const { companyId, screenIds } = params
  const now = params.at ?? new Date()

  const uniqueScreens = [...new Set(screenIds)].sort()

  if (uniqueScreens.length === 0) {
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
        campaignId: params.campaignId ?? null,
        manifestVersion: version,
        manifestJson: '{}',
        manifestHash: '',
        itemCount: 0,
        reason: params.reason ?? null,
        createdByUserId: params.actorUserId ?? null,
      })
      .run()

    let itemCount = 0

    for (const screenId of uniqueScreens) {
      const manifest = buildScreenManifest(companyId, screenId, version, now)
      const plan = planForScreen(companyId, screenId, now)

      tx.insert(releaseTargets)
        .values({
          id: crypto.randomUUID(),
          releaseId,
          screenId,
          // Кампания пишется по факту разрешения, а не по поводу публикации:
          // один выпуск может нести разные программы разным экранам, и отчёт
          // по кампании обязан считать именно то, что реально легло на экран.
          campaignId: plan.resolution.campaignId,
        })
        .run()

      const set = {
        desiredReleaseId: releaseId,
        desiredVersion: version,
        playlistVersionId: plan.playlistVersionId,
        nextChangeAt: plan.nextChangeAt,
        updatedAt: now,
      }

      tx.insert(screenPublications)
        .values({ screenId, companyId, ...set })
        .onConflictDoUpdate({ target: screenPublications.screenId, set })
        .run()

      tx.insert(deliveryReceipts)
        .values({ id: crypto.randomUUID(), releaseId, screenId, state: 'queued', updatedAt: now })
        .onConflictDoNothing()
        .run()

      if (manifest) {
        itemCount = Math.max(itemCount, manifest.items.length)
      }
    }

    tx.update(releases)
      .set({ itemCount, manifestHash: hashAll(uniqueScreens, version) })
      .where(eq(releases.id, releaseId))
      .run()

    if (params.audit !== false && params.actorUserId) {
      recordAuditTx(tx, {
        companyId,
        actorUserId: params.actorUserId,
        action: params.campaignId ? 'campaign.published' : 'release.published',
        targetType: params.campaignId ? 'campaign' : 'release',
        targetId: params.campaignId ?? releaseId,
        meta: {
          version,
          screens: uniqueScreens.length,
          reason: params.reason ?? null,
          // Источник инициативы: человек нажал кнопку или сработало расписание.
          trigger: params.campaignId ? 'campaign_manual' : 'manual',
        },
      })
    }

    return { releaseId, version, screens: uniqueScreens.length }
  })
}

/**
 * Ручная публикация на всю сеть компании.
 *
 * Отличается от `publishScreens` только отбором экранов: публикуем всё, что
 * не отозвано, а решатель сам решит, есть ли для экрана что показывать.
 */
export function publishCompany(companyId: string, actorUserId: string, reason?: string): PublishResult {
  const companyScreens = db
    .select({ id: screens.id })
    .from(screens)
    .where(and(eq(screens.companyId, companyId), ne(screens.status, 'revoked')))
    .orderBy(asc(screens.id))
    .all()

  return publishScreens({
    companyId,
    screenIds: companyScreens.map((screen) => screen.id),
    actorUserId,
    reason,
    audit: true,
  })
}

/** Общий хеш публикации: даёт детерминированный идентификатор набора экранов. */
function hashAll(screenIds: string[], version: number): string {
  return sha256Hex(JSON.stringify({ version, screens: [...screenIds].sort() }))
}

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
  /**
   * Чеки, где экран сообщил об отказе или молчал после нескольких попыток.
   *
   * Держится отдельно от четырёх чисел намеренно: «Отправлено» по плану
   * считает только состояния `sent`/`downloading`/`applied`, а отказ не
   * значит ни «доставлено», ни «загружает». Скрывать его было бы враньём,
   * поэтому панель показывает его явно.
   */
  failed: number
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
    .where(releaseId ? eq(deliveryReceipts.releaseId, releaseId) : eq(screens.companyId, companyId))
    .all()

  const summary: DeliverySummary = {
    sent: 0,
    applied: 0,
    downloading: 0,
    noContact: 0,
    total: rows.length,
    failed: 0,
  }

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

    if (row.state === 'failed' || row.state === 'stale') {
      summary.failed += 1
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


