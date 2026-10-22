/**
 * Старый телевизор с браузерной приставкой.
 *
 * Макет показывает сценарий, а не конкретную модель: подпись под ним прямо
 * говорит, что нужен браузер на приставке, а не «любой телевизор».
 */
export function StreetScreen({ className = '' }: { className?: string }) {
  return (
    <div className={className}>
      <div
        className="landing-street-art"
        role="img"
        aria-label="Макет уличного экрана: старый телевизор, приставка с браузером и кабель HDMI. На экране — витрина с обновляемым меню."
      >
        <div className="landing-street-kicker">
          <span>street / display</span>
          <span>пример</span>
        </div>

        <div className="landing-street-tv">
          <div className="landing-street-screen">
            <div className="landing-street-screen-art" />
            <span className="landing-street-scan" />

            <div className="landing-street-poster">
              <span className="landing-street-poster-kicker">каждый день / 09:00 — 22:00</span>
              <strong>
                Свежее меню
                <br />
                каждый день
              </strong>
              <span className="landing-street-poster-meta">акции · новости · режим работы</span>
            </div>
          </div>

          <div className="landing-street-tv-foot">
            <span>HDMI / 1080p</span>
            <span>player / browser</span>
          </div>
        </div>

        <div className="landing-street-box">
          <span className="landing-street-box-led" />
          <span className="landing-street-box-copy">
            <span className="landing-street-box-label">TV BOX</span>
            <span className="landing-street-box-sub">browser / hdmi</span>
          </span>
        </div>

        <span aria-hidden="true" className="landing-street-wire">
          <i />
        </span>
      </div>

      <p className="landing-street-caption">Старый ТВ + приставка с браузером</p>
    </div>
  )
}
