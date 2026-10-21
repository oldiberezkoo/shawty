import { route, jsonResponse } from '@/server/http/request'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { requireDashboardRequest, requirePermission } from '@/server/http/dashboard-request'
import {
  companyScreenZones,
  describePlaylistVersion,
  publicationState,
  schedulePreview,
} from '@/server/services/schedule-service'

/**
 * Расписание для интерфейса.
 *
 * Два ответа на один маршрут:
 *
 * - без параметров — что и когда должно идти на каждом экране сейчас;
 * - с `screenId` — календарь на неделю вперёд для одного экрана.
 *
 * Отдельный маршрут на «календарь» не нужен: обе картины читаются из одного
 * расчёта, и разные маршруты разошлись бы при первом же изменении правил.
 */
export const GET = route(async (request: Request) => {
  const { companyId, access } = await requireDashboardRequest(request)
  requirePermission(access, PERMISSIONS.campaignsRead, 'Нет доступа к расписанию')

  const url = new URL(request.url)
  const screenId = url.searchParams.get('screenId')

  if (screenId) {
    const days = clampDays(url.searchParams.get('days'))

    return jsonResponse({ preview: schedulePreview({ companyId, screenId, from: new Date(), days }) })
  }

  const screens = companyScreenZones(companyId).map((zone) => {
    const state = publicationState(companyId, zone.screenId)

    return {
      ...zone,
      nextChangeAt: state.nextChangeAt?.toISOString() ?? null,
      appliedVersion: state.appliedVersion,
      desiredVersion: state.desiredVersion,
      needsChange: state.needsChange,
      campaignId: state.resolution.campaignId,
      campaignName: state.resolution.campaignName,
      playlist: describePlaylistVersion(state.resolution.playlistVersionId),
      fallbackPlaylist: describePlaylistVersion(state.resolution.fallbackPlaylistVersionId),
      /** Кто ещё мог бы показываться: цепочка кандидатов по убыванию правил. */
      chain: state.resolution.chain.map((entry) => ({
        campaignId: entry.campaignId,
        campaignName: entry.campaignName,
      })),
    }
  })

  return jsonResponse({ screens })
})

/** Горизонт календаря: неделя — достаточно для планирования, мало для расчёта. */
function clampDays(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '7', 10)
  if (!Number.isFinite(parsed)) return 7

  return Math.min(14, Math.max(1, parsed))
}