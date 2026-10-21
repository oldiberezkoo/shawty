import type { MembershipContext, Role, ScopeRow, ScopeType } from './types'

/**
 * Права не привязаны к названиям ролей: роль раскладывается в набор прав,
 * а проверка идёт по правам. Добавление новой роли не меняет код проверки.
 */
export const PERMISSIONS = {
  // Парк устройств
  screensRead: 'screens:read',
  screensWrite: 'screens:write',
  /** Привязка нового телевизора. Отдельное право: подтверждает привязку только владелец филиала. */
  screensPair: 'screens:pair',
  screensDisable: 'screens:disable',
  screensUnpair: 'screens:unpair',
  screensRotate: 'screens:rotate',

  // Структура компании
  branchesRead: 'branches:read',
  branchesWrite: 'branches:write',
  groupsRead: 'groups:read',
  groupsWrite: 'groups:write',

  // Контент
  mediaRead: 'media:read',
  mediaWrite: 'media:write',
  mediaDelete: 'media:delete',
  playlistsRead: 'playlists:read',
  playlistsWrite: 'playlists:write',
  playlistsPublish: 'playlists:publish',

  // Кампании и публикация
  campaignsRead: 'campaigns:read',
  campaignsWrite: 'campaigns:write',
  campaignsApprove: 'campaigns:approve',
  /** Публикация на экраны — право, отделённое от редактирования. */
  releasesPublish: 'releases:publish',

  // Аналитика и наблюдение
  analyticsRead: 'analytics:read',
  monitoringRead: 'monitoring:read',
  auditRead: 'audit:read',

  // Управление компанией
  teamRead: 'team:read',
  teamWrite: 'team:write',
  settingsWrite: 'settings:write',
  billingRead: 'billing:read',
  /** Только владелец: смена тарифа и передача компании. */
  billingWrite: 'billing:write',
  companyTransfer: 'company:transfer',
  apiTokensWrite: 'api_tokens:write',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

const READ_ONLY_CONTENT: readonly Permission[] = [
  PERMISSIONS.screensRead,
  PERMISSIONS.branchesRead,
  PERMISSIONS.groupsRead,
  PERMISSIONS.mediaRead,
  PERMISSIONS.playlistsRead,
  PERMISSIONS.campaignsRead,
  PERMISSIONS.monitoringRead,
  PERMISSIONS.analyticsRead,
]

const ADMIN_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.screensRead,
  PERMISSIONS.screensWrite,
  PERMISSIONS.screensPair,
  PERMISSIONS.screensDisable,
  PERMISSIONS.screensUnpair,
  PERMISSIONS.screensRotate,
  PERMISSIONS.branchesRead,
  PERMISSIONS.branchesWrite,
  PERMISSIONS.groupsRead,
  PERMISSIONS.groupsWrite,
  PERMISSIONS.mediaRead,
  PERMISSIONS.mediaWrite,
  PERMISSIONS.mediaDelete,
  PERMISSIONS.playlistsRead,
  PERMISSIONS.playlistsWrite,
  PERMISSIONS.playlistsPublish,
  PERMISSIONS.campaignsRead,
  PERMISSIONS.campaignsWrite,
  PERMISSIONS.campaignsApprove,
  PERMISSIONS.releasesPublish,
  PERMISSIONS.monitoringRead,
  PERMISSIONS.analyticsRead,
  PERMISSIONS.auditRead,
  PERMISSIONS.teamRead,
  PERMISSIONS.teamWrite,
  PERMISSIONS.settingsWrite,
  PERMISSIONS.billingRead,
  PERMISSIONS.apiTokensWrite,
]

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  viewer: READ_ONLY_CONTENT,

  analyst: [...READ_ONLY_CONTENT, PERMISSIONS.auditRead],

  editor: [
    PERMISSIONS.screensRead,
    PERMISSIONS.branchesRead,
    PERMISSIONS.groupsRead,
    PERMISSIONS.mediaRead,
    PERMISSIONS.mediaWrite,
    PERMISSIONS.mediaDelete,
    PERMISSIONS.playlistsRead,
    PERMISSIONS.playlistsWrite,
    PERMISSIONS.playlistsPublish,
    PERMISSIONS.campaignsRead,
    PERMISSIONS.campaignsWrite,
  ],

  admin: ADMIN_PERMISSIONS,

  // Владелец: всё, что у администратора, плюс финансовые права.
  owner: [...ADMIN_PERMISSIONS, PERMISSIONS.billingWrite, PERMISSIONS.companyTransfer],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

/**
 * Область доступа сотрудника. Пустой список скоупов означает «без ограничений»:
 * так владелец компании не должен перечислять свои филиалы, чтобы получить к ним доступ.
 */

/** Идентичность ресурса, по которому проверяется область доступа. */
export type ResourceScope = {
  screenId?: string | null
  groupId?: string | null
  branchId?: string | null
}

export function hasScopeAccess(scopes: readonly ScopeRow[], resource: ResourceScope): boolean {
  if (scopes.length === 0) return true

  return scopes.some((scope) => {
    switch (scope.scopeType) {
      case 'screen':
        return resource.screenId != null && scope.scopeId === resource.screenId
      case 'group':
        return resource.groupId != null && scope.scopeId === resource.groupId
      case 'branch':
        return resource.branchId != null && scope.scopeId === resource.branchId
    }
  })
}

export type Access = {
  role: Role
  scopes: readonly ScopeRow[]
  /** Проверка права без учёта области. */
  can: (permission: Permission) => boolean
  /** Проверка права с учётом области доступа. */
  canAccess: (permission: Permission, resource: ResourceScope) => boolean
}

export function createAccess(role: Role, scopes: readonly ScopeRow[] = []): Access {
  return {
    role,
    scopes,
    can: (permission) => hasPermission(role, permission),
    canAccess: (permission, resource) =>
      hasPermission(role, permission) && hasScopeAccess(scopes, resource),
  }
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  editor: 'Редактор',
  analyst: 'Аналитик',
  viewer: 'Наблюдатель',
}

/** Роли, которые могут подтвердить привязку телевизора. */
export const PAIRING_ROLES: readonly Role[] = ['owner', 'admin']

export function isScopeType(value: string): value is ScopeType {
  return value === 'screen' || value === 'group' || value === 'branch' || value === 'company'
}

/** Права участника в конкретной компании. */
export function accessFor(
  session: { companies: readonly Pick<MembershipContext, 'companyId' | 'role' | 'scopes'>[] },
  companyId: string,
): Access {
  const membership = session.companies.find((item) => item.companyId === companyId)
  if (!membership) throw new Error('membership not found')
  return createAccess(membership.role, membership.scopes)
}
