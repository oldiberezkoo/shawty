import { redirect } from 'next/navigation'
import type { SessionView } from '@shawty/contracts'
import { apiGet, ApiError } from '@/server/api'

/**
 * Сессия для серверных страниц.
 *
 * Проверка идёт через API: веб не читает базу и не знает, как устроены
 * сессии. На 401 браузер уводится на страницу входа.
 */
export async function requireSession(): Promise<SessionView> {
  try {
    return await apiGet<SessionView>('/api/auth/session')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login')
    }
    throw error
  }
}
