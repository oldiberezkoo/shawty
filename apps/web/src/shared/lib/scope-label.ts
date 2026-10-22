/** Минимум, который нужен для подписи области: идентификатор и имя. */
export type ScopeOption = { id: string; name: string }

export type ScopeLookups = {
  branches: ScopeOption[]
  groups: ScopeOption[]
  screens: ScopeOption[]
}

/**
 * Человеческая подпись области действия.
 *
 * Удалённая область остаётся в назначении, но её имени уже нет: подпись
 * честно говорит «удалён», а не подставляет пустую строку или идентификатор.
 */
export function describeScope(
  scope: { scopeType: string; scopeId: string },
  lookups: ScopeLookups,
): string {
  switch (scope.scopeType) {
    case 'branch':
      return `филиал «${lookups.branches.find((item) => item.id === scope.scopeId)?.name ?? 'удалён'}»`
    case 'group':
      return `группа «${lookups.groups.find((item) => item.id === scope.scopeId)?.name ?? 'удалена'}»`
    case 'screen':
      return `экран «${lookups.screens.find((item) => item.id === scope.scopeId)?.name ?? 'удалён'}»`
    default:
      return 'вся компания'
  }
}
