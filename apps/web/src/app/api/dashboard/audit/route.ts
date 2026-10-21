import { route, jsonResponse, readJsonBody } from '@/server/http/request'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { requireDashboardMutation, requireDashboardRequest, requirePermission } from '@/server/http/dashboard-request'
import {
  AUDIT_ACTIONS,
  AUDIT_GROUPS,
  auditActors,
  auditByActor,
  auditCsv,
  listAudit,
  parseAuditPeriod,
} from '@/server/services/audit-service'

/**
 * Журнал действий сотрудников.
 *
 * Право `audit:read` есть не у всех, и это осознанно: журнал показывает, кто
 * отвязывал экраны и удалял файлы. Аналитику это не нужно.
 *
 * Фильтр по компании обязателен и задаётся заголовком, как и везде: выдача
 * чужого журнала была бы утечкой персональных данных, а не ошибкой выборки.
 */
export const GET = route(async (request: Request) => {
  const { companyId, access } = await requireDashboardRequest(request)
  requirePermission(access, PERMISSIONS.auditRead, 'Нет доступа к журналу действий')

  const url = new URL(request.url)
  const { from, to } = parseAuditPeriod(url.searchParams.get('from'), url.searchParams.get('to'))

  const { rows, total } = listAudit({
    companyId,
    from,
    to,
    actorUserId: url.searchParams.get('actorUserId'),
    prefix: url.searchParams.get('group'),
    limit: Number.parseInt(url.searchParams.get('limit') ?? '100', 10),
    offset: Number.parseInt(url.searchParams.get('offset') ?? '0', 10),
  })

  return jsonResponse({
    rows,
    total,
    limit: Math.min(500, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '100', 10))),
    from: from.toISOString(),
    to: to.toISOString(),
    actors: auditActors(companyId),
    byActor: auditByActor({ companyId, from, to }),
    groups: AUDIT_GROUPS,
  })
})

/**
 * Выгрузка журнала.
 *
 * Выгрузка сама по себе — чтение персональных данных, поэтому требует того же
 * права и того же CSRF, что и просмотр: иначе ссылка из почты дала бы
 * сотруднику выгрузить чужой журнал, оставив след только в логах.
 */
export const POST = route(async (request: Request) => {
  const { companyId, access } = await requireDashboardMutation(request)
  requirePermission(access, PERMISSIONS.auditRead, 'Нет доступа к журналу действий')

  const body = (await readJsonBody(request).catch(() => null)) as {
    from?: string | null
    to?: string | null
    group?: string | null
  } | null

  const { from, to } = parseAuditPeriod(body?.from ?? null, body?.to ?? null)

  const { rows } = listAudit({
    companyId,
    from,
    to,
    prefix: body?.group ?? null,
    // Выгрузка ограничена: журнал за год не помещается в файл, который
    // открывают в Excel, а обрезанная выгрузка должна быть честно помечена —
    // это делает заголовок с числом строк.
    limit: 5000,
  })

  return jsonResponse({
    csv: auditCsv(rows),
    rows: rows.length,
    truncated: rows.length >= 5000,
    actions: AUDIT_ACTIONS,
  })
})