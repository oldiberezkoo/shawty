/**
 * Команда компании: сотрудники, приглашения и области доступа.
 *
 * Роль живёт в контексте компании, а не глобально: один человек может вести
 * контент в двух компаниях, но не иметь доступа к оплате ни в одной из них.
 * Поэтому `memberships` — единственное место, где роль записана, и любая
 * проверка прав идёт через неё, а не через пользователя.
 */
import { and, asc, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm'
import { db, withImmediateTransaction } from '@/db/client'
import {
  auditLog,
  companies,
  invitations,
  membershipScopes,
  memberships,
  users,
  type Role,
  type ScopeType,
} from '@/db/schema'
import { hashSecret } from '@/lib/crypto'
import { ROLE_LABELS, type ScopeRow } from '@/domain/authz/permissions'
import { recordAudit } from '@/server/services/audit-service'
import { HttpError } from '@/server/http/errors'

/**
 * Срок приглашения.
 *
 * Неделя: письмо могло затеряться, но приглашение, висящее месяцами, успевает
 * достать того, кто уже работает в другой компании.
 */
const INVITATION_TTL_MS = 7 * 24 * 60 * 60_000

export type TeamMember = {
  membershipId: string
  userId: string
  name: string
  email: string
  role: Role
  status: 'active' | 'invited' | 'suspended'
  scopes: ScopeRow[]
  /** Последнее действие в журнале — чтобы понять, кто активен. */
  lastActionAt: Date | null
}

export type InvitationView = {
  id: string
  email: string
  role: Role
  expiresAt: Date
  createdAt: Date
  invitedBy: string
  /** Ссылка для приглашения. Показывается один раз — при создании. */
  expired: boolean
}

export function listMembers(companyId: string): TeamMember[] {
  const rows = db
    .select({
      membershipId: memberships.id,
      userId: memberships.userId,
      name: users.name,
      email: users.email,
      role: memberships.role,
      status: memberships.status,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.companyId, companyId))
    .orderBy(asc(users.name))
    .all()

  const scopeRows = db
    .select({
      membershipId: membershipScopes.membershipId,
      scopeType: membershipScopes.scopeType,
      scopeId: membershipScopes.scopeId,
    })
    .from(membershipScopes)
    .innerJoin(memberships, eq(memberships.id, membershipScopes.membershipId))
    .where(eq(memberships.companyId, companyId))
    .all()

  const byMembership = new Map<string, ScopeRow[]>()
  for (const scope of scopeRows) {
    const list = byMembership.get(scope.membershipId) ?? []
    list.push({ scopeType: scope.scopeType, scopeId: scope.scopeId })
    byMembership.set(scope.membershipId, list)
  }

  return rows.map((row) => ({
    membershipId: row.membershipId,
    userId: row.userId,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    scopes: byMembership.get(row.membershipId) ?? [],
    lastActionAt: null,
  }))
}

export function listInvitations(companyId: string): InvitationView[] {
  const now = new Date()

  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
      invitedBy: users.name,
    })
    .from(invitations)
    .innerJoin(users, eq(users.id, invitations.invitedByUserId))
    .where(and(eq(invitations.companyId, companyId), isNull(invitations.acceptedAt)))
    .orderBy(desc(invitations.createdAt))
    .all()
    .map((row) => ({ ...row, expired: row.expiresAt.getTime() < now.getTime() }))
}

/**
 * Приглашение сотрудника.
 *
 * Токен возвращается один раз и здесь: в базе лежит только HMAC. Это осознанное
 * ограничение — письма отправляет внешний сервис, и он тоже должен увидеть
 * ссылку ровно один раз.
 *
 * Приглашение уже принятого пользователя не создаётся: вместо него сразу
 * появляется сотрудник. Иначе администратору пришлось бы отправлять письмо
 * человеку, который уже в системе.
 */
