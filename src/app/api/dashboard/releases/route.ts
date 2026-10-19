import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { releases } from '@/db/schema'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { route, jsonResponse, readJsonBody } from '@/server/http/request'
import {
  requireDashboardMutation,
  requireDashboardRequest,
  requirePermission,
} from '@/server/http/dashboard-request'
import {
  assignPlaylist,
  deliverySummary,
  listAssignments,
  listRecentReleases,
  publishCompany,
  publishScreens,
  receiptsForRelease,
  removeAssignment,
} from '@/server/services/release-service'
import { listScreenIds } from '@/server/services/screen-service'
import { HttpError } from '@/server/http/errors'
import { logger } from '@/lib/logger'

const assignSchema = z.object({
  scopeType: z.enum(['screen', 'group', 'branch', 'company']).optional(),
  scopeId: z.string().min(1).max(64).optional(),
  /** Назначение сразу списку экранов: так работает массовый выбор в панели. */
  screenIds: z.array(z.string().min(1).max(64)).min(1).max(500).optional(),
  playlistVersionId: z.string().min(1).max(64),
  fallbackPlaylistVersionId: z.string().min(1).max(64).nullable().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
})

const publishSchema = z.object({
  reason: z.string().max(200).nullable().optional(),
  /** Публикация только выбранным экранам; пусто — вся сеть. */
  screenIds: z.array(z.string().min(1).max(64)).min(1).max(500).optional(),
})

const unassignSchema = z.object({
  scopeType: z.enum(['screen', 'group', 'branch', 'company']).optional(),
  scopeId: z.string().min(1).max(64).optional(),
  screenIds: z.array(z.string().min(1).max(64)).min(1).max(500).optional(),
})

/**
 * Назначения и последние публикации.
 *
 * Сводка доставки отдаётся здесь же: оператор после публикации сразу видит
 * четыре числа, не переходя на отдельный экран. Этот же ответ — источник
 * живой доски доставки, поэтому он обязан отдавать чеки последней публикации:
 * без них экран «что произошло на экранах» старел бы до перезагрузки.
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

  // Имя не `releases`: в этом файле уже импортирована таблица releases,
  // и локальная переменная перекрыла бы её — запросы искались бы в массиве.
  const recent = listRecentReleases(companyId)
  const latest = recent[0]

  return jsonResponse({
    assignments: listAssignments(companyId),
    releases: recent,
    summary: deliverySummary(companyId),
    receipts: latest ? receiptsForRelease(latest.id) : [],
  })
})

/** Назначение плейлиста на область экранов или на список экранов. */
export const PUT = route(async (request: Request) => {
  const { companyId, access, session } = await requireDashboardMutation(request)
  requirePermission(access, PERMISSIONS.releasesPublish, 'Нет прав на назначение контента')

  const body = assignSchema.safeParse(await readJsonBody(request))
  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Проверьте область назначения и плейлист')
  }

  // Массовый выбор экранов: каждому экрану достаётся своё назначение на
  // область «экран». Так правило совпадает с одиночным назначением, и
  // раскрытие области остаётся одним и тем же кодом.
  if (body.data.screenIds) {
    const known = listScreenIds(companyId, body.data.screenIds)
    if (known.length !== body.data.screenIds.length) {
      throw HttpError.notFound('Один из выбранных экранов не найден')
    }

    for (const screenId of known) {
      assignPlaylist({
        companyId,
        actorUserId: session.userId,
        scopeType: 'screen',
        scopeId: screenId,
        playlistVersionId: body.data.playlistVersionId,
        fallbackPlaylistVersionId: body.data.fallbackPlaylistVersionId ?? null,
        priority: body.data.priority,
      })
    }

    return jsonResponse({
      ok: true,
      screens: known.length,
      assignments: listAssignments(companyId),
    })
  }

  if (!body.data.scopeType || !body.data.scopeId) {
    throw HttpError.badRequest('invalid_input', 'Укажите область назначения или экраны')
  }

  const result = assignPlaylist({
    companyId,
    actorUserId: session.userId,
    scopeType: body.data.scopeType,
    scopeId: body.data.scopeId,
    playlistVersionId: body.data.playlistVersionId,
    fallbackPlaylistVersionId: body.data.fallbackPlaylistVersionId ?? null,
    priority: body.data.priority,
  })

  return jsonResponse({ ok: true, ...result, assignments: listAssignments(companyId) })
})

/**
 * Снятие назначения.
 *
 * Убирает правило «что показывать», но не выпускает публикацию: экран
 * продолжит играть выложенную программу, пока не выйдет следующая. Так
 * «снять» не гасит экран в момент нажатия.
 */
export const DELETE = route(async (request: Request) => {
  const { companyId, access, session } = await requireDashboardMutation(request)
  requirePermission(access, PERMISSIONS.releasesPublish, 'Нет прав на изменение назначений')

  const body = unassignSchema.safeParse(await readJsonBody(request))
  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Укажите экраны или область назначения')
  }

  const result = removeAssignment({
    companyId,
    actorUserId: session.userId,
    scopeType: body.data.scopeType,
    scopeId: body.data.scopeId,
    screenIds: body.data.screenIds,
  })

  return jsonResponse({ ...result, assignments: listAssignments(companyId) })
})

/**
 * Публикация на сеть.
 *
 * Создаёт версию, раскладывает манифесты по экранам и ставит чеки в
 * `queued`. Саму отправку делает не этот обработчик, а насос доставки в
 * процессе канала устройств: обработчики маршрутов и канал работают в
 * разных изоляциях процесса и не делят память, поэтому реестр сокетов в
 * маршруте всегда пуст (см. §3.2 плана и `src/server/ws/delivery-pump.ts`).
 *
 * Из-за этого ответ не содержит «доставлено N»: в момент ответа ещё никто
 * не отправил. Числа появятся через несколько секунд — их показывает доска
 * доставки, которая опрашивает сервер.
 */
export const POST = route(async (request: Request) => {
  const { companyId, access, session } = await requireDashboardMutation(request)
  requirePermission(access, PERMISSIONS.releasesPublish, 'Нет прав на публикацию')

  const body = publishSchema.safeParse(await readJsonBody(request).catch(() => null))
  const reason = body.success ? (body.data.reason ?? null) : null
  const screenIds = body.success ? body.data.screenIds : undefined

  let result: { releaseId: string; version: number; screens: number }

  if (screenIds) {
    // Публикация выбранным экранам: оператор чинит один телевизор, не
    // перезапуская всю сеть. Версия всё равно общая на компанию.
    const known = listScreenIds(companyId, screenIds)
    if (known.length === 0) {
      throw HttpError.notFound('Выбранные экраны не найдены')
    }

    result = publishScreens({ companyId, screenIds: known, actorUserId: session.userId, reason: reason ?? undefined })
  } else {
    result = publishCompany(companyId, session.userId, reason ?? undefined)
  }

  logger.info(result, 'публикация выполнена')

  return jsonResponse({
    ...result,
    summary: deliverySummary(companyId, result.releaseId),
  })
})
