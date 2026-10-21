import { z } from 'zod'
import { route, readJsonBody, jsonResponse } from '@/server/http/request'
import { requireSessionForApi } from '@/server/auth/require-session'
import { accessFor, assertCsrf } from '@/server/services/auth-service'
import { confirmPairing } from '@/server/services/pairing-service'
import { HttpError } from '@/server/http/errors'
import { logger } from '@/lib/logger'

const confirmSchema = z.object({
  sessionId: z.string().min(16).max(64),
  code: z.string().min(4).max(32),
  companyId: z.string().min(1).max(64),
  branchId: z.string().min(1).max(64),
  screenName: z.string().min(1).max(120),
  groupId: z.string().max(64).nullable().optional(),
})

/**
 * Подтверждение привязки авторизованным сотрудником.
 *
 * Требуется одновременно: пользовательская сессия, CSRF-токен, право
 * `screens:pair` и доступ к конкретному филиалу. Проверка лимита тарифа и
 * создание экрана выполняются в одной транзакции внутри сервиса.
 */
export const POST = route(async (request) => {
  const session = await requireSessionForApi()
  assertCsrf(session, request.headers.get('x-csrf-token'))

  const body = confirmSchema.safeParse(await readJsonBody(request))
  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Проверьте заполненные поля')
  }

  const access = accessFor(session, body.data.companyId)

  const result = confirmPairing({
    sessionId: body.data.sessionId,
    code: body.data.code,
    companyId: body.data.companyId,
    branchId: body.data.branchId,
    screenName: body.data.screenName,
    groupId: body.data.groupId ?? null,
    actor: { userId: session.userId, access },
  })

  if (!result.ok) {
    // Некорректный код и исчерпанные попытки — это 400, а не 403:
    // пользователь авторизован, ошибка в данных.
    throw HttpError.badRequest(result.reason, describeRejection(result.reason))
  }

  // Уведомление телевизору не отправляем: обработчик маршрута и канал
  // устройства работают в разных изоляциях процесса и не разделяют память,
  // поэтому такой вызов всегда возвращал бы false. Канал сам читает статус
  // подтверждения из общей таблицы SQLite раз в секунду — это единственный
  // надёжный мост между слоями. См. §3.2 плана.
  logger.info(
    { sessionId: body.data.sessionId, screenId: result.screenId },
    'привязка подтверждена',
  )

  return jsonResponse({ ok: true, screenId: result.screenId, deviceId: result.deviceId })
})

function describeRejection(reason: string): string {
  switch (reason) {
    case 'not_found':
      return 'Сессия привязки не найдена'
    case 'expired':
      return 'Срок кода истёк. Включите телевизор заново, чтобы получить новый QR.'
    case 'invalid_code':
      return 'Код не совпадает. Проверьте символы — похожие буквы легко спутать на экране.'
    case 'locked':
      return 'Попытки исчерпаны. Включите телевизор заново, чтобы получить новый QR.'
    case 'already_confirmed':
      return 'Эта сессия уже подтверждена'
    default:
      return 'Не удалось подтвердить привязку'
  }
}
