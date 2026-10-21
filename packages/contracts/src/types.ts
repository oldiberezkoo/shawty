/**
 * Базовые типы предметной области, общие для API и веба.
 *
 * Здесь только форма данных: роли, области доступа и контекст сессии.
 * Никаких запросов к базе и зависимостей от Node.
 */

export type Role = 'owner' | 'admin' | 'editor' | 'analyst' | 'viewer'

export type ScopeType = 'screen' | 'group' | 'branch' | 'company'

/** Область доступа сотрудника. Пустой список означает «без ограничений». */
export type ScopeRow = {
  scopeType: 'screen' | 'group' | 'branch'
  scopeId: string
}

export type CompanyStatus = 'active' | 'suspended'

export type MembershipContext = {
  companyId: string
  companyName: string
  companySlug: string
  companyStatus: CompanyStatus
  role: Role
  scopes: ScopeRow[]
}

/** Полный контекст сессии на сервере: включает CSRF-секрет. */
export type SessionContext = {
  sessionId: string
  userId: string
  name: string
  email: string
  csrfSecret: string
  companies: MembershipContext[]
}

/** Безопасное представление сессии для веба: без CSRF-секрета. */
export type SessionView = Omit<SessionContext, 'csrfSecret'>

export type ErrorPayload = {
  error: {
    code: string
    message: string
    [key: string]: unknown
  }
}
