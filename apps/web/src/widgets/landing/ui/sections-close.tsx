import Link from 'next/link'
import { PixelIcon } from '@/components/visual/pixel-icon'
import { NetworkStats } from '@/components/landing/network-stats'
import { LandingCta } from '@/components/landing/cta'
import { ADDON_OPTIONS, FAQ, PLANS, SCENARIOS } from '@/components/landing/content'
import { SectionHead } from './landing-chrome'

export function ScenariosSection() {
  return (
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
              <span className="section-title">{String(index + 1).padStart(2, '0')}</span>
              <PixelIcon name={scenario.icon} size={22} className="text-primary" />
            </div>

            <span className="landing-scenario-tag">{scenario.tag}</span>

            <h3 className="text-[14px] leading-snug font-medium tracking-[-0.02em] text-text">
              {scenario.title}
            </h3>

            <p className="text-[12.5px] leading-relaxed text-text-muted">{scenario.text}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export function NetworkSection() {
  return (
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
  )
}

export function PricingSection() {
  return (
    <section id="pricing" aria-labelledby="pricing-title">
      <SectionHead num="10" meta="UZS">
        Тарифы
      </SectionHead>

      <div className="landing-intro">
        <h2 id="pricing-title" className="landing-h2">
          Начните с двух экранов. <em>Растите без переезда.</em>
        </h2>
        <p className="landing-lede">
          Free бесплатен. Growth и Pro подключаются в панели; оплата вносится
          вручную.
        </p>
      </div>

      <div className="landing-cells landing-plans">
        {PLANS.map((plan, index) => (
          <div key={plan.name} className="landing-cell landing-plan">
            <div className="landing-cell-top">
              <span className="section-title">{String(index + 1).padStart(2, '0')}</span>
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

      <div className="mt-6 flex items-center justify-between gap-3">
        <span className="section-title">Докупить отдельно</span>
        <span className="font-mono text-[9px] tracking-[0.06em] text-text-subtle uppercase">
          сверх лимита тарифа
        </span>
      </div>

      <div className="landing-cells landing-cells--2 mt-3">
        {ADDON_OPTIONS.map((option) => (
          <article key={option.title} className="landing-cell">
            <div className="landing-cell-top">
              <h3 className="text-[14px] leading-snug font-medium tracking-[-0.02em] text-text">
                {option.title}
              </h3>
              <span className="shrink-0 font-mono text-[10px] tracking-[0.04em] text-primary uppercase">
                {option.price}
              </span>
            </div>
            <p className="text-[12px] leading-relaxed text-text-muted">{option.text}</p>
          </article>
        ))}
      </div>

      <div className="landing-plan-note">
        <span className="section-title">Free — 0 сум</span>
        <p className="text-[11.5px] leading-relaxed text-text-muted">
          Тариф меняется в панели владельцем компании. Оплата Growth, Pro и
          докупленных опций вносится вручную.
        </p>
      </div>
    </section>
  )
}

export function FaqSection() {
  return (
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
  )
}

export function LandingFinale() {
  return (
    <section className="landing-finale" aria-label="Начать работу с SHAWTY">
      <Link href="/register" className="landing-cta-bar">
        Создать сеть <span aria-hidden="true">→</span>
      </Link>
      <p className="landing-giant" aria-hidden="true" translate="no">
        SHAWTY
      </p>
    </section>
  )
}
