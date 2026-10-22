import Link from 'next/link'
import { Dither } from '@/components/visual/dither'
import { PixelIcon } from '@/components/visual/pixel-icon'
import { DeliveryMock } from '@/components/landing/delivery-mock'
import { PairWindow } from '@/components/landing/pair-window'
import { PlayerMock } from '@/components/landing/player-mock'
import { LandingCta } from '@/components/landing/cta'
import { StreetScreen } from '@/components/landing/street-screen'
import { DELIVERY_FACTS, FEATURES, MECHANISMS, PLAYER_FACTS } from '@/components/landing/content'
import { FactList, SectionHead } from './landing-chrome'

export function ProductSection() {
  return (
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
              <span className="section-title">{String(index + 1).padStart(2, '0')}</span>
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
  )
}

export function DeliverySection() {
  return (
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
  )
}

export function PlayerSection() {
  return (
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
            <PlayerMock variant="pairing" size="lg" className="landing-player-screen" />
            <PairWindow className="landing-pair-window" />
          </div>
        </div>
      </div>
    </section>
  )
}

export function MechanismsSection() {
  return (
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
              <span className="section-title">{String(index + 1).padStart(2, '0')}</span>
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

          <h3 className="landing-street-title">Витрина, которую не надо обходить с флешкой.</h3>

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
  )
}
