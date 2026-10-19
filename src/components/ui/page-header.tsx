import type { ReactNode } from 'react'

/**
 * Заголовок страницы.
 *
 * Раньше каждый экран собирал его сам: где-то заголовок стоял в ряд с
 * кнопкой, где-то под ним был абзац на две строки, где-то подписи не было
 * вовсе. Из-за этого при переходе между разделами «шапка» прыгала по высоте
 * и по положению действия, и панель выглядела набором разных приложений.
 *
 * Здесь задан один порядок: заголовок, под ним объяснение, действие справа.
 * На узком экране действие уходит под текст, а не сжимает заголовок в
 * вертикальную полоску.
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
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0">
        {meta ? (
          <div className="mb-1.5 flex items-center gap-1.5 text-[12px] text-text-subtle">{meta}</div>
        ) : null}

        <h1 className="text-[20px] leading-[1.25] font-semibold tracking-[-0.028em] text-text">{title}</h1>

        {description ? (
          <p className="mt-1.5 max-w-[78ch] text-[13px] leading-relaxed text-text-muted">{description}</p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-0.5">{actions}</div>
      ) : null}
    </div>
  )
}
