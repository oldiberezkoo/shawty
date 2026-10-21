import { route, jsonResponse } from '@/server/http/request'
import { PERMISSIONS } from '@shawty/contracts'
import { requireDashboardRequest, requirePermission } from '@/server/http/dashboard-request'
import { listScreens, summarizeScreens } from '@/server/services/screen-service'
import { listPublishedVersions } from '@/server/services/playlist-service'

/**
 * Список экранов для серверных страниц дашборда.
 * Раньше страницы вызывали сервис напрямую; теперь тот же набор данных
 * отдаётся по HTTP, чтобы веб не знал про базу.
 */
export const GET = route(async (request: Request) => {
  const { companyId, access } = await requireDashboardRequest(request)
  requirePermission(access, PERMISSIONS.screensRead, 'Нет доступа к экранам')

  return jsonResponse({
    screens: listScreens(companyId),
    summary: summarizeScreens(companyId),
    versions: listPublishedVersions(companyId),
  })
})