export function createInvitation(params: {
  companyId: string
  actorUserId: string
  email: string
  role: Role
}): { id: string; token: string; alreadyMember: boolean } {
  const email = params.email.trim().toLowerCase().slice(0, 200)

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw HttpError.badRequest('invalid_email', 'Похоже, это не адрес почты')
  }

  const existingUser = db.select({ id: users.id }).from(users).where(eq(users.email, email)).get()

  if (existingUser) {
    const already = db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.companyId, params.companyId), eq(memberships.userId, existingUser.id)))
      .get()

    if (already) {
      throw HttpError.conflict('already_member', 'Этот человек уже состоит в компании')
    }

    // Пользователь уже зарегистрирован: приглашение ему не нужно, доступ
    // выдаётся сразу и сразу проверяется в журнале действий.
    addMember({ companyId: params.companyId, userId: existingUser.id, role: params.role, actorUserId: params.actorUserId })

    return { id: already!.id, token: '', alreadyMember: true }
  }

  // Незакрытое приглашение на тот же адрес заменяется: иначе по ссылке из
  // старого письма человек вошёл бы со старой ролью.
  db.delete(invitations).where(and(eq(invitations.companyId, params.companyId), eq(invitations.email, email), isNull(invitations.acceptedAt))).run()

  const token = generateInvitationToken()
  const id = crypto.randomUUID()

  db.insert(invitations)
    .values({
      id,
      companyId: params.companyId,
      email,
      role: params.role,
      tokenHash: hashSecret(token),
      invitedByUserId: params.actorUserId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    })
    .run()

  recordAudit({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    action: 'team.invited',
    targetType: 'invitation',
    targetId: id,
    meta: { email, role: params.role },
  })

  return { id, token, alreadyMember: false }
}

function generateInvitationToken(): string {
  // Тот же алфавит, что у кодов привязки: без похожих символов O/0 и l/1,
  // потому что ссылку с приглашением переписывают руками и пересказывают.
  const alphabet = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let token = ''

  for (const byte of bytes) {
    token += alphabet[byte % alphabet.length]
  }

  return token
}

/**
 * Приём приглашения.
 *
 * Одноразовость держит условный UPDATE по `accepted_at`: две вкладки с одной
 * ссылкой не должны создать двух сотрудников.
 */
export function acceptInvitation(params: { token: string; userId: string }): {
  companyId: string
  companyName: string
  role: Role
} {
  const tokenHash = hashSecret(params.token)

  const invitation = db
    .select()
    .from(invitations)
    .where(eq(invitations.tokenHash, tokenHash))
    .get()

  if (!invitation) {
    throw HttpError.notFound('Приглашение не найдено')
  }

  if (invitation.acceptedAt) {
    throw HttpError.conflict('invitation_used', 'Это приглашение уже использовано')
  }

  if (invitation.expiresAt.getTime() < Date.now()) {
    throw HttpError.gone('invitation_expired', 'Срок приглашения истёк. Попросите новое.')
  }

  const company = db.select().from(companies).where(eq(companies.id, invitation.companyId)).get()

  return withImmediateTransaction((tx) => {
    const claimed = tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(and(eq(invitations.id, invitation.id), isNull(invitations.acceptedAt)))
      .run()

    if (claimed.changes === 0) {
      throw HttpError.conflict('invitation_used', 'Это приглашение уже использовано')
    }

    tx.insert(memberships)
      .values({
        id: crypto.randomUUID(),
        userId: params.userId,
        companyId: invitation.companyId,
        role: invitation.role,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [memberships.userId, memberships.companyId],
        set: { role: invitation.role, status: 'active' },
      })
      .run()

    tx.insert(auditLog)
      .values({
        id: crypto.randomUUID(),
        companyId: invitation.companyId,
        actorUserId: params.userId,
        action: 'team.joined',
        targetType: 'user',
        targetId: params.userId,
        metaJson: JSON.stringify({ email: invitation.email, role: invitation.role }),
        at: new Date(),
      })
      .run()

    if (!company) throw HttpError.notFound('Компания не найдена')

    return {
      companyId: invitation.companyId,
      companyName: company.name,
      role: invitation.role,
    }
  })
}


