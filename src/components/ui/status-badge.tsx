import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'

/**
 * Статус и метка.
 *
 * Подписи скромные и конкретные: «онлайн», «нет связи», «ждёт привязки».
 * Придуманные вроде «активен» ничего не значат и ставят человека в тупик при
 * разборе инцидента.
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
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap ${style.className}`}
    >
      {children ?? <span className="size-1.5 rounded-full bg-current opacity-70" />}
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

/**
 * Тон метки.
 *
 * Отдельные состояния вместо одного «важного»: «отказ» и «загрузка» в одном
 * красном плашке означают для оператора одно и то же, хотя чинить их нужно
 * по-разному.
 */
export type Tone = 'neutral' | 'success' | 'warn' | 'danger' | 'info'

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-text-muted',
  success: 'bg-success-bg text-success',
  warn: 'bg-warn-bg text-warn',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap ${TONE_CLASS[tone]}`}>
      {children}
    </span>
  )
}

/**
 * Заметка о состоянии.
 *
 * Единый вид для предупреждений на всех экранах: цвет и значок слева означают
 * тон, текст говорит о факте, действие — о том, что делать. Значок обязателен:
 * без него «нет связи» и «всё хорошо» отличаются только оттенком, а его
 * замечают не все.
 */
export function Notice({
  tone = 'info',
  title,
  children,
  action,
  onDismiss,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'success'
  title?: string
  children: ReactNode
  action?: ReactNode
  /**
   * Закрытие.
   *
   * Обязательное для сообщений, которые сообщают факт и не требуют действия:
   * закрытый факт уже прочитан, а незакрытое уведомление о дубликате так и
   * будет висеть над следующей загрузкой.
   */
  onDismiss?: () => void
}) {
  const border: Record<string, string> = {
    info: 'border-info-border bg-info-bg',
    warn: 'border-warn-border bg-warn-bg',
    danger: 'border-danger-border bg-danger-bg',
    success: 'border-success-border bg-success-bg',
  }

  const text: Record<string, string> = {
    info: 'text-info',
    warn: 'text-warn',
    danger: 'text-danger',
    success: 'text-success',
  }

  const Icon = tone === 'success' ? CircleCheck : tone === 'danger' ? CircleAlert : tone === 'warn' ? TriangleAlert : Info

  return (
    <div className={`flex items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3 ${border[tone]}`}>
      <Icon className={`mt-px size-4 shrink-0 ${text[tone]}`} strokeWidth={1.9} />

      <div className="min-w-0 flex-1">
        {title ? <div className={`text-[12.5px] font-semibold ${text[tone]}`}>{title}</div> : null}
        <div className={`text-[12.5px] leading-relaxed ${title ? 'mt-0.5 opacity-90' : ''}`}>{children}</div>
      </div>

      {action ? <div className="shrink-0">{action}</div> : null}

      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Скрыть сообщение"
          className="-my-0.5 -mr-1 shrink-0 rounded-[var(--radius-xs)] p-1 opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="size-3.5" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  )
}