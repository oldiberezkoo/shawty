import { route, jsonResponse } from '@/server/http/request'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { requireDashboardRequest, requirePermission } from '@/server/http/dashboard-request'
import { campaignCsv, campaignReport } from '@/server/services/campaign-report-service'
import { parsePeriod } from '@/server/services/report-service'

/**
 * Отчёт по кампаниям.
 *
 * Считается по событиям воспроизведения, привязанным к кампании точной связкой
 * через таргеты публикации, а не по интервалу дат кампании.
 *
 * В ответе нет и не будет поля «показы»: подтверждается, что материал начал
 * показываться на экране, а не что его увидел человек. Заголовки CSV названы
 * `started_plays`, чтобы выгруженный файл нельзя было прочитать иначе.
 */
export const GET = route(async (request: Request) => {
  const { companyId, access } = await requireDashboardRequest(request)
  requirePermission(access, PERMISSIONS.analyticsRead, 'Нет доступа к аналитике')

  const url = new URL(request.url)
  const { from, to } = parsePeriod(url.searchParams.get('from'), url.searchParams.get('to'))

  const report = campaignReport({
    companyId,
    from,
    to,
    campaignId: url.searchParams.get('campaignId') ?? undefined,
  })

  if (url.searchParams.get('format') === 'csv') {
    return new Response(`﻿${campaignCsv(report)}`, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="campaigns-${from.toISOString().slice(0, 10)}-${to
          .toISOString()
          .slice(0, 10)}.csv"`,
        'cache-control': 'no-store',
      },
    })
  }

  return jsonResponse({
    report: {
      from: report.from.toISOString(),
      to: report.to.toISOString(),
      totals: report.totals,
      campaigns: report.campaigns,
    },
  })
})