import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'

/**
 * Статус и метка.
 *
 * Подписи скромные и конкретные: «онлайн», «нет связи», «ждёт привязки».
 * Придуманные вроде «активен» ничего не значат и ставят человека в тупик при
 * разборе инцидента.
 *
 * Цвета у статусов нет: смысл несут слово, форма маркера и инверсия. Онлайн —
 * залитый квадрат и белый текст, синхронизация — акцент (это живое состояние),
 * нет связи — контур, ошибка — белая плашка на тёмном. Так акцент остаётся
 * акцентом, а не превращается в «ещё один красный».
 */
export type ScreenState = 'online' | 'syncing' | 'offline' | 'error' | 'unpaired' | 'disabled' | 'revoked'

const STYLES: Record<ScreenState, { label: string; className: string; dot: string }> = {
  online: {
    label: 'Онлайн',
    className: 'bg-surface-3 text-text',
    dot: 'bg-text',
  },
  syncing: {
    label: 'Синхронизирует',
    className: 'bg-surface-3 text-primary',
    dot: 'bg-primary',
  },
  offline: {
    label: 'Нет связи',
    className: 'border border-border-strong text-text-muted',
    dot: 'border border-current',
  },
  error: {
    label: 'Ошибка',
    className: 'bg-text text-bg',
    dot: 'bg-bg',
  },
  unpaired: {
    label: 'Ждёт привязки',
    className: 'border border-border text-text-subtle',
    dot: 'border border-current',
  },
  disabled: {
    label: 'Отключён',
    className: 'bg-surface-3 text-text-subtle',
    dot: 'bg-text-subtle',
  },
  revoked: {
    label: 'Отвязан',
    className: 'bg-surface-3 text-text-subtle',
    dot: 'border border-text-subtle',
  },
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
      className={`inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[10px] leading-none tracking-[0.08em] whitespace-nowrap uppercase ${style.className}`}
    >
      {children ?? <span className={`size-1.5 shrink-0 ${style.dot}`} />}
      {label ?? style.label}
    </span>
  )
}

export function Dot({ state }: { state: ScreenState }) {
  const style = STYLES[state]
  return <span className={`inline-block size-1.5 shrink-0 ${style.dot}`} />
}

/**
 * Тон метки.
 *
 * Отдельные состояния вместо одного «важного»: «отказ» и «загрузка» в одном
 * плашке означают для оператора одно и то же, хотя чинить их нужно
 * по-разному. Различие — в тексте и инверсии, не в оттенке.
 */
export type Tone = 'neutral' | 'success' | 'warn' | 'danger' | 'info'

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-text-muted',
  success: 'border border-border-strong text-text',
  warn: 'border border-border-strong text-text-muted',
  danger: 'bg-text text-bg',
  info: 'border border-border text-text-muted',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-1 font-mono text-[10px] leading-none tracking-[0.08em] whitespace-nowrap uppercase ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  )
}

/**
 * Заметка о состоянии.
 *
 * Единый вид для предупреждений на всех экранах: полоса слева означает тон,
 * текст говорит о факте, действие — о том, что делать. Значок обязателен: без
 * него «нет связи» и «всё хорошо» отличаются только оттенком, а оттенка здесь
 * нет намеренно.
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
  const toneClass: Record<string, string> = {
    info: 'border-border border-l-border-strong bg-surface-2 text-text',
    warn: 'border-border border-l-text-muted bg-surface-2 text-text',
    danger: 'border-text border-l-bg bg-text text-bg',
    success: 'border-border border-l-text bg-surface-2 text-text',
  }

  const Icon = tone === 'success' ? CircleCheck : tone === 'danger' ? CircleAlert : tone === 'warn' ? TriangleAlert : Info

  return (
    <div className={`flex items-start gap-3 border border-l-[3px] px-4 py-3.5 ${toneClass[tone]}`}>
      <Icon className="mt-0.5 size-4 shrink-0" strokeWidth={1.6} />

      <div className="min-w-0 flex-1">
        {title ? <div className="text-[12.5px] font-medium">{title}</div> : null}
        <div className={`text-[12.5px] leading-relaxed ${title ? 'mt-0.5 opacity-85' : ''}`}>{children}</div>
      </div>

      {action ? <div className="shrink-0">{action}</div> : null}

      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Скрыть сообщение"
          className="-my-0.5 -mr-1 shrink-0 p-1 opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="size-3.5" strokeWidth={1.8} />
        </button>
      ) : null}
    </div>
  )
}
