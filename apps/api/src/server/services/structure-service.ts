/**
 * Структура сети: филиалы и группы экранов.
 *
 * Филиал и группа уже существовали в базе и в правилах показа, но создать их
 * из панели было нельзя: они появлялись только вместе с привязкой телевизора.
 * Здесь — единственное место, где структура меняется, поэтому и проверки
 * («не удалить то, на что ссылается расписание») живут здесь, а не в маршрутах.
 */
import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { branches, campaignTargets, membershipScopes, releaseAssignments, screenGroups, screens } from '@/db/schema'
import { isValidTimezone } from '@/domain/schedule/timezone'
import { HttpError } from '@/server/http/errors'
import { recordAudit } from '@/server/services/audit-service'

export type BranchView = {
  id: string
  name: string
  code: string | null
  timezone: string | null
  screens: number
}

export type GroupView = {
  id: string
  name: string
  branchId: string | null
  branchName: string | null
  screens: number
}

export function requireBranch(companyId: string, branchId: string) {
  const branch = db
    .select()
    .from(branches)
    .where(and(eq(branches.id, branchId), eq(branches.companyId, companyId)))
    .get()

  if (!branch) throw HttpError.notFound('Филиал не найден')
  return branch
}

export function requireGroup(companyId: string, groupId: string) {
  const group = db
    .select()
    .from(screenGroups)
    .where(and(eq(screenGroups.id, groupId), eq(screenGroups.companyId, companyId)))
    .get()

  if (!group) throw HttpError.notFound('Группа экранов не найдена')
  return group
}

/** Филиалы вместе с числом экранов: пустой филиал видно сразу. */
export function listBranchViews(companyId: string): BranchView[] {
  const counts = screenCounts(companyId, 'branch')

  return db
    .select()
    .from(branches)
    .where(eq(branches.companyId, companyId))
    .orderBy(asc(branches.name))
    .all()
    .map((branch) => ({
      id: branch.id,
      name: branch.name,
      code: branch.code,
      timezone: branch.timezone,
      screens: counts.get(branch.id) ?? 0,
    }))
}

export function listGroupViews(companyId: string): GroupView[] {
  const counts = screenCounts(companyId, 'group')

  return db
    .select({
      id: screenGroups.id,
      name: screenGroups.name,
      branchId: screenGroups.branchId,
      branchName: branches.name,
    })
    .from(screenGroups)
    .leftJoin(branches, eq(branches.id, screenGroups.branchId))
    .where(eq(screenGroups.companyId, companyId))
    .orderBy(asc(screenGroups.name))
    .all()
    .map((group) => ({
      id: group.id,
      name: group.name,
      branchId: group.branchId,
      branchName: group.branchName,
      screens: counts.get(group.id) ?? 0,
    }))
}

function screenCounts(companyId: string, key: 'branch' | 'group'): Map<string, number> {
  const column = key === 'branch' ? screens.branchId : screens.groupId

  const rows = db
    .select({ id: column, count: sql<number>`count(*)` })
    .from(screens)
    .where(eq(screens.companyId, companyId))
    .groupBy(column)
    .all()

  const map = new Map<string, number>()
  for (const row of rows) {
    if (row.id) map.set(row.id, Number(row.count))
  }
  return map
}

export function createBranch(params: {
  companyId: string
  actorUserId?: string
  name: string
  code?: string | null
  timezone?: string | null
}): { id: string } {
  const name = params.name.trim().slice(0, 120)
  if (name.length === 0) throw HttpError.badRequest('invalid_input', 'Укажите название филиала')

  const timezone = normalizeTimezone(params.timezone)

  const id = crypto.randomUUID()

  db.insert(branches)
    .values({
      id,
      companyId: params.companyId,
      name,
      code: params.code?.trim().slice(0, 32) || null,
      timezone,
    })
    .run()

  recordAudit({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    action: 'branch.created',
    targetType: 'branch',
    targetId: id,
    meta: { name },
  })

  return { id }
}

export function updateBranch(params: {
  companyId: string
  actorUserId?: string
  branchId: string
  name?: string
  code?: string | null
  timezone?: string | null
}): void {
  const branch = requireBranch(params.companyId, params.branchId)
  const update: Partial<typeof branches.$inferInsert> = {}

  if (params.name !== undefined) {
    const name = params.name.trim().slice(0, 120)
    if (name.length === 0) throw HttpError.badRequest('invalid_input', 'Укажите название филиала')
    update.name = name
  }

  if (params.code !== undefined) update.code = params.code?.trim().slice(0, 32) || null
  if (params.timezone !== undefined) update.timezone = normalizeTimezone(params.timezone)

  db.update(branches).set(update).where(eq(branches.id, branch.id)).run()

  recordAudit({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    action: 'branch.updated',
    targetType: 'branch',
    targetId: branch.id,
    meta: { name: update.name ?? branch.name },
  })
}

/**
 * Часовой пояс филиала.
 *
 * Пустое значение допустимо и означает «зона компании»: филиал не обязан
 * знать свою зону, если она совпадает с общей.
 */
