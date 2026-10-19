import { z } from 'zod'
import { route, jsonResponse, readJsonBody } from '@/server/http/request'
import { requireSessionForApi } from '@/server/auth/require-session'
import { CODE_ALPHABET } from '@/lib/code-alphabet'
import { findPairingSessionByCode } from '@/server/services/pairing-service'
import { HttpError } from '@/server/http/errors'

/**
 * Код не «цифровой», а буквенно-цифровой.
 *
 * Алфавит один на весь продукт и намеренно без 0/1/I/L/O/U: эти символы
 * одинаково читаются как разные при взгляде на экран с расстояния, и
 * человек вводит не тот — а потом гадает, что не так. Проверка по этому же
 * алфавиту, а не `/^[0-9]+$/`, потому что цифровая проверка отвергала бы
 * половину настоящих кодов.
 */
const CODE_LENGTH = 8

const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`))

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

  const body = z.object({ code: codeSchema }).safeParse(await readJsonBody(request))

  if (!body.success) {
    throw HttpError.badRequest('invalid_code', 'Код состоит из восьми символов, как на экране телевизора')
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