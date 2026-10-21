import type { ReactNode } from 'react'

/**
 * Карточка.
 *
 * Поверхность #111 на near-black плюс hairline. Не тень: на тёмном фоне тень
 * не читается, а разница поверхностей читается сразу. Скруглений нет —
 * граница остаётся границей.
 */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>
}

/**
 * Заголовок карточки.
 *
 * Подпись под заголовком объясняет, что показывает содержимое и откуда взяты
 * числа. Это оказалось важнее оформления: без подписи оператор не мог отличить
 * «применили» от «отправили», и объяснение уходило в разговор поддержки.
 *
 * Кикер — mono-капс: он называет секцию, а не изображает заголовок.
 */
export function CardHeader({
  title,
  description,
  action,
  kicker,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  kicker?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-4">
      <div className="min-w-0">
        {kicker ? <div className="section-title mb-1.5">{kicker}</div> : null}
        <h2 className="text-[14.5px] leading-tight font-medium tracking-[-0.02em]">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-[74ch] text-[12.5px] leading-relaxed text-text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2 self-center">{action}</div> : null}
    </div>
  )
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 py-5 ${className}`}>{children}</div>
}

/**
 * Пустое состояние.
 *
 * Обязательный элемент, а не украшение: страница без данных обязана объяснить,
 * что делать дальше. Пустой экран с серым «нет данных» — это тупик, из которого
 * пользователь выходит только через поиск по документации.
 *
 * Иконка сидит в квадратной рамке: без подложки она читается как случайный
 * значок рядом с текстом, а не как обозначение состояния.
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
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      {icon ? (
        <div className="mb-2 flex size-12 items-center justify-center border border-border-strong bg-surface-2 text-primary">
          {icon}
        </div>
      ) : null}
      <div className="text-[14.5px] font-medium tracking-[-0.018em]">{title}</div>
      {hint ? (
        <p className="max-w-[48ch] text-[12.5px] leading-relaxed text-text-muted">{hint}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}
