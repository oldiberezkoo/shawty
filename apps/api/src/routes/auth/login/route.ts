import { z } from 'zod'
import { route, clientIp, clientUserAgent, readJsonBody, jsonResponse } from '@/server/http/request'
import { createSession, verifyCredentials } from '@/server/services/auth-service'
import { setAuthCookies } from '@/server/http/cookies'
import { enforceRateLimit, ipKey } from '@/server/http/rate-limit'
import { HttpError } from '@/server/http/errors'

const loginSchema = z.object({
  email: z.string().min(3).max(320),
  password: z.string().min(1).max(200),
})

export const POST = route(async (request) => {
  enforceRateLimit(
    ipKey('auth:login', request),
    { limit: 10, windowMs: 15 * 60_000 },
    'Слишком много попыток входа. Повторите через несколько минут.',
  )

  const body = loginSchema.safeParse(await readJsonBody(request))
  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Проверьте почту и пароль')
  }

  const user = verifyCredentials(body.data.email, body.data.password)
  if (!user) {
    // Не разделяем «нет такого пользователя» и «неверный пароль»:
    // иначе форма входа превращается в способ перебрать список почт.
    throw HttpError.unauthorized('Неверная почта или пароль')
  }

  const session = createSession(user.id, {
    ip: clientIp(request),
    userAgent: clientUserAgent(request),
  })

  await setAuthCookies(session.token, session.csrfSecret, session.expiresAt)

  return jsonResponse({
    ok: true,
    user: session.user,
    companyId: null,
  })
})
