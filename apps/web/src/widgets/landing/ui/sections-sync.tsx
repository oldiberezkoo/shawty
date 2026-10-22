import Link from 'next/link'
import { ChainMock } from '@/components/landing/chain-mock'
import { SyncWall } from '@/components/landing/sync-wall'
import { SYNC_FACTS } from '@/components/landing/content'
import { FactList, SectionHead } from './landing-chrome'

export function SyncSection() {
  return (
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
  )
}

export function ChainSection() {
  return (
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
  )
}
