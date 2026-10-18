import { route, jsonResponse } from '@/server/http/request'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { requireDashboardRequest, requirePermission } from '@/server/http/dashboard-request'
import { availabilityCsv, availabilityReport, parsePeriod } from '@/server/services/report-service'

/**
 * Отчёт о доступности.
 *
 * Два ответа на один маршрут: JSON для интерфейса и CSV для выгрузки. Отдельные
 * маршруты разошлись бы при первом же изменении правил подсчёта, а CSV из
 * интерфейса и CSV из API обязаны совпадать.
 *
 * Ответ считается по инцидентам, а не по событиям воспроизведения: событие
 * телевизор отправляет только по живому каналу и теряет при обрыве, а простой
 * открывается и закрывается по данным сервера.
 */
export const GET = route(async (request: Request) => {
  const { companyId, access } = await requireDashboardRequest(request)
  requirePermission(access, PERMISSIONS.analyticsRead, 'Нет доступа к аналитике')

  const url = new URL(request.url)
  const { from, to } = parsePeriod(url.searchParams.get('from'), url.searchParams.get('to'))

  const groupBy = url.searchParams.get('groupBy')
  const report = availabilityReport({
    companyId,
    from,
    to,
    branchId: url.searchParams.get('branchId') ?? undefined,
    groupId: url.searchParams.get('groupId') ?? undefined,
    groupBy: groupBy === 'branch' || groupBy === 'group' ? groupBy : undefined,
  })

  if (url.searchParams.get('format') === 'csv') {
    return new Response(`﻿${availabilityCsv(report)}`, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        // BOM обязателен: без него Excel открывает кириллицу в cp1251, и
        // названия филиалов превращаются в мусор.
        'content-disposition': `attachment; filename="availability-${from.toISOString().slice(0, 10)}-${to
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
      branches: report.branches,
      screens: report.screens.map((row) => ({
        screenId: row.screenId,
        screenName: row.screenName,
        branchName: row.branchName,
        groupName: row.groupName,
        offlineMs: row.offlineMs,
        staleMs: row.staleMs,
        uptimePercent: row.uptimePercent,
        downtimeCount: row.downtimeCount,
      })),
    },
  })
})