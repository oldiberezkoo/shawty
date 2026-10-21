import { route, jsonResponse } from '@/server/http/request'
import { requireSessionForApi } from '@/server/auth/require-session'

/** Текущая сессия без CSRF-секрета: веб использует её для проверки входа. */
export const GET = route(async () => {
  const session = await requireSessionForApi()
  const { csrfSecret: _csrfSecret, ...view } = session

  return jsonResponse(view)
})
