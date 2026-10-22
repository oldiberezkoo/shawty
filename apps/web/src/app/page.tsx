import type { Metadata } from 'next'
import Link from 'next/link'
import { Dither } from '@/components/visual/dither'
import { Lockup } from '@/components/visual/lockup'
import { Mark } from '@/components/visual/mark'
import { PixelIcon } from '@/components/visual/pixel-icon'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { ChainMock } from '@/components/landing/chain-mock'
import { LandingCta } from '@/components/landing/cta'
import { DashboardMock } from '@/components/landing/dashboard-mock'
import { DeliveryMock } from '@/components/landing/delivery-mock'
import { NetworkStats } from '@/components/landing/network-stats'
import { PairWindow } from '@/components/landing/pair-window'
import { PlayerMock } from '@/components/landing/player-mock'
import { StreetScreen } from '@/components/landing/street-screen'
import { SyncWall } from '@/components/landing/sync-wall'
import {
  DELIVERY_FACTS,
  FAQ,
  FEATURES,
  MARQUEE,
  MECHANISMS,
  NAV_LINKS,
  PLANS,
  PLAYER_FACTS,
  SCENARIOS,
  STEPS,
  SYNC_FACTS,
} from '@/components/landing/content'

export const metadata: Metadata = {
  title: { absolute: 'SHAWTY — контент на экранах с подтверждением доставки' },
  description:
    'Публикуйте контент на телевизоры, назначайте кампании по филиалам и получайте подтверждение доставки от каждого экрана. Start — до 5 экранов бесплатно.',
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'SHAWTY',
    title: 'SHAWTY — контент на экранах с подтверждением доставки',
    description:
      'Публикация, расписание и подтверждение показа на каждом экране сети — в одной панели.',
  },
}

