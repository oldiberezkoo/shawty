/**
 * Области работы, а не список прав.
 *
 * «И ещё 12» ничего не объясняет: администратору нужно понять, что человек
 * меняет в компании, а не выучить двадцать строк `screens:*`. Области
 * показывают ровно это, а полный набор прав при необходимости виден в подсказке.
 */
const ROLE_AREAS: { label: string; hint: string; permissions: readonly string[] }[] = [
  {
    label: 'Экраны',
    hint: 'привязка телевизоров, филиалы и группы',
    permissions: ['screens:pair', 'screens:unpair', 'screens:rotate', 'screens:disable', 'branches:write', 'groups:write'],
  },
  {
    label: 'Контент',
    hint: 'загрузка файлов, плейлисты и версии',
    permissions: ['media:write', 'media:delete', 'playlists:write', 'playlists:publish'],
  },
  {
    label: 'Показ',
    hint: 'кампании и публикация на экраны',
    permissions: ['campaigns:write', 'campaigns:approve', 'releases:publish'],
  },
  {
    label: 'Команда',
    hint: 'сотрудники, настройки компании и оплата',
    permissions: ['team:write', 'settings:write', 'billing:write', 'companyTransfer'],
  },
]

export function roleAreas(permissions: readonly string[]): string[] {
  const areas = ROLE_AREAS.filter((area) => area.permissions.some((permission) => permissions.includes(permission)))

  if (areas.length > 0) return areas.map((area) => area.label)

  return permissions.includes('audit:read') || permissions.includes('analytics:read')
    ? ['Просмотр и отчёты']
    : ['Только просмотр']
}

export function areaHint(label: string): string | undefined {
  return ROLE_AREAS.find((area) => area.label === label)?.hint
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}
