import { route, jsonResponse } from '@/server/http/request'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { requireDashboardRequest, requirePermission } from '@/server/http/dashboard-request'
import { listIncidents, openIncidentCounts, openOfflineIncidents } from '@/server/services/incident-service'
import { playbackErrors, parsePeriod, silentScreens } from '@/server/services/report-service'
import {
  deviceProfilesByScreen,
  latestTelemetryByScreen,
  listScreens,
  telemetrySeriesByScreen,
} from '@/server/services/screen-service'
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

  const screenList = listScreens(companyId)
  const latest = latestTelemetryByScreen(companyId)
  const series = telemetrySeriesByScreen(companyId, 24)
  const profiles = deviceProfilesByScreen(companyId)
  const openDowntimes = openOfflineIncidents(companyId)

  const devices = screenList.map((screen) => {
    const profile = profiles.get(screen.id) ?? null

    return {
      id: screen.id,
      name: screen.name,
      branchName: screen.branchName,
      onlineState: screen.onlineState,
      lastSeenSecondsAgo: screen.lastSeenSecondsAgo,
      playerVersion: screen.playerVersion,
      pendingRelease: screen.pendingRelease,
      platform: profile?.platform ?? null,
      screenWidth: profile?.screenWidth ?? null,
      screenHeight: profile?.screenHeight ?? null,
      deviceMemoryGb: profile?.deviceMemoryGb ?? null,
      hardwareConcurrency: profile?.hardwareConcurrency ?? null,
      telemetry: latest.get(screen.id) ?? null,
      history: series.get(screen.id) ?? [],
    }
  })

  return jsonResponse({
    totals: {
      screens: screenList.length,
      online: screenList.filter((screen) => screen.onlineState === 'online').length,
      offline: screenList.filter((screen) => screen.onlineState !== 'online').length,
    },
    devices,
    silent: silentScreens(companyId, serverConfig.player.offlineAfterSec),
    openDowntimes,
    openCounts: openIncidentCounts(companyId),
    feed: listIncidents(companyId, { limit: 40 }),
    errors: playbackErrors(companyId, from, to, 20),
  })
})