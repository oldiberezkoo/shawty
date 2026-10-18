import { route, jsonResponse } from '@/server/http/request'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { requireDashboardRequest, requirePermission } from '@/server/http/dashboard-request'
import { listIncidents, openIncidentCounts, openOfflineIncidents } from '@/server/services/incident-service'
import { playbackErrors, parsePeriod, silentScreens } from '@/server/services/report-service'
import { serverConfig } from '@/config/server'

/**
 * Состояние сети прямо сейчас.
 *
 * Отдельный маршрут от отчёта за период: оператор открывает «Мониторинг», чтобы
 * посмотреть, что происходит сейчас, а не чтобы вспомнить прошлую неделю.
 * Смешивать эти два ответа в одном значило бы грузить историю ради одного
 * взгляда на текущий статус.
 */
export const GET = route(async (request: Request) => {
  const { companyId, access } = await requireDashboardRequest(request)
  requirePermission(access, PERMISSIONS.monitoringRead, 'Нет доступа к мониторингу')

  const url = new URL(request.url)
  const { from, to } = parsePeriod(url.searchParams.get('from'), url.searchParams.get('to'))

  return jsonResponse({
    silent: silentScreens(companyId, serverConfig.player.offlineAfterSec),
    openDowntimes: openOfflineIncidents(companyId),
    openCounts: openIncidentCounts(companyId),
    feed: listIncidents(companyId, { limit: 40 }),
    errors: playbackErrors(companyId, from, to, 20),
  })
})