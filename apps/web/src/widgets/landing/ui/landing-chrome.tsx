import Link from 'next/link'
import { Lockup } from '@/components/visual/lockup'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { LandingCta } from '@/components/landing/cta'
import { MARQUEE, NAV_LINKS } from '@/components/landing/content'

export function LandingNav() {
  return (
    <header id="top" className="landing-nav">
      <div className="landing-frame landing-nav-inner">
        <Link href="/" aria-label="SHAWTY — на главную" className="shrink-0">
          <Lockup size={20} chip="Digital signage" />
        </Link>

        <nav className="landing-nav-links" aria-label="Основная навигация">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="landing-nav-actions">
          <ThemeToggle />
          <Link
            href="/login"
            className="hidden h-8 items-center font-mono text-[10px] tracking-[0.08em] text-text-muted uppercase transition-colors hover:text-text min-[30rem]:inline-flex"
          >
            Войти
          </Link>
          <LandingCta href="/register" size="sm">
            Создать сеть
          </LandingCta>
        </div>
      </div>
    </header>
  )
}

export function Marquee() {
  const run = (key: string) => (
    <div key={key} className="landing-marquee-run" aria-hidden="true">
      {MARQUEE.map((item) => (
        <span key={item} className="landing-marquee-item">
          <i aria-hidden="true" />
          {item}
        </span>
      ))}
    </div>
  )

  return (
    <div className="landing-marquee" role="region" aria-label="Возможности SHAWTY">
      <p className="sr-only">
        Публикация, расписание, кампании, подтверждение доставки, мониторинг,
        медиатека, филиалы, роли, журнал действий, плеер, синхронизация,
        работа без флешек и старый телевизор с браузерной приставкой.
      </p>
      <div className="landing-marquee-track">
        {run('first')}
        {run('second')}
      </div>
    </div>
  )
}

export function SectionHead({
  num,
  children,
  meta,
}: {
  num: string
  children: string
  meta: string
}) {
  return (
    <p className="landing-section-head label">
      <b>[{num}]</b> {children}
      <span className="landing-section-meta">{meta}</span>
    </p>
  )
}

export function FactList({ items }: { items: readonly { title: string; text: string }[] }) {
  return (
    <div className="landing-fact-list">
      {items.map((item, index) => (
        <div key={item.title} className="landing-fact">
          <span className="font-mono text-[9px] leading-5 text-text-subtle">
            {String(index + 1).padStart(2, '0')}
          </span>
          <div>
            <h3 className="text-[12.5px] leading-snug font-medium text-text">{item.title}</h3>
            <p className="mt-1 text-[11.5px] leading-relaxed text-text-muted">{item.text}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-frame landing-footer-inner">
        <p className="font-mono text-[9px] tracking-[0.08em] text-text-subtle uppercase">
          © 2026 SHAWTY · управление цифровыми экранами
        </p>

        <nav className="landing-footer-links" aria-label="Подвал">
          <Link href="/login">Войти</Link>
          <Link href="/player/pairing">Плеер</Link>
          <Link href="#pricing">Тарифы</Link>
          <Link href="#top">Наверх ↑</Link>
        </nav>
      </div>
    </footer>
  )
}
