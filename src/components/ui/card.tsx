import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>
}

/**
 * Заголовок карточки.
 *
 * Подпись под заголовком объясняет, что показывает содержимое и откуда взяты
 * числа. Это оказалось важнее оформления: без подписи оператор не мог отличить
 * «применили» от «отправили», и объяснение уходило в разговор поддержки.
 */
export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-[14px] leading-tight font-semibold">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-[70ch] text-[12.5px] leading-relaxed text-text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  )
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>
}

/**
 * Пустое состояние.
 *
 * Обязательный элемент, а не украшение: страница без данных обязана объяснить,
 * что делать дальше. Пустой экран с серым «нет данных» — это тупик, из которого
 * пользователь выходит только через поиск по документации.
 */
export function EmptyState({
  title,
  hint,
  action,
  icon,
}: {
  title: string
  hint?: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon ? <div className="mb-1 text-text-subtle">{icon}</div> : null}
      <div className="text-[14px] font-medium">{title}</div>
      {hint ? <p className="max-w-[46ch] text-[13px] leading-relaxed text-text-muted">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}