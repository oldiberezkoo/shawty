import { z } from 'zod'
import { route, jsonResponse, readJsonBody } from '@/server/http/request'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { requireDashboardMutation, requireDashboardRequest, requirePermission } from '@/server/http/dashboard-request'
import {
  createBranch,
  createGroup,
  deleteBranch,
  deleteGroup,
  listBranchViews,
  listGroupViews,
  updateBranch,
  updateGroup,
} from '@/server/services/structure-service'
import { HttpError } from '@/server/http/errors'

/**
 * Структура сети: филиалы и группы.
 *
 * Один маршрут на две сущности: они меняются на одной странице и одним
 * действием оператора («создал филиал — завёл в нём группу»), а разделять их
 * по маршрутам значило бы дважды описывать одну проверку прав.
 */
const createSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('branch'),
    name: z.string().min(1).max(120),
    code: z.string().max(32).nullable().optional(),
    timezone: z.string().max(64).nullable().optional(),
  }),
  z.object({
    kind: z.literal('group'),
    name: z.string().min(1).max(120),
    branchId: z.string().max(64).nullable().optional(),
  }),
])

const patchSchema = z.object({
  kind: z.enum(['branch', 'group']),
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120).optional(),
  code: z.string().max(32).nullable().optional(),
  timezone: z.string().max(64).nullable().optional(),
  branchId: z.string().max(64).nullable().optional(),
})

export const GET = route(async (request: Request) => {
  const { companyId, access } = await requireDashboardRequest(request)
  requirePermission(access, PERMISSIONS.screensRead, 'Нет доступа к структуре сети')

  return jsonResponse({
    branches: listBranchViews(companyId),
    groups: listGroupViews(companyId),
  })
})

export const POST = route(async (request: Request) => {
  const { companyId, access, session } = await requireDashboardMutation(request)
  const body = createSchema.safeParse(await readJsonBody(request))

  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Проверьте название и принадлежность')
  }

  if (body.data.kind === 'branch') {
    requirePermission(access, PERMISSIONS.branchesWrite, 'Нет прав на изменение филиалов')
    return jsonResponse(
      createBranch({
        companyId,
        actorUserId: session.userId,
        name: body.data.name,
        code: body.data.code ?? null,
        timezone: body.data.timezone ?? null,
      }),
      { status: 201 },
    )
  }

  requirePermission(access, PERMISSIONS.groupsWrite, 'Нет прав на изменение групп')
  return jsonResponse(
    createGroup({
      companyId,
      actorUserId: session.userId,
      name: body.data.name,
      branchId: body.data.branchId ?? null,
    }),
    { status: 201 },
  )
})

export const PATCH = route(async (request: Request) => {
  const { companyId, access, session } = await requireDashboardMutation(request)
  const body = patchSchema.safeParse(await readJsonBody(request))

  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Проверьте параметры изменения')
  }

  if (body.data.kind === 'branch') {
    requirePermission(access, PERMISSIONS.branchesWrite, 'Нет прав на изменение филиалов')
    updateBranch({
      companyId,
      actorUserId: session.userId,
      branchId: body.data.id,
      name: body.data.name,
      code: body.data.code,
      timezone: body.data.timezone,
    })
  } else {
    requirePermission(access, PERMISSIONS.groupsWrite, 'Нет прав на изменение групп')
    updateGroup({
      companyId,
      actorUserId: session.userId,
      groupId: body.data.id,
      name: body.data.name,
      branchId: body.data.branchId,
    })
  }

  return jsonResponse({
    branches: listBranchViews(companyId),
    groups: listGroupViews(companyId),
  })
})

export const DELETE = route(async (request: Request) => {
  const { companyId, access, session } = await requireDashboardMutation(request)
  const url = new URL(request.url)
  const kind = url.searchParams.get('kind')
  const id = url.searchParams.get('id')

  if ((kind !== 'branch' && kind !== 'group') || !id) {
    throw HttpError.badRequest('invalid_input', 'Не указан объект удаления')
  }

  if (kind === 'branch') {
    requirePermission(access, PERMISSIONS.branchesWrite, 'Нет прав на изменение филиалов')
    deleteBranch({ companyId, actorUserId: session.userId, branchId: id })
  } else {
    requirePermission(access, PERMISSIONS.groupsWrite, 'Нет прав на изменение групп')
    deleteGroup({ companyId, actorUserId: session.userId, groupId: id })
  }

  return jsonResponse({
    branches: listBranchViews(companyId),
    groups: listGroupViews(companyId),
  })
})
