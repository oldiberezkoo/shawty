import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  companies,
  memberships,
  membershipScopes,
  sessions,
  users,
  type Role,
} from '@/db/schema'
import { hashPassword, safeEqual, sha256Hex, verifyPassword } from '@/lib/crypto'
import { randomCsrfSecret, randomSessionToken } from '@/lib/ids'
import { createAccess, type Access, type ScopeRow } from '@/domain/authz/permissions'
import { HttpError } from '@/server/http/errors'

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export type MembershipContext = {
  companyId: string
  companyName: string
  companySlug: string
  companyStatus: 'active' | 'suspended'
  role: Role
  /** Пустой список — доступ без ограничений по филиалам. */
  scopes: ScopeRow[]
}

export type SessionContext = {
  sessionId: string
  userId: string
  name: string
  email: string
  csrfSecret: string
  companies: MembershipContext[]
}

export type LoginResult = {
  token: string
  csrfSecret: string
  expiresAt: Date
  user: { id: string; name: string; email: string }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Токен сессии — 256 бит случайности, поэтому в базе достаточно sha256.
 * scrypt здесь не нужен: пароль в этой таблице не хранится, а токен не подбирается.
 */
function tokenHash(token: string): string {
  return sha256Hex(token)
}

export function verifyCredentials(email: string, password: string): { id: string; name: string; email: string } | null {
  const row = db.select().from(users).where(eq(users.email, normalizeEmail(email))).get()

  // Считаем хеш даже когда пользователя нет, чтобы время ответа не выдавало,
  // существует ли такая почта.
  const ok = row ? verifyPassword(password, row.passwordHash) : verifyPassword(password, hashPassword('dummy'))

  if (!row || !ok) return null
  return { id: row.id, name: row.name, email: row.email }
}

export function createSession(
  userId: string,
  meta: { ip: string | null; userAgent: string | null },
): LoginResult {
  const token = randomSessionToken()
  const csrfSecret = randomCsrfSecret()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  const sessionId = crypto.randomUUID()

  db.insert(sessions)
    .values({
      id: sessionId,
      userId,
      tokenHash: tokenHash(token),
      csrfSecret,
      expiresAt,
      lastSeenAt: new Date(),
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
    })
    .run()

  const user = db.select().from(users).where(eq(users.id, userId)).get()
  if (!user) throw new HttpError(500, 'internal', 'Пользователь исчез после создания сессии')

  return { token, csrfSecret, expiresAt, user: { id: user.id, name: user.name, email: user.email } }
}

export function revokeSession(sessionId: string): void {
  db.update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
    .run()
}

/** Читает сессию по токену из куки. Возвращает null, если срок вышел или доступ отозван. */
export function loadSessionContext(token: string): SessionContext | null {
  const now = new Date()

  const row = db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, tokenHash(token)),
        gt(sessions.expiresAt, now),
        isNull(sessions.revokedAt),
      ),
    )
    .get()

  if (!row) return null

  const user = db.select().from(users).where(eq(users.id, row.userId)).get()
  if (!user) return null

  const membershipRows = db
    .select({
      companyId: memberships.companyId,
      role: memberships.role,
      companyName: companies.name,
      companySlug: companies.slug,
      companyStatus: companies.status,
    })
    .from(memberships)
    .innerJoin(companies, eq(companies.id, memberships.companyId))
    .where(and(eq(memberships.userId, user.id), eq(memberships.status, 'active')))
    .all()

  const scopeRows = db
    .select({
      companyId: memberships.companyId,
      scopeType: membershipScopes.scopeType,
      scopeId: membershipScopes.scopeId,
    })
    .from(membershipScopes)
    .innerJoin(memberships, eq(memberships.id, membershipScopes.membershipId))
    .where(eq(memberships.userId, user.id))
    .all()

  const scopesByCompany = new Map<string, ScopeRow[]>()
  for (const scope of scopeRows) {
    const list = scopesByCompany.get(scope.companyId) ?? []
    list.push({ scopeType: scope.scopeType, scopeId: scope.scopeId })
    scopesByCompany.set(scope.companyId, list)
  }

  // Обновляем lastSeenAt не чаще раза в минуту: иначе каждый запрос дашборда
  // пишет в базу, а ради этого колаутит индекс.
  if (now.getTime() - row.lastSeenAt.getTime() > 60_000) {
    db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.id)).run()
  }

  return {
    sessionId: row.id,
    userId: user.id,
    name: user.name,
    email: user.email,
    csrfSecret: row.csrfSecret,
    companies: membershipRows.map((membership) => ({
      companyId: membership.companyId,
      companyName: membership.companyName,
      companySlug: membership.companySlug,
      companyStatus: membership.companyStatus,
      role: membership.role,
      scopes: scopesByCompany.get(membership.companyId) ?? [],
    })),
  }
}

/**
 * Доступ к конкретной компании. Если сотрудник не состоит в компании,
 * это 404, а не 403: иначе перебором идентификаторов можно проверить
 * существование чужих компаний.
 */
export function accessFor(context: SessionContext, companyId: string): Access {
  const membership = context.companies.find((item) => item.companyId === companyId)
  if (!membership) {
    throw HttpError.notFound('Компания не найдена')
  }
  return createAccess(membership.role, membership.scopes)
}

export function defaultCompanyId(context: SessionContext): string | null {
  return context.companies[0]?.companyId ?? null
}

/** Проверка CSRF-заголовка для изменяющих запросов дашборда. */
export function assertCsrf(context: SessionContext, headerValue: string | null): void {
  if (!headerValue || !safeEqual(headerValue, context.csrfSecret)) {
    throw HttpError.forbidden('Запрос отклонён: недействительный CSRF-токен')
  }
}
