import Link from 'next/link'
import { Dither } from '@/components/visual/dither'
import { Mark } from '@/components/visual/mark'

/**
 * Страница «не найдено».
 *
 * Не тупик: здесь есть знак, объяснение и два выхода — в панель и на страницу
 * входа. Ошибка 404 чаще всего означает опечатку в ссылке или устаревшую
 * закладку, и человеку нужен короткий путь обратно, а не извинение.
 */
export default function NotFound() {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-bg px-6 py-6">
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 bottom-0 hidden h-[70%] w-[45%] opacity-80 [mask-image:radial-gradient(ellipse_at_bottom_right,#000_18%,transparent_78%)] lg:block"
      >
        <Dither scene="crystals" focus={0.5} cell={2} />
      </div>

      <header className="relative z-10 flex items-center justify-between border-b border-border pb-4">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <Mark size={20} className="text-primary" />
          <span className="bg-primary px-1.5 py-px font-sans text-[14px] leading-[1.2] font-medium text-primary-text uppercase">
            SHAWTY
          </span>
        </Link>

        <span className="font-mono text-[9px] tracking-[0.16em] text-text-subtle uppercase">
          404 · не найдено
        </span>
      </header>

      <div className="relative z-10 flex flex-1 flex-col items-start justify-center gap-6 py-16">
        <p className="section-title">[404] Маршрут</p>

        <h1 className="max-w-[18ch] text-[clamp(2rem,1.4rem+2vw,3.25rem)] leading-[1.02] font-medium tracking-[-0.04em] text-balance">
          Такой страницы <em>нет</em>
        </h1>

        <p className="max-w-[48ch] text-[13px] leading-relaxed text-text-muted">
          Возможно, ссылка устарела или в адресе опечатка. Вернитесь в панель — оттуда видно все
          разделы сети.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center border border-primary bg-primary px-4 font-mono text-[11px] tracking-[0.08em] text-primary-text uppercase transition-colors hover:border-primary-hover hover:bg-primary-hover"
          >
            В панель
          </Link>
          <Link
            href="/login"
            className="inline-flex h-10 items-center border border-border-strong px-4 font-mono text-[11px] tracking-[0.08em] text-text uppercase transition-colors hover:border-text hover:bg-surface-2"
          >
            Ко входу
          </Link>
        </div>
      </div>

      <footer className="relative z-10 flex items-center gap-2 border-t border-border pt-4 font-mono text-[9px] tracking-[0.12em] text-text-subtle uppercase">
        <Mark size={12} className="text-primary" />
        Управление цифровыми экранами · 2026
      </footer>
    </main>
  )
}
