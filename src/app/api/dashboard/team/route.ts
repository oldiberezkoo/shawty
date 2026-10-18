import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { ROLE_LABELS, ROLE_PERMISSIONS, PERMISSIONS } from '@/domain/authz/permissions'
import { route, jsonResponse, readJsonBody } from '@/server/http/request'
import { requireDashboardMutation, requireDashboardRequest, requirePermission } from '@/server/http/dashboard-request'
import {
  addMember,
  changeRole,
  createInvitation,
  listInvitations,
  listMembers,
  removeMember,
  restoreMember,
  revokeInvitation,
  setScopes,
  suspendMember,
} from '@/server/services/team-service'
import { assertSeatAvailable } from '@/server/services/billing-service'
import { HttpError } from '@/server/http/errors'

const roleSchema = z.enum(['owner', 'admin', 'editor', 'analyst', 'viewer'])

const scopeSchema = z.object({
  scopeType: z.enum(['screen', 'group', 'branch', 'company']),
  scopeId: z.string().min(1).max(64),
})

const inviteSchema = z.object({
  email: z.string().min(3).max(200),
  role: roleSchema,
})

/**
 * Команда компании.
 *
 * Список отдаётся вместе с расшифровкой прав каждой роли: администратор,
 * выдающий доступ, должен видеть, что именно получит человек, иначе роль
 * «analyst» остаётся словом из документации.
 */
export const GET = route(async (request: Request) => {
  const { companyId, access } = await requireDashboardRequest(request)
  requirePermission(access, PERMISSIONS.teamRead, 'Нет доступа к команде')

  const members = listMembers(companyId)
  const url = new URL(request.url)

  return jsonResponse({
    members: members.map((member) => ({
      membershipId: member.membershipId,
      userId: member.userId,
      name: member.name,
      email: member.email,
      role: member.role,
      roleLabel: ROLE_LABELS[member.role],
      status: member.status,
      scopes: member.scopes,
    })),
    invitations: listInvitations(companyId),
    // Матрица прав отдаётся как данные, а не выводится в разметке: интерфейс
    // показывает её в подсказке роли, и она обязана совпадать с серверной.
    roles: Object.entries(ROLE_LABELS).map(([role, label]) => ({
      role,
      label,
      permissions: ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS] ?? [],
    })),
    canInvite: access.can(PERMISSIONS.teamWrite),
  })
})

/** Приглашение сотрудника. */
export const POST = route(async (request: Request) => {
  const { companyId, access, session } = await requireDashboardMutation(request)
  requirePermission(access, PERMISSIONS.teamWrite, 'Нет прав на приглашение сотрудников')

  // Места по тарифу проверяются здесь, до создания приглашения: приглашение,
  // на которое нельзя ответить, — это способ занять место в интерфейсе.
  assertSeatAvailable(companyId)

  const body = inviteSchema.safeParse(await readJsonBody(request))

  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Проверьте адрес почты и роль')
  }

  const result = createInvitation({
    companyId,
    actorUserId: session.userId,
    email: body.data.email,
    role: body.data.role,
  })

  return jsonResponse(result, { status: result.alreadyMember ? 200 : 201 })
})

/** Действия над сотрудником: роль, приостановка, удаление. */
export const PATCH = route(async (request: Request) => {
  const { companyId, access, session } = await requireDashboardMutation(request)
  requirePermission(access, PERMISSIONS.teamWrite, 'Нет прав на изменение команды')

  const body = (await readJsonBody(request)) as {
    membershipId?: string
    action?: string
    role?: string
    scopes?: { scopeType: 'screen' | 'group' | 'branch' | 'company'; scopeId: string }[]
    userId?: string
  } | null

  if (!body?.membershipId) {
    throw HttpError.badRequest('invalid_input', 'Не указан сотрудник')
  }

  switch (body.action) {
    case 'role': {
      const role = roleSchema.safeParse(body.role)
      if (!role.success) throw HttpError.badRequest('invalid_input', 'Неизвестная роль')

      // Выдача прав владельца — только владельцу. Иначе администратор
      // повысил бы себя или коллегу и обошёл бы разделение ролей.
      if (role.data === 'owner' && !access.can(PERMISSIONS.companyTransfer)) {
        throw HttpError.forbidden('Передача прав владельца доступна только владельцу компании')
      }

      changeRole({ companyId, membershipId: body.membershipId, role: role.data, actorUserId: session.userId })
      break
    }

    case 'suspend':
      suspendMember({ companyId, membershipId: body.membershipId, actorUserId: session.userId })
      break

    case 'restore':
      restoreMember({ companyId, membershipId: body.membershipId, actorUserId: session.userId })
      break

    case 'remove':
      removeMember({ companyId, membershipId: body.membershipId, actorUserId: session.userId })
      break

    case 'scopes': {
      const scopes = z.array(scopeSchema).max(200).safeParse(body.scopes ?? [])
      if (!scopes.success) throw HttpError.badRequest('invalid_input', 'Некорректная область доступа')

      // `company` в области не хранится: он означал бы «без ограничений», а
      // пустой список уже означает то же самое. Отбрасываем на границе,
      // чтобы сервис принимал только то, что умеет хранить.
      setScopes({
        companyId,
        membershipId: body.membershipId,
        scopes: scopes.data.filter((scope) => scope.scopeType !== 'company'),
        actorUserId: session.userId,
      })
      break
    }

    case 'add_existing': {
      if (!body.userId) throw HttpError.badRequest('invalid_input', 'Не указан пользователь')

      const role = roleSchema.safeParse(body.role)
      if (!role.success) throw HttpError.badRequest('invalid_input', 'Неизвестная роль')

      const target = db.select().from(users).where(eq(users.id, body.userId)).get()
      if (!target) throw HttpError.notFound('Пользователь не найден')

      addMember({ companyId, userId: target.id, role: role.data, actorUserId: session.userId })
      break
    }

    default:
      throw HttpError.badRequest('invalid_input', 'Неизвестное действие с сотрудником')
  }

  return jsonResponse({ ok: true, members: listMembers(companyId).length })
})

/** Отзыв приглашения. */
export const DELETE = route(async (request: Request) => {
  const { companyId, access, session } = await requireDashboardMutation(request)
  requirePermission(access, PERMISSIONS.teamWrite, 'Нет прав на приглашение сотрудников')

  const invitationId = new URL(request.url).searchParams.get('invitationId')

  if (!invitationId) throw HttpError.badRequest('invalid_input', 'Не указано приглашение')

  revokeInvitation(companyId, invitationId, session.userId)

  return jsonResponse({ ok: true })
})
