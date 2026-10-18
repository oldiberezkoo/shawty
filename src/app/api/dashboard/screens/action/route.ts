import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/client'
import { screens } from '@/db/schema'
import { route, readJsonBody, jsonResponse, clientIp } from '@/server/http/request'
import { requireSessionForApi } from '@/server/auth/require-session'
import { accessFor, assertCsrf } from '@/server/services/auth-service'
import { disableScreen, enableScreen, requestRotation, unpairScreen } from '@/server/services/device-service'
import { recordAudit, type AuditAction } from '@/server/services/audit-service'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { HttpError } from '@/server/http/errors'
import { logger } from '@/lib/logger'

const bodySchema = z.object({
  companyId: z.string().min(1).max(64),
  action: z.enum(['disable', 'enable', 'unpair', 'rotate']),
})

/**
 * Соответствие действия экрана и записи журнала.
 *
 * Оставлено как проверка: `recordAudit` требует `AuditAction`, и если бы
 * действие экрана не было в каталоге, компилятор указал бы на это здесь, а не
 * на молча пропавший фильтр в интерфейсе.
 */
const SCREEN_AUDIT = {
  disable: 'screen.disabled',
  enable: 'screen.enabled',
  unpair: 'screen.unpaired',
  rotate: 'screen.rotated',
} as const satisfies Record<'disable' | 'enable' | 'unpair' | 'rotate', AuditAction>

/**
 * Управление парком экранов: отключение, отвязка и ротация.
 *
 * Отключение обратимо и сохраняет учётные данные. Отвязка необратима: доверие
 * снимается, устройство обязано стереть секрет, а для возврата в работу нужна
 * новая привязка по QR.
 */
export const POST = route(async (request) => {
  const session = await requireSessionForApi()
  assertCsrf(session, request.headers.get('x-csrf-token'))

  const body = bodySchema.safeParse(await readJsonBody(request))
  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Некорректное действие')
  }

  const access = accessFor(session, body.data.companyId)
  const screenId = new URL(request.url).searchParams.get('screenId')

  if (!screenId) {
    throw HttpError.badRequest('invalid_input', 'Не указан экран')
  }

  const screen = db.select().from(screens).where(eq(screens.id, screenId)).get()
  if (!screen || screen.companyId !== body.data.companyId) {
    // 404 вместо 403: иначе перебором идентификаторов можно проверить
    // существование чужих экранов.
    throw HttpError.notFound('Экран не найден')
  }

  if (!access.canAccess('screens:write', { branchId: screen.branchId, groupId: screen.groupId, screenId })) {
    throw HttpError.forbidden('Нет доступа к этому экрану')
  }

  const needsPairingRight = body.data.action === 'unpair' || body.data.action === 'rotate'

  if (needsPairingRight && !access.canAccess(PERMISSIONS.screensRotate, { branchId: screen.branchId, screenId })) {
    throw HttpError.forbidden('Недостаточно прав для этой операции')
  }

  // Запись в журнал делает сам сервис: забыть её в вызывающем коде было бы
  // слишком легко, а отвязка без следа — это худший вид потери данных.
  switch (body.data.action) {
    case 'disable':
      disableScreen(screenId, session.userId)
      break
    case 'enable':
      enableScreen(screenId, session.userId)
      break
    case 'unpair':
      unpairScreen(screenId, new Date(), session.userId)
      break
    case 'rotate':
      requestRotation(screenId, session.userId)
      break
  }

  logger.info(
    { screenId, action: body.data.action, actor: session.userId },
    'операция с экраном выполнена',
  )

  return jsonResponse({ ok: true, screenId, action: body.data.action })
})