export function revokeInvitation(companyId: string, invitationId: string, actorUserId: string): void {
  const result = db
    .delete(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.companyId, companyId), isNull(invitations.acceptedAt)))
    .run()

  if (result.changes === 0) {
    throw HttpError.notFound('Приглашение не найдено')
  }

  recordAudit({
    companyId,
    actorUserId,
    action: 'team.invitation_revoked',
    targetType: 'invitation',
    targetId: invitationId,
  })
}

/**
 * Смена роли.
 *
 * Последнего владельца понизить или выгнать нельзя: компания без того, кто
 * может выдать права, превращается в сироту, которую уже не выкупить.
 */
export function changeRole(params: {
  companyId: string
  membershipId: string
  role: Role
  actorUserId: string
}): void {
  const membership = requireMembership(params.companyId, params.membershipId)

  if (membership.role === 'owner' && params.role !== 'owner') {
    assertNotLastOwner(params.companyId, params.membershipId)
  }

  db.update(memberships)
    .set({ role: params.role })
    .where(eq(memberships.id, params.membershipId))
    .run()

  recordAudit({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    action: 'team.role_changed',
    targetType: 'membership',
    targetId: params.membershipId,
    meta: { from: membership.role, to: params.role },
  })
}

function assertNotLastOwner(companyId: string, membershipId: string): void {
  const owners = db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.companyId, companyId), eq(memberships.role, 'owner'), eq(memberships.status, 'active')))
    .all()

  if (owners.length <= 1) {
    throw HttpError.conflict('last_owner', 'В компании должен остаться хотя бы один владелец')
  }

  if (!owners.some((owner) => owner.id === membershipId)) {
    throw HttpError.badRequest('invalid_target', 'Это не сотрудник компании')
  }
}

/** Удаление сотрудника из компании. Владельца — только через передачу прав. */
export function removeMember(params: {
  companyId: string
  membershipId: string
  actorUserId: string
}): void {
  const membership = requireMembership(params.companyId, params.membershipId)

  if (membership.role === 'owner') {
    throw HttpError.conflict('last_owner', 'Владельца нельзя удалить — сначала передайте права другому')
  }

  withImmediateTransaction((tx) => {
    tx.delete(membershipScopes).where(eq(membershipScopes.membershipId, params.membershipId)).run()
    tx.delete(memberships).where(eq(memberships.id, params.membershipId)).run()
  })

  recordAudit({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    action: 'team.member_removed',
    targetType: 'membership',
    targetId: params.membershipId,
  })
}

/** Приостановка доступа: сотрудник остаётся в истории, но не входит. */
export function suspendMember(params: {
  companyId: string
  membershipId: string
  actorUserId: string
}): void {
  const membership = requireMembership(params.companyId, params.membershipId)

  if (membership.role === 'owner') {
    throw HttpError.conflict('last_owner', 'Владельца нельзя приостановить')
  }

  db.update(memberships)
    .set({ status: 'suspended' })
    .where(eq(memberships.id, params.membershipId))
    .run()

  recordAudit({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    action: 'team.member_suspended',
    targetType: 'membership',
    targetId: params.membershipId,
  })
}

export function restoreMember(params: { companyId: string; membershipId: string; actorUserId: string }): void {
  requireMembership(params.companyId, params.membershipId)

  db.update(memberships).set({ status: 'active' }).where(eq(memberships.id, params.membershipId)).run()

  recordAudit({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    action: 'team.member_restored',
    targetType: 'membership',
    targetId: params.membershipId,
  })
}

/**
 * Область доступа сотрудника.
 *
 * Пустой список означает «без ограничений», а не «ни к чему»: владельцу не
 * нужно перечислять свои филиалы, чтобы получить к ним доступ.
 */
