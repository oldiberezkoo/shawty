import { accessFor, assertCsrf, type SessionContext } from '@/server/services/auth-service'
import { requireSessionForApi } from '@/server/auth/require-session'
import { createAccess, type Access } from '@/domain/authz/permissions'
import { HttpError } from '@/server/http/errors'

/**
 * Разбор запроса дашборда: сессия, компания и права.
 *
 * Повторяющаяся часть каждого маршрута. Вынесена, потому что ошибка
 * «забыли проверить право» — типичный источник дыр: маршрутов много, и
 * проверка должна быть частью обязательного входа в них, а не
 * необязательной строкой в конце.
 *
 * Компания берётся из заголовка `x-company-id`, а не из тела: тело может
 * отсутствовать у GET-запросов, а параметр обязателен для проверки доступа.
 */
export type DashboardRequest = {
  session: SessionContext
  companyId: string
  access: Access
}

export async function requireDashboardRequest(request: Request): Promise<DashboardRequest> {
  const session = await requireSessionForApi()

  const companyId = request.headers.get('x-company-id')
  if (!companyId) {
    throw HttpError.badRequest('invalid_input', 'Не указана компания')
  }

  const access = accessFor(session, companyId)
  return { session, companyId, access }
}

/** То же, но с проверкой CSRF — для любого изменяющего запроса. */
export async function requireDashboardMutation(request: Request): Promise<DashboardRequest> {
  const context = await requireDashboardRequest(request)
  assertCsrf(context.session, request.headers.get('x-csrf-token'))
  return context
}

/** Проверка права с понятным сообщением вместо голого 403. */
export function requirePermission(access: Access, permission: Parameters<Access['can']>[0], message: string): void {
  if (!access.can(permission)) {
    throw HttpError.forbidden(message)
  }
}
