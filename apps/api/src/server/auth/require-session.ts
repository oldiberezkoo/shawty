import { readSessionCookie } from '@/server/http/cookies'
import { HttpError } from '@/server/http/errors'
import { loadSessionContext, type SessionContext } from '@/server/services/auth-service'

/**
 * Для API нет HTML-страниц: отсутствие сессии — это всегда 401 JSON,
 * а не redirect. Веб-приложение само решает, куда отправить браузер.
 */
export async function requireSessionForApi(): Promise<SessionContext> {
  const token = await readSessionCookie()

  if (!token) {
    throw HttpError.unauthorized('Требуется вход')
  }

  const context = loadSessionContext(token)
  if (!context) {
    throw HttpError.unauthorized('Сессия истекла или была отозвана')
  }

  return context
}

/** Совместимый alias для кода, который ещё не переименован. */
export const requireSession = requireSessionForApi