function normalizeTimezone(value: string | null | undefined): string | null {
  const timezone = value?.trim() || null
  if (!timezone) return null

  if (!isValidTimezone(timezone)) {
    throw HttpError.badRequest('invalid_timezone', 'Неизвестный часовой пояс')
  }

  return timezone
}

export function deleteBranch(params: { companyId: string; actorUserId?: string; branchId: string }): void {
  const branch = requireBranch(params.companyId, params.branchId)

  // Расписание ссылается на филиал как на область показа. Удалить филиал и
  // оставить назначение «на филиал» — значит получить правило, которое ни на
  // что не влияет и которое невозможно найти через интерфейс.
  assertScopeFree(params.companyId, 'branch', branch.id, 'филиал')

  db.transaction((tx) => {
    // Экраны филиала не удаляются вместе с ним: они остаются в сети без
    // филиала — это меньшее зло, чем молчаливая потеря экранов.
    tx.update(screens).set({ branchId: null, updatedAt: new Date() }).where(eq(screens.branchId, branch.id)).run()
    tx.update(screenGroups).set({ branchId: null }).where(eq(screenGroups.branchId, branch.id)).run()
    tx.delete(membershipScopes)
      .where(and(eq(membershipScopes.scopeType, 'branch'), eq(membershipScopes.scopeId, branch.id)))
      .run()
    tx.delete(branches).where(eq(branches.id, branch.id)).run()
  })

  recordAudit({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    action: 'branch.deleted',
    targetType: 'branch',
    targetId: branch.id,
    meta: { name: branch.name },
  })
}

export function createGroup(params: {
  companyId: string
  actorUserId?: string
  name: string
  branchId?: string | null
}): { id: string } {
  const name = params.name.trim().slice(0, 120)
  if (name.length === 0) throw HttpError.badRequest('invalid_input', 'Укажите название группы')

  if (params.branchId) requireBranch(params.companyId, params.branchId)

  const id = crypto.randomUUID()

  db.insert(screenGroups)
    .values({ id, companyId: params.companyId, name, branchId: params.branchId ?? null })
    .run()

  recordAudit({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    action: 'group.created',
    targetType: 'group',
    targetId: id,
    meta: { name },
  })

  return { id }
}

export function updateGroup(params: {
  companyId: string
  actorUserId?: string
  groupId: string
  name?: string
  branchId?: string | null
}): void {
  const group = requireGroup(params.companyId, params.groupId)
  const update: Partial<typeof screenGroups.$inferInsert> = {}

  if (params.name !== undefined) {
    const name = params.name.trim().slice(0, 120)
    if (name.length === 0) throw HttpError.badRequest('invalid_input', 'Укажите название группы')
    update.name = name
  }

  if (params.branchId !== undefined) {
    if (params.branchId) requireBranch(params.companyId, params.branchId)
    update.branchId = params.branchId
  }

  db.update(screenGroups).set(update).where(eq(screenGroups.id, group.id)).run()

  recordAudit({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    action: 'group.updated',
    targetType: 'group',
    targetId: group.id,
    meta: { name: update.name ?? group.name },
  })
}

export function deleteGroup(params: { companyId: string; actorUserId?: string; groupId: string }): void {
  const group = requireGroup(params.companyId, params.groupId)

  assertScopeFree(params.companyId, 'group', group.id, 'группу')

  db.transaction((tx) => {
    tx.update(screens).set({ groupId: null, updatedAt: new Date() }).where(eq(screens.groupId, group.id)).run()
    tx.delete(membershipScopes)
      .where(and(eq(membershipScopes.scopeType, 'group'), eq(membershipScopes.scopeId, group.id)))
      .run()
    tx.delete(screenGroups).where(eq(screenGroups.id, group.id)).run()
  })

  recordAudit({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    action: 'group.deleted',
    targetType: 'group',
    targetId: group.id,
    meta: { name: group.name },
  })
}

/**
 * Нельзя удалить область, которая участвует в показе.
 *
 * Молча удалить назначение вместе с филиалом было бы «удобно» и опасно:
 * экраны разом потеряли бы программу, и никто не связал бы это с удалением.
 */
function assertScopeFree(companyId: string, scopeType: 'branch' | 'group', scopeId: string, label: string): void {
  const assignment = db
    .select({ id: releaseAssignments.id })
    .from(releaseAssignments)
    .where(
      and(
        eq(releaseAssignments.companyId, companyId),
        eq(releaseAssignments.scopeType, scopeType),
        eq(releaseAssignments.scopeId, scopeId),
      ),
    )
    .get()

  if (assignment) {
    throw HttpError.conflict(
      'scope_in_use',
      `На ${label} назначен плейлист. Сначала снимите назначение в разделе «Расписание».`,
    )
  }

  const campaign = db
    .select({ id: campaignTargets.id })
    .from(campaignTargets)
    .where(and(eq(campaignTargets.scopeType, scopeType), eq(campaignTargets.scopeId, scopeId)))
    .get()

  if (campaign) {
    throw HttpError.conflict(
      'scope_in_use',
      `На ${label} ссылается кампания. Сначала измените её области показа.`,
    )
  }
}
