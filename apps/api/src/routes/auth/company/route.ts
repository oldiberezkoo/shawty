import { z } from 'zod'
import { route, jsonResponse, readJsonBody } from '@/server/http/request'
import { requireSessionForApi } from '@/server/auth/require-session'
import { assertCsrf } from '@/server/services/auth-service'
import { createCompanyForOwner } from '@/server/services/company-service'
import { HttpError } from '@/server/http/errors'

/**
 * Сеть для уже существующего аккаунта.
 *
 * Нужна тем, кто зарегистрировался до появления названия компании: сессия у
 * них валидна, но панель недоступна, и создать сеть было негде. Регистрация
 * идёт отдельным маршрутом, поэтому старый аккаунт не приходится заводить
 * заново на другой адрес.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSessionForApi()

  // Изменяющий запрос: без CSRF чужой сайт мог бы создать компанию от имени
  // вошедшего пользователя.
  assertCsrf(session, request.headers.get('x-csrf-token'))

  const body = z
    .object({ name: z.string().min(2, 'Название компании слишком короткое').max(120) })
    .safeParse(await readJsonBody(request))

  if (!body.success) {
    throw HttpError.badRequest('invalid_input', body.error.issues[0]?.message ?? 'Проверьте название')
  }

  if (session.companies.length > 0) {
    throw HttpError.conflict('company_exists', 'У вас уже есть компания')
  }

  const created = createCompanyForOwner({ userId: session.userId, name: body.data.name })

  return jsonResponse({ ok: true, companyId: created.companyId, slug: created.slug }, { status: 201 })
})
