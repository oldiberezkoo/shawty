import { z } from 'zod'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db, withImmediateTransaction } from '@/db/client'
import { deliveryReceipts, releases, screenPublications } from '@/db/schema'
import { deviceHub } from '@/server/ws/hub'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { route, jsonResponse, readJsonBody } from '@/server/http/request'
import {
  requireDashboardMutation,
  requireDashboardRequest,
  requirePermission,
} from '@/server/http/dashboard-request'
import {
  assignPlaylist,
  buildScreenManifest,
  deliverySummary,
  listAssignments,
  listRecentReleases,
  publishCompany,
  receiptsForRelease,
} from '@/server/services/release-service'
import { HttpError } from '@/server/http/errors'
import { logger } from '@/lib/logger'

const assignSchema = z.object({
  scopeType: z.enum(['screen', 'group', 'branch', 'company']),
  scopeId: z.string().min(1).max(64),
  playlistVersionId: z.string().min(1).max(64),
  fallbackPlaylistVersionId: z.string().min(1).max(64).nullable().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
})

const publishSchema = z.object({
  reason: z.string().max(200).nullable().optional(),
})

/**
 * Назначения и последние публикации.
 *
 * Сводка доставки отдаётся здесь же: оператор после публикации сразу видит
 * четыре числа, не переходя на отдельный экран.
 */
export const GET = route(async (request: Request) => {
  const { companyId, access } = await requireDashboardRequest(request)
  requirePermission(access, PERMISSIONS.releasesPublish, 'Нет доступа к публикациям')

  const url = new URL(request.url)
  const releaseId = url.searchParams.get('releaseId')

  if (releaseId) {
    const release = db
      .select()
      .from(releases)
      .where(and(eq(releases.id, releaseId), eq(releases.companyId, companyId)))
      .get()

    if (!release) throw HttpError.notFound('Публикация не найдена')

    return jsonResponse({
      release,
      summary: deliverySummary(companyId, releaseId),
      receipts: receiptsForRelease(releaseId),
    })
  }

  return jsonResponse({
    assignments: listAssignments(companyId),
    releases: listRecentReleases(companyId),
    summary: deliverySummary(companyId),
  })
})

/** Назначение плейлиста на область экранов. */
export const PUT = route(async (request: Request) => {
  const { companyId, access } = await requireDashboardMutation(request)
  requirePermission(access, PERMISSIONS.releasesPublish, 'Нет прав на назначение контента')

  const body = assignSchema.safeParse(await readJsonBody(request))
  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Проверьте область назначения и плейлист')
  }

  const result = assignPlaylist({ companyId, ...body.data })

  return jsonResponse({ ok: true, ...result, assignments: listAssignments(companyId) })
})

/**
 * Публикация на сеть.
 *
 * Создаёт версию, раскладывает манифесты по экранам, ставит receipts в
 * `queued` и отправляет манифесты тем экранам, что сейчас на связи.
 *
 * Ограничение изоляции: обработчики маршрутов и канал устройств работают
 * в разных изоляциях процесса и не разделяют память. Поэтому `deviceHub`
 * в этом маршруте — всегда пустой: вызов вернёт 0, и состояние receipts
 * останется `queued` даже при живых экранах. Доставка по каналу будет
 * работать, когда реестр сокетов станет доступен обоим слоям — это
 * отдельная задача P4, зафиксированная в плане (см. §3.2).
 */
export const POST = route(async (request: Request) => {
  const { companyId, access, session } = await requireDashboardMutation(request)
  requirePermission(access, PERMISSIONS.releasesPublish, 'Нет прав на публикацию')

  const body = publishSchema.safeParse(await readJsonBody(request).catch(() => null))
  const reason = body.success ? (body.data.reason ?? null) : null

  const result = publishCompany(companyId, session.userId, reason ?? undefined)

  const delivered = deliverManifests(companyId, result.version, result.releaseId)

  logger.info({ ...result, delivered }, 'публикация выполнена')

  return jsonResponse({
    ...result,
    delivered,
    summary: deliverySummary(companyId, result.releaseId),
    notice:
      delivered === 0
        ? 'Манифест сохранён. Экраны заберут его при следующем обращении к серверу.'
        : null,
  })
})

/**
 * Доставка манифестов подключённым экранам.
 *
 * Состояние receipts обновляется здесь, а не в обработчике канала: обработчик
 * и маршрут живут в разных изоляциях процесса и не разделяют память, поэтому
 * общий источник истины — база.
 */
function deliverManifests(companyId: string, version: number, releaseId: string): number {
  const targets = db
    .select({ screenId: screenPublications.screenId })
    .from(screenPublications)
    .where(eq(screenPublications.desiredReleaseId, releaseId))
    .all()

  const now = new Date()
  let delivered = 0

  for (const target of targets) {
    const manifest = buildScreenManifest(companyId, target.screenId, version)
    if (!manifest) continue

    const sent = deviceHub.sendToScreens([target.screenId], {
      type: 'assignment',
      releaseVersion: version,
      manifest,
    })

    delivered += sent

    // Отмечаем состояние по факту: экран без связи останется в `queued`
    // и попадёт в число «нет связи», а не в «отправлено».
    db.transaction((tx) => {
      tx.update(deliveryReceipts)
        .set({
          state: sent > 0 ? 'sent' : 'queued',
          sentAt: sent > 0 ? now : null,
          updatedAt: now,
        })
        .where(and(eq(deliveryReceipts.releaseId, releaseId), eq(deliveryReceipts.screenId, target.screenId)))
        .run()
    })
  }

  return delivered
}
