import type { AuditRow } from './model'

/**
 * Как выглядит действие в журнале.
 *
 * Подпись собирается из метаданных, а не из сырого идентификатора: «Экран
 * отвязан» без имени экрана бесполезны для того, кто разбирает инцидент.
 */
export function describeAuditRow(row: AuditRow): string {
  const meta = row.meta ?? {}
  const name = typeof meta.name === 'string' ? meta.name : null

  if (row.action === 'release.published' && typeof meta.version === 'number') {
    return `версия ${meta.version} для ${meta.screens ?? '?'} экранов`
  }

  if (row.action.startsWith('campaign.') && typeof meta.from === 'string') {
    return `${meta.from} → ${meta.to}`
  }

  if (row.action.startsWith('campaign.') && typeof meta.status === 'string') {
    return `состояние: ${meta.status}`
  }

  if (row.action === 'assignment.changed') {
    return `${row.targetType} · ${String(meta.screens ?? '?')} экранов`
  }

  return name ?? row.targetId ?? '—'
}

/** Время записи без года: журнал смотрят за дни и недели, год только мешает. */
export function formatAuditTime(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
