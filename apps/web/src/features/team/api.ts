import { dashboardRequest, type DashboardResult } from '@/shared/api/dashboard-client'

/** Единая точка запросов к API команды: приглашения и изменения сотрудников. */
export async function teamRequest(
  companyId: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: unknown,
  invitationId?: string,
): Promise<DashboardResult<Record<string, unknown>>> {
  const path = invitationId
    ? `/api/dashboard/team?invitationId=${encodeURIComponent(invitationId)}`
    : '/api/dashboard/team'

  return dashboardRequest<Record<string, unknown>>(path, { method, body: JSON.stringify(body) }, companyId)
}

/** Ограничение доступа сотрудника филиалами, группами и экранами. */
export function saveMemberScopes(
  companyId: string,
  membershipId: string,
  scopes: { scopeType: string; scopeId: string }[],
) {
  return teamRequest(companyId, 'PATCH', { membershipId, action: 'scopes', scopes })
}

export function inviteMember(companyId: string, email: string, role: string) {
  return teamRequest(companyId, 'POST', { email, role })
}
