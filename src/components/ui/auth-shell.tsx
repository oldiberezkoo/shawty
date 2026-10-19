import type { ReactNode } from 'react'
import Link from 'next/link'
import { MonitorPlay } from 'lucide-react'
import { ThemeToggle } from './theme-toggle'

/**
 * Каркас страниц вне панели: вход по приглашению, регистрация.
 *
 * Одна форма в центре пустого экрана выглядит как заготовка. Здесь есть
 * знак продукта, заголовок, объяснение и возврат к входу — три вещи, которых
 * не хватает человеку, открывшему ссылку из письма и не понимающему, куда он
 * попал.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
  width = 'sm',
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: 'sm' | 'md'
}) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-5 py-14">
      {/* Мягкая подсветка сверху: без неё белый экран с формой читается как
          страница ошибки, а не как начало работы. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(65%_45%_at_50%_0%,var(--surface-2),transparent_70%)]"
      />

      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className={`fade-in relative w-full ${width === 'md' ? 'max-w-[440px]' : 'max-w-[380px]'}`}>
        <div className="mb-6 flex flex-col items-center text-center">
          <Link
            href="/login"
            aria-label="На страницу входа"
            className="mb-4 flex size-10 items-center justify-center rounded-[var(--radius-lg)] bg-primary text-primary-text shadow-[var(--shadow-sm)] transition-transform hover:scale-[1.03] active:translate-y-px"
          >
            <MonitorPlay className="size-[18px]" strokeWidth={1.9} />
          </Link>

          <h1 className="page-title">{title}</h1>

          {description ? (
            <p className="mt-1.5 max-w-[48ch] text-[13px] leading-relaxed text-text-muted">{description}</p>
          ) : null}
        </div>

        {children}

        {footer ? <div className="mt-5 text-center text-[13px] text-text-muted">{footer}</div> : null}
      </div>
    </main>
  )
}