export function setScopes(params: {
  companyId: string
  membershipId: string
  scopes: ScopeRow[]
  actorUserId: string
}): void {
  const membership = requireMembership(params.companyId, params.membershipId)

  if (membership.role === 'owner' || membership.role === 'admin') {
    // Область для владельца бессмысленна: она всё равно обходится. Запрещаем,
    // иначе интерфейс молча покажет «доступ ограничен», а человек всё равно
    // увидит всю компанию.
    throw HttpError.badRequest('not_applicable', 'Для этой роли область доступа не задаётся')
  }

  withImmediateTransaction((tx) => {
    tx.delete(membershipScopes).where(eq(membershipScopes.membershipId, params.membershipId)).run()

    for (const scope of params.scopes) {
      // Область `company` сюда не попадает по типу: она означала бы «без
      // ограничений», а пустой список уже означает то же самое. Хранить оба
      // варианта значит хранить два способа выразить одно и то же.
      tx.insert(membershipScopes)
        .values({
          id: crypto.randomUUID(),
          membershipId: params.membershipId,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
        })
        .run()
    }
  })

  recordAudit({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    action: 'team.scopes_changed',
    targetType: 'membership',
    targetId: params.membershipId,
    meta: { count: params.scopes.length },
  })
}

/** Прямое добавление сотрудника: пользователь уже зарегистрирован. */
export function addMember(params: {
  companyId: string
  userId: string
  role: Role
  actorUserId: string
}): { membershipId: string } {
  const id = crypto.randomUUID()

  db.insert(memberships)
    .values({ id, userId: params.userId, companyId: params.companyId, role: params.role, status: 'active' })
    .onConflictDoUpdate({
      target: [memberships.userId, memberships.companyId],
      set: { role: params.role, status: 'active' },
    })
    .run()

  recordAudit({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    action: 'team.member_added',
    targetType: 'user',
    targetId: params.userId,
    meta: { role: params.role },
  })

  return { membershipId: id }
}

function requireMembership(companyId: string, membershipId: string) {
  const membership = db
    .select()
    .from(memberships)
    .where(and(eq(memberships.id, membershipId), eq(memberships.companyId, companyId)))
    .get()

  if (!membership) throw HttpError.notFound('Сотрудник не найден')
  return membership
}

/**
 * Сколько сотрудников заняло места по тарифу.
 *
 * Приостановленные не считаются: человек отпуск, и тариф за него платить
 * не нужно. Иначе сотрудника пришлось бы удалять, чтобы освободить место.
 */
export function countSeats(companyId: string): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(memberships)
    .where(and(eq(memberships.companyId, companyId), eq(memberships.status, 'active')))
    .get()

  return Number(row?.count ?? 0)
}

/** Проверка места: пригласить сверх тарифа нельзя. */
export function assertSeatAvailable(companyId: string, limit: number): void {
  if (countSeats(companyId) >= limit) {
    throw HttpError.conflict(
      'seats_limit_reached',
      `На тарифе занято ${limit} ${limit === 1 ? 'место' : 'мест'}. Уберите кого-то или смените тариф.`,
    )
  }
}

/** Записи в журнале по сотрудникам: активность за 30 дней. */
export function recentAuditByUser(companyId: string) {
  return db
    .select({ actorUserId: auditLog.actorUserId, lastActionAt: sql<Date>`max(${auditLog.at})` })
    .from(auditLog)
    .where(and(eq(auditLog.companyId, companyId), gte(auditLog.at, new Date(Date.now() - 30 * 24 * 60 * 60_000))))
    .groupBy(auditLog.actorUserId)
    .all()
}

/** Приглашения, срок которых истёк: чистятся фоновой уборкой. */
export function expiredInvitationCount(companyId: string): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(invitations)
    .where(and(eq(invitations.companyId, companyId), isNull(invitations.acceptedAt), lt(invitations.expiresAt, new Date())))
    .get()

  return Number(row?.count ?? 0)
}

export { ROLE_LABELS }