import { dashboardRequest, type DashboardResult } from '@/shared/api/dashboard-client'
import type { AuditExport, AuditResponse } from './model'

export type AuditFilters = {
  from: Date
  to: Date
  group: string
  actorUserId: string
}

/**
 * Записи журнала за период.
 *
 * Сеть и отказ сервера различаются сообщением: «Журнал недоступен» означает,
 * что ответа не было вовсе, а текст сервера объясняет причину отказа.
 */
export async function fetchAudit(
  companyId: string,
  filters: AuditFilters,
): Promise<{ ok: true; data: AuditResponse } | { ok: false; message: string }> {
  const query = new URLSearchParams({
    from: filters.from.toISOString(),
    to: filters.to.toISOString(),
    limit: '200',
  })

  if (filters.group) query.set('group', filters.group)
  if (filters.actorUserId) query.set('actorUserId', filters.actorUserId)

  const result = await dashboardRequest<AuditResponse>(
    `/api/dashboard/audit?${query.toString()}`,
    {},
    companyId,
    'Не удалось загрузить журнал',
  )

  if (!result.ok) {
    return { ok: false, message: result.status === 0 ? 'Журнал недоступен' : result.message }
  }

  return { ok: true, data: result.data }
}

/**
 * Выгрузка журнала.
 *
 * Отдельный запрос, а не часть списка: выгрузка отдаёт CSV и упирается
 * в собственный лимит строк.
 */
export function downloadAudit(
  companyId: string,
  filters: { from: Date; to: Date; group: string },
): Promise<DashboardResult<AuditExport>> {
  return dashboardRequest<AuditExport>(
    '/api/dashboard/audit',
    {
      method: 'POST',
      body: JSON.stringify({ from: filters.from.toISOString(), to: filters.to.toISOString(), group: filters.group || null }),
    },
    companyId,
    'Не удалось выгрузить журнал',
  )
}
