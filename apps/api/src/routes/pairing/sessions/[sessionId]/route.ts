import { route, jsonResponse, type RouteContext } from '@/server/http/request'
import { requireSessionForApi } from '@/server/auth/require-session'
import { watchPairing } from '@/server/services/pairing-service'
import { getBranchOptions, getGroupOptions } from '@/server/services/screen-service'

type Context = RouteContext<{ sessionId: string }>

/**
 * Состояние сессии привязки для страницы подтверждения.
 *
 * Страница раньше читала сервис напрямую; теперь получает тот же снимок
 * состояния по HTTP. Секреты и хеши кодов наружу не отдаются.
 */
export const GET = route(async (_request: Request, context: Context) => {
  const session = await requireSessionForApi()
  const { sessionId } = await context.params
  const state = watchPairing(sessionId)
  const first = session.companies[0]

  return jsonResponse({
    state: state.state,
    remainingMs: state.state === 'pending' ? state.remainingMs : 0,
    codeInQr: state.codeInQr,
    companies: session.companies.map((membership) => ({
      companyId: membership.companyId,
      companyName: membership.companyName,
      role: membership.role,
      scopes: membership.scopes,
    })),
    defaultCompanyId: first?.companyId ?? null,
    branches: first ? getBranchOptions(first.companyId) : [],
    groups: first ? getGroupOptions(first.companyId) : [],
  })
})
