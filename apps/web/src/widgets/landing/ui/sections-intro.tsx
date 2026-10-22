import Link from 'next/link'
import { Dither } from '@/components/visual/dither'
import { Mark } from '@/components/visual/mark'
import { PixelIcon } from '@/components/visual/pixel-icon'
import { LandingCta } from '@/components/landing/cta'
import { DashboardMock } from '@/components/landing/dashboard-mock'
import { PlayerMock } from '@/components/landing/player-mock'
import { STEPS } from '@/components/landing/content'
import { Marquee, SectionHead } from './landing-chrome'

export function LandingHero() {
  return (
    <>
      <section className="landing-hero" aria-labelledby="hero-title">
      <div className="landing-hero-top">
        <div>
          <p className="section-title mb-5">[00] Цифровые экраны</p>

          <h1 id="hero-title" className="landing-h1">
            Телевизоры показывают. <em>Вы видите, что именно.</em>
          </h1>

          <p className="landing-lede mt-5 max-w-[44ch]">
            SHAWTY публикует контент, считает расписание по филиалам и подтверждает
            доставку на каждом экране. Не «отправлено», а «принято экраном».
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <LandingCta href="/register">
              Создать сеть <span aria-hidden="true">→</span>
            </LandingCta>
            <LandingCta href="/login" variant="secondary">
              Войти в панель
            </LandingCta>
          </div>

          <div className="landing-hero-facts mt-7">
            <span className="flex items-center gap-1.5 text-text">
              <i aria-hidden="true" className="size-1.5 bg-primary" />
              Start — бесплатно
            </span>
            <span>5 экранов</span>
            <span>3 сотрудника</span>
            <span>5 ГБ</span>
          </div>

          <Link
            href="/player/pairing"
            className="mt-4 inline-flex items-center gap-2 font-mono text-[9px] tracking-[0.08em] text-text-subtle uppercase transition-colors hover:text-text"
          >
            Открыть плеер на телевизоре <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className="landing-hero-art">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-8 -bottom-12 h-[86%] w-[90%] opacity-80 [mask-image:radial-gradient(ellipse_at_bottom_right,#000_12%,transparent_74%)]"
          >
            <Dither scene="crystals" focus={0.58} cell={2} />
          </div>

          <div className="relative z-10 mb-3 flex items-center justify-between gap-3 font-mono text-[8px] tracking-[0.1em] text-text-subtle uppercase">
            <span className="flex items-center gap-2">
              <Mark size={10} className="text-primary" />
              Панель / экраны
            </span>
            <span>Пример</span>
          </div>

          <DashboardMock className="relative z-10" />
          <PlayerMock className="landing-hero-tv" />
        </div>
      </div>
      </section>

      <Marquee />
    </>
  )
}

export function HowItWorksSection() {
  return (
    <section id="how" aria-labelledby="how-title">
      <SectionHead num="01" meta="4 шага">
        Как это работает
      </SectionHead>

      <div className="landing-intro">
        <h2 id="how-title" className="landing-h2">
          От кода на телевизоре <br className="hidden sm:block" />
          <em>до подтверждённого показа.</em>
        </h2>
        <p className="landing-lede">
          Нужен браузер на телевизоре и панель в браузере на компьютере.
          Устанавливать приложение не нужно.
        </p>
        <Link
          href="/pair"
          className="inline-flex items-center gap-2 font-mono text-[9px] tracking-[0.08em] text-text uppercase transition-colors hover:text-primary"
        >
          Открыть привязку экрана <span aria-hidden="true">→</span>
        </Link>
      </div>

      <ol className="landing-cells landing-cells--4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="landing-cell">
            <div className="landing-cell-top">
              <span className="section-title">{String(index + 1).padStart(2, '0')}</span>
              <PixelIcon name={step.icon} size={22} className="text-primary" />
            </div>

            <h3 className="text-[14px] leading-snug font-medium tracking-[-0.02em] text-text">
              {step.title}
            </h3>

            <p className="flex-1 text-[12.5px] leading-relaxed text-text-muted">{step.text}</p>

            <p className="border-t border-border pt-3 font-mono text-[9px] tracking-[0.06em] text-text-subtle uppercase">
              {step.foot}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}
