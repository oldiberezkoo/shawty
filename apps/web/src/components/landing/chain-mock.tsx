import { CHAIN_FACTS, CHAIN_NOW, CHAIN_OLD } from './content'

/**
 * Схема «было → стало».
 *
 * Показывает не проценты экономии, а исчезнувшие ручные слои: чат, флешку и
 * выезд. Все подписи — описание продукта, а не данные конкретной компании.
 */
export function ChainMock({ className = '' }: { className?: string }) {
  return (
    <div className={`landing-chain ${className}`}>
      <div className="landing-chain-row landing-chain-row--old">
        <div className="landing-chain-label">
          <span className="section-title">Было</span>
          <span className="landing-chain-label-note">ручные слои</span>
        </div>

        <ol className="landing-chain-track">
          {CHAIN_OLD.map((step) => (
            <li
              key={step.label}
              className={`landing-chain-step${step.dead ? ' is-dead' : ''}`}
            >
              <i aria-hidden="true" className="landing-chain-dot" />
              <span className="landing-chain-step-label">{step.label}</span>
              <span className="landing-chain-step-detail">{step.detail}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="landing-chain-row landing-chain-row--now">
        <div className="landing-chain-label">
          <span className="section-title">Сейчас</span>
          <span className="landing-chain-label-note">один поток</span>
        </div>

        <div className="landing-chain-track-wrap">
          <ol className="landing-chain-track">
            {CHAIN_NOW.map((step) => (
              <li key={step.label} className="landing-chain-step">
                <i aria-hidden="true" className="landing-chain-dot" />
                <span className="landing-chain-step-label">{step.label}</span>
                <span className="landing-chain-step-detail">{step.detail}</span>
              </li>
            ))}
          </ol>

          <i aria-hidden="true" className="landing-chain-packet" />
        </div>
      </div>

      <div className="landing-chain-foot">
        <div className="landing-chain-facts">
          {CHAIN_FACTS.map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        </div>
        <p>
          Экономия — не в процентах, а в исчезнувших ручных шагах: файл не нужно
          пересылать, версию — проверять, экран — обходить.
        </p>
      </div>
    </div>
  )
}
