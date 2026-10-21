import type { ReactNode } from 'react'

/**
 * Оконный хром.
 *
 * Окно — базовая единица системы: в нём живут код, палитра команд и диалоги.
 * Титульная строка с акцентной биркой отделяет «прибор» от страницы и даёт
 * интерфейсу узнаваемый ритм.
 */
export function Window({
  tag = 'SHAWTY',
  title,
  children,
  className = '',
  bodyClassName = '',
}: {
  tag?: string
  title?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <div
      className={`flex min-w-0 flex-col border border-border-strong bg-bg ${className}`}
    >
      <div className="flex items-center gap-3 border-b border-border px-3 py-2">
        <span className="bg-primary px-1 py-px font-sans text-[10px] leading-[1.35] font-medium tracking-[0.02em] text-primary-text uppercase">
          {tag}
        </span>

        {title ? (
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-subtle">
            {title}
          </span>
        ) : (
          <span className="flex-1" />
        )}

        <span aria-hidden className="flex shrink-0 items-center gap-1.5 text-text-subtle">
          <span className="block size-[7px] border border-current" />
          <span className="block h-px w-[9px] bg-current" />
          <span className="block size-[7px] border border-current" />
        </span>
      </div>

      <div className={`min-w-0 ${bodyClassName}`}>{children}</div>
    </div>
  )
}
