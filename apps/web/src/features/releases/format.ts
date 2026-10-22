import type { AssignmentView, ScopeOption } from './model'

/** Понятная подпись состояния чека вместо английского слова из базы. */
export const STATE_LABEL: Record<string, string> = {
  queued: 'в очереди',
  sent: 'отправлено, ждёт подтверждения',
  downloading: 'загружает',
  applied: 'применил',
  failed: 'отказ',
  stale: 'устарело',
}

/** Цвет состояния: «применил» — единственное, что выглядит как результат. */
export const STATE_TONE: Record<string, string> = {
  applied: 'text-success',
  failed: 'text-danger',
  downloading: 'text-info',
  queued: 'text-text-muted',
  sent: 'text-text-muted',
  stale: 'text-warn',
}

export function scopeName(
  assignment: AssignmentView,
  options: { branches: ScopeOption[]; groups: ScopeOption[] },
): string {
  if (assignment.scopeType === 'company') return 'Вся компания'
  const list = assignment.scopeType === 'branch' ? options.branches : options.groups
  return list.find((option) => option.id === assignment.scopeId)?.name ?? assignment.scopeId
}
