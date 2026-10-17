import type { ReactNode } from 'react'

/**
 * Статус экрана. Формы подписи здесь намеренно скромные: «онлайн»,
 * «нет связи», «нужна привязка» — без придуманных терминов вроде «активен»,
 * которые ничего не значат.
 */
export type ScreenState = 'online' | 'syncing' | 'offline' | 'error' | 'unpaired' | 'disabled' | 'revoked'

const STYLES: Record<ScreenState, { label: string; className: string }> = {
  online: { label: 'Онлайн', className: 'text-success bg-success-bg' },
  syncing: { label: 'Синхронизирует', className: 'text-info bg-info-bg' },
  offline: { label: 'Нет связи', className: 'text-warn bg-warn-bg' },
  error: { label: 'Ошибка', className: 'text-danger bg-danger-bg' },
  unpaired: { label: 'Ждёт привязки', className: 'text-warn bg-warn-bg' },
  disabled: { label: 'Отключён', className: 'text-text-muted bg-surface-3' },
  revoked: { label: 'Отвязан', className: 'text-text-subtle bg-surface-3' },
}

export function StatusBadge({
  state,
  label,
  children,
}: {
  state: ScreenState
  label?: string
  children?: ReactNode
}) {
  const style = STYLES[state]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium ${style.className}`}
    >
      {children}
      {label ?? style.label}
    </span>
  )
}

export function Dot({ state }: { state: ScreenState }) {
  const color: Record<ScreenState, string> = {
    online: 'bg-success',
    syncing: 'bg-info',
    offline: 'bg-warn',
    error: 'bg-danger',
    unpaired: 'bg-warn',
    disabled: 'bg-text-subtle',
    revoked: 'bg-text-subtle',
  }
  return <span className={`inline-block size-1.5 shrink-0 rounded-full ${color[state]}`} />
}
