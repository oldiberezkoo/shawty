import { z } from 'zod'
import { route, jsonResponse, readJsonBody } from '@/server/http/request'
import { requireSessionForApi } from '@/server/auth/require-session'
import { findPairingSessionByCode } from '@/server/services/pairing-service'
import { HttpError } from '@/server/http/errors'

/**
 * Поиск сессии подключения по коду с экрана телевизора.
 *
 * Отдельный маршрут, а не параметр подтверждения: подтверждение меняет состояние
 * сети, а здесь нужен только ответ «такая сессия есть». Смешивать их означало бы
 * дать человеку форму подтверждения до того, как он выбрал экран.
 *
 * Вход всё равно обязателен: подтверждать привязку может только владелец или
 * администратор, и код без сессии ничего не даёт постороннему.
 */
export const POST = route(async (request: Request) => {
  await requireSessionForApi()

  const body = z
    .object({ code: z.string().trim().regex(/^[0-9]{4,12}$/, 'Код состоит из цифр') })
    .safeParse(await readJsonBody(request))

  if (!body.success) {
    throw HttpError.badRequest('invalid_code', 'Код состоит из цифр, как на экране телевизора')
  }

  const found = findPairingSessionByCode({ code: body.data.code, request })

  if ('error' in found) {
    if (found.error === 'rate_limited') {
      throw HttpError.tooManyRequests('Слишком много попыток ввода кода. Повторите через несколько минут.', 600_000)
    }

    // Не «сессия не найдена», а «код не подошёл»: так точнее для человека,
    // который набирает цифры с экрана и мог промахнуться одной.
    throw HttpError.notFound('Код не подошёл. Проверьте его на экране телевизора или возьмите новый.')
  }

  return jsonResponse({ sessionId: found.sessionId })
})