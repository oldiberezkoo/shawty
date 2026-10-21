import type { ReactNode } from 'react'

/**
 * Заголовок страницы.
 *
 * Раньше каждый экран собирал его сам: где-то заголовок стоял в ряд с
 * кнопкой, где-то под ним был абзац на две строки, где-то подписи не было
 * вовсе. Из-за этого при переходе между разделами «шапка» прыгала по высоте
 * и по положению действия, и панель выглядела набором разных приложений.
 *
 * Здесь задан один порядок: контекст, заголовок, объяснение, действие справа.
 * Линия снизу отделяет шапку от данных — без неё заголовок «плывёт» в сетке.
 */
export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  /** Строка над заголовком: раздел, компания, контекст. */
  meta?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0">
        {meta ? (
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] tracking-[0.08em] text-text-subtle uppercase">
            {meta}
          </div>
        ) : null}

        <h1 className="page-title">{title}</h1>

        {description ? (
          <p className="mt-2.5 max-w-[78ch] text-[13px] leading-relaxed text-text-muted">{description}</p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-0.5">{actions}</div>
      ) : null}
    </div>
  )
}
