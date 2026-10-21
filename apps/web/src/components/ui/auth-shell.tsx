import type { ReactNode } from 'react'
import Link from 'next/link'
import { ThemeToggle } from './theme-toggle'
import { Lockup } from '@/components/visual/lockup'
import { Dither } from '@/components/visual/dither'

/**
 * Каркас страниц вне панели: вход по приглашению, регистрация.
 *
 * Одна форма в центре пустого экрана выглядит как заготовка. Здесь есть знак
 * продукта, заголовок, объяснение и возврат к входу — три вещи, которых
 * не хватает человеку, открывшему ссылку из письма и не понимающему, куда он
 * попал.
 *
 * Фон — дизеринг-сцена, а не радиальное свечение: сцена принадлежит бренду
 * и не зависит от размера экрана. Край сцены растворяется маской, поэтому
 * границы блока не видно.
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
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-bg px-5 py-14">
      {/* Сцена обрамляет форму с боков, а не лежит под ней: текст и поля
          остаются на чистом фоне, а брендовая текстура видна по краям. */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 hidden h-[72%] w-[24%] [mask-image:radial-gradient(ellipse_at_bottom_left,#000_16%,transparent_72%)] lg:block"
      >
        <Dither scene="crystals" focus={0.4} cell={2} />
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute right-0 bottom-0 hidden h-[72%] w-[24%] [mask-image:radial-gradient(ellipse_at_bottom_right,#000_16%,transparent_72%)] lg:block"
      >
        <Dither scene="flow" focus={0.55} cell={2} />
      </div>

      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className={`fade-in relative w-full ${width === 'md' ? 'max-w-[460px]' : 'max-w-[400px]'}`}>
        <div className="mb-8 flex flex-col items-center text-center">
          <Link href="/login" aria-label="На страницу входа" className="transition-opacity hover:opacity-80">
            <Lockup size={24} chip={null} />
          </Link>

          <h1 className="page-title mt-6">{title}</h1>

          {description ? (
            <p className="mt-2 max-w-[48ch] text-[12.5px] leading-relaxed text-text-muted">{description}</p>
          ) : null}
        </div>

        {children}

        {footer ? <div className="mt-5 text-center text-[12.5px] text-text-muted">{footer}</div> : null}
      </div>
    </main>
  )
}
