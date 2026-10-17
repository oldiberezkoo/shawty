import { redirect } from 'next/navigation'
import { readSessionCookie } from '@/server/http/cookies'
import { loadSessionContext, type SessionContext } from '@/server/services/auth-service'

/**
 * Доступ к серверному компоненту только для вошедших.
 * `returnTo` сохраняется, чтобы после входа пользователь вернулся
 * на страницу подтверждения привязки, открытую по QR.
 */
export async function requireSession(): Promise<SessionContext> {
  const token = await readSessionCookie()

  if (!token) {
    redirect('/login')
  }

  const context = loadSessionContext(token)

  if (!context) {
    redirect('/login')
  }

  return context
}

/**
 * То же, но для обработчиков API: бросает 401 вместо перенаправления.
 * Редирект в fetch приводит к тому, что клиент получает HTML вместо JSON.
 */
export async function requireSessionForApi(): Promise<SessionContext> {
  const token = await readSessionCookie()

  if (!token) {
    throw new Response(null, { status: 401 })
  }

  const context = loadSessionContext(token)
  if (!context) {
    throw new Response(null, { status: 401 })
  }

  return context
}