function Marquee() {
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
    <div
      className="landing-marquee"
      role="region"
      aria-label="Возможности SHAWTY"
    >
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

function SectionHead({
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

function FactList({ items }: { items: readonly { title: string; text: string }[] }) {
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

export default function HomePage() {
  return (
    <>
      <a href="#content" className="landing-skip">
        К содержимому
      </a>

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

      <main id="content" className="landing-frame">
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
                  <span className="section-title">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <PixelIcon name={step.icon} size={22} className="text-primary" />
                </div>

                <h3 className="text-[14px] leading-snug font-medium tracking-[-0.02em] text-text">
                  {step.title}
                </h3>

                <p className="flex-1 text-[12.5px] leading-relaxed text-text-muted">
                  {step.text}
                </p>

                <p className="border-t border-border pt-3 font-mono text-[9px] tracking-[0.06em] text-text-subtle uppercase">
                  {step.foot}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section id="sync" aria-labelledby="sync-title">
          <SectionHead num="02" meta="4 экрана · 1 версия">
            Без флешек
          </SectionHead>

          <div className="landing-sync">
            <div className="landing-sync-copy">
              <p className="landing-kicker">2026 · сеть вместо флешки</p>

              <h2 id="sync-title" className="landing-h2">
                Эра флешек закончилась. <em>Экраны обновляются вместе.</em>
              </h2>

              <p className="landing-lede">
                Подключите четыре экрана — и обновляйте их одной публикацией.
                В панели видно, кто уже принял новую версию, а кто ещё на связи.
                Не нужно обходить зал с флешкой и проверять каждый телевизор вручную.
              </p>

              <FactList items={SYNC_FACTS} />

              <Link
                href="/pair"
                className="inline-flex items-center gap-2 font-mono text-[9px] tracking-[0.08em] text-text uppercase transition-colors hover:text-primary"
              >
                Подключить экран <span aria-hidden="true">→</span>
              </Link>
            </div>

            <SyncWall />
          </div>
        </section>

        <section id="chain" aria-labelledby="chain-title">
          <SectionHead num="03" meta="Команда">
            Цепочка
          </SectionHead>

          <div className="landing-intro">
            <h2 id="chain-title" className="landing-h2">
              От монтажёра до экрана. <em>Без лишних слоёв.</em>
            </h2>
            <p className="landing-lede">
              Медиатека, кампания, расписание и доставка живут в одной панели.
              Менеджеру не нужно собирать файлы из чатов, записывать флешки
              и обзванивать точки.
            </p>
          </div>

          <ChainMock />
        </section>

        <section id="product" aria-labelledby="product-title">
          <SectionHead num="04" meta="Панель">
            В одной панели
          </SectionHead>

          <div className="landing-intro">
            <h2 id="product-title" className="landing-h2">
              Публикация, экраны и доказательства. <em>В одном месте.</em>
            </h2>
            <p className="landing-lede">
              Медиатека, кампании, расписание, мониторинг и журнал используют одни и те
              же данные. Не нужно сверять таблицы и переписку.
            </p>
          </div>

          <ul className="landing-cells landing-features">
            {FEATURES.map((feature, index) => (
              <li key={feature.title} className="landing-cell">
                <div className="landing-cell-top">
                  <span className="section-title">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <PixelIcon name={feature.icon} size={22} className="text-primary" />
                </div>

                <h3 className="text-[14px] leading-snug font-medium tracking-[-0.02em] text-text">
                  {feature.title}
                </h3>

                <p className="text-[12.5px] leading-relaxed text-text-muted">{feature.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="delivery" aria-labelledby="delivery-title">
          <SectionHead num="05" meta="Журнал">
            Подтверждение
          </SectionHead>

          <div className="landing-split">
            <div className="landing-split-copy">
              <h2 id="delivery-title" className="landing-h2">
                «Отправлено» — не статус. <br className="hidden sm:block" />
                <em>«Принято экраном» — статус.</em>
              </h2>

              <p className="landing-lede">
                Сервер ставит версию в очередь и ждёт ответа устройства. Пока файл не
                скачан и не принят, доставка не считается завершённой.
              </p>

              <FactList items={DELIVERY_FACTS} />

              <Link
                href="/pair"
                className="inline-flex items-center gap-2 font-mono text-[9px] tracking-[0.08em] text-text uppercase transition-colors hover:text-primary"
              >
                Подключить экран <span aria-hidden="true">→</span>
              </Link>
            </div>

            <DeliveryMock />
          </div>
        </section>

        <section id="player" aria-labelledby="player-title">
          <SectionHead num="06" meta="Браузер">
            Плеер
          </SectionHead>

          <div className="landing-stage">
            <div className="landing-stage-art" aria-hidden="true">
              <div className="absolute top-0 right-0 h-full w-[72%] opacity-30 [mask-image:radial-gradient(ellipse_at_right,#000_10%,transparent_72%)]">
                <Dither scene="flow" focus={0.6} cell={3} />
              </div>
            </div>

            <div className="landing-player-grid">
              <div className="landing-split-copy">
                <h2 id="player-title" className="landing-h2">
                  Телевизору нужен браузер. <br className="hidden sm:block" />
                  <em>И короткий код.</em>
                </h2>

                <p className="landing-lede">
                  Плеер открывается по ссылке и работает без установки. Телевизор
                  показывает код, панель принимает тот же код; после привязки экран сам
                  поддерживает соединение.
                </p>

                <FactList items={PLAYER_FACTS} />

                <div className="flex flex-wrap items-center gap-2.5">
                  <LandingCta href="/pair">Привязать экран</LandingCta>
                  <LandingCta href="/player/pairing" variant="secondary">
                    Открыть плеер
                  </LandingCta>
                </div>
              </div>

              <div className="landing-player-visual">
                <PlayerMock
                  variant="pairing"
                  size="lg"
                  className="landing-player-screen"
                />
                <PairWindow className="landing-pair-window" />
              </div>
            </div>
          </div>
        </section>

        <section id="mechanisms" aria-labelledby="mechanisms-title">
          <SectionHead num="07" meta="Платформа">
            Уже решено
          </SectionHead>

          <div className="landing-intro">
            <h2 id="mechanisms-title" className="landing-h2">
              Синхронизация, хранение и плеер. <em>Уже внутри.</em>
            </h2>
            <p className="landing-lede">
              Вам не нужно собирать стек из сервисов, писать интеграции и нанимать
              отдел разработки. Основа уже работает — остаётся подключить экраны
              и загрузить контент.
            </p>
          </div>

          <ul className="landing-cells landing-mechanisms">
            {MECHANISMS.map((item, index) => (
              <li key={item.title} className="landing-cell landing-mechanism">
                <div className="landing-cell-top">
                  <span className="section-title">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <PixelIcon name={item.icon} size={22} className="text-primary" />
                </div>

                <h3 className="text-[14px] leading-snug font-medium tracking-[-0.02em] text-text">
                  {item.title}
                </h3>

                <p className="text-[12.5px] leading-relaxed text-text-muted">{item.text}</p>

                <p className="landing-mechanism-foot">{item.foot}</p>
              </li>
            ))}
          </ul>

          <div className="landing-street">
            <StreetScreen />

            <div className="landing-street-copy">
              <p className="landing-kicker">Старый ТВ → уличный экран</p>

              <h3 className="landing-street-title">
                Витрина, которую не надо обходить с флешкой.
              </h3>

              <p className="landing-lede">
                Если у телевизора есть HDMI, а у приставки — браузер, экран открывает
                плеер SHAWTY. Подойдёт для витрины, зала или уличного экрана, если
                корпус и яркость рассчитаны на улицу.
              </p>

              <ul className="landing-street-list">
                <li>
                  <span>01</span>
                  <p>
                    <strong>Телевизор с HDMI</strong>
                    <small>Подойдёт старый экран, который уже висит в зале.</small>
                  </p>
                </li>
                <li>
                  <span>02</span>
                  <p>
                    <strong>Приставка с браузером</strong>
                    <small>Например, Xiaomi или другая модель с рабочим браузером.</small>
                  </p>
                </li>
                <li>
                  <span>03</span>
                  <p>
                    <strong>Стабильный интернет</strong>
                    <small>
                      Для тяжёлого контента рекомендуем от 100 Мбит/с — без гарантии
                      скорости канала.
                    </small>
                  </p>
                </li>
              </ul>

              <p className="landing-street-note">
                Без установки приложения: плеер открывается по ссылке в браузере
                приставки. Совместимость зависит от модели и браузера.
              </p>

              <Link
                href="/pair"
                className="inline-flex items-center gap-2 font-mono text-[9px] tracking-[0.08em] text-text uppercase transition-colors hover:text-primary"
              >
                Подключить старый ТВ <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </section>

        <section id="scenarios" aria-labelledby="scenarios-title">
          <SectionHead num="08" meta="Примеры">
            Задачи
          </SectionHead>

          <div className="landing-intro">
            <h2 id="scenarios-title" className="landing-h2">
              Задачи, под которые <em>уже всё есть.</em>
            </h2>
            <p className="landing-lede">
              Сценарии собраны из готовых возможностей платформы: без названий
              клиентов и вымышленных метрик.
            </p>
          </div>

          <div className="landing-cells landing-scenarios">
            {SCENARIOS.map((scenario, index) => (
              <article key={scenario.title} className="landing-cell landing-scenario">
                <div className="landing-cell-top">
                  <span className="section-title">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <PixelIcon name={scenario.icon} size={22} className="text-primary" />
                </div>

                <span className="landing-scenario-tag">{scenario.tag}</span>

                <h3 className="text-[14px] leading-snug font-medium tracking-[-0.02em] text-text">
                  {scenario.title}
                </h3>

                <p className="text-[12.5px] leading-relaxed text-text-muted">
                  {scenario.text}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section id="network" aria-labelledby="network-title">
          <SectionHead num="09" meta="Live">
            Сеть
          </SectionHead>

          <div className="landing-intro">
            <h2 id="network-title" className="landing-h2">
              Сколько экранов работает. <em>Прямо сейчас.</em>
            </h2>
            <p className="landing-lede">
              Считаем устройства на обслуживании, экраны на связи и суммарный канал
              по данным heartbeat. Если данных нет, остаётся «—», а не
              демонстрационное число.
            </p>
          </div>

          <div className="landing-network">
            <NetworkStats />
            <p className="landing-network-note">
              Публичные агрегаты: без названий компаний, экранов и сотрудников.
              Обновление — раз в 30 секунд.
            </p>
          </div>
        </section>

        <section id="pricing" aria-labelledby="pricing-title">
          <SectionHead num="10" meta="UZS">
            Тарифы
          </SectionHead>

          <div className="landing-intro">
            <h2 id="pricing-title" className="landing-h2">
              Начните с пяти экранов. <em>Растите без переезда.</em>
            </h2>
            <p className="landing-lede">
              Start бесплатен. Growth и Pro подключаются в панели; оплата вносится
              вручную.
            </p>
          </div>

          <div className="landing-cells landing-plans">
            {PLANS.map((plan, index) => (
              <div key={plan.name} className="landing-cell landing-plan">
                <div className="landing-cell-top">
                  <span className="section-title">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {plan.featured ? (
                    <span className="border border-primary-border bg-primary-soft px-1.5 py-1 font-mono text-[8px] tracking-[0.08em] text-primary uppercase">
                      Бесплатно
                    </span>
                  ) : null}
                </div>

                <div>
                  <h3 className="text-[18px] leading-none font-medium tracking-[-0.03em] text-text">
                    {plan.name}
                  </h3>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-text-muted">
                    {plan.tagline}
                  </p>
                </div>

                <div>
                  <p className="landing-plan-price text-text">{plan.price}</p>
                  <p className="mt-1.5 font-mono text-[9px] tracking-[0.06em] text-text-subtle uppercase">
                    {plan.priceNote}
                  </p>
                </div>

                <dl className="flex flex-col gap-2.5">
                  {plan.limits.map((limit) => (
                    <div key={limit.label} className="landing-plan-row">
                      <dt>{limit.label}</dt>
                      <dd>
                        <span>{limit.value}</span>
                      </dd>
                    </div>
                  ))}
                </dl>

                <LandingCta
                  href="/register"
                  variant={plan.featured ? 'primary' : 'secondary'}
                  size="sm"
                  className="mt-auto w-full"
                >
                  Создать сеть
                </LandingCta>
              </div>
            ))}
          </div>

          <div className="landing-plan-note">
            <span className="section-title">Start — 0 сум</span>
            <p className="text-[11.5px] leading-relaxed text-text-muted">
              Тариф меняется в панели владельцем компании. Оплата Growth и Pro
              вносится вручную.
            </p>
          </div>
        </section>

        <section id="faq" aria-labelledby="faq-title">
          <SectionHead num="11" meta="FAQ">
            Вопросы
          </SectionHead>

          <div className="landing-intro">
            <h2 id="faq-title" className="landing-h2">
              Что важно знать <br className="hidden sm:block" />
              <em>до первой публикации.</em>
            </h2>
          </div>

          <dl className="landing-cells landing-faq">
            {FAQ.map((item) => (
              <div key={item.question} className="landing-cell">
                <dt className="text-[14px] leading-snug font-medium tracking-[-0.02em] text-text">
                  {item.question}
                </dt>
                <dd className="text-[12.5px] leading-relaxed text-text-muted">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="landing-finale" aria-label="Начать работу с SHAWTY">
          <Link href="/register" className="landing-cta-bar">
            Создать сеть <span aria-hidden="true">→</span>
          </Link>
          <p className="landing-giant" aria-hidden="true" translate="no">
            SHAWTY
          </p>
        </section>
      </main>

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
    </>
  )
}
