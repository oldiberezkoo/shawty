import { jsonResponse, route } from '@/server/http/request'
import { clearAuthCookies, readSessionCookie } from '@/server/http/cookies'
import { loadSessionContext, revokeSession } from '@/server/services/auth-service'

export const POST = route(async () => {
  const token = await readSessionCookie()

  if (token) {
    const context = loadSessionContext(token)
    // Сессия отзывается в базе, а не просто забывается в куке: украденную
    // копию куки базарное окно больше не примет.
    if (context) revokeSession(context.sessionId)
  }

  await clearAuthCookies()
  return jsonResponse({ ok: true })
})
