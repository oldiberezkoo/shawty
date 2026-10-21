import { Dither } from '@/components/visual/dither'
import { Mark } from '@/components/visual/mark'
import { Window } from '@/components/visual/window'
import { QrMark } from './qr-mark'

type Variant = 'display' | 'pairing'
type Size = 'sm' | 'lg'

/**
 * Макет экрана телевизора.
 *
 * В hero — маленький экран с текущей программой, в секции плеера — крупный
 * экран привязки. Оба состояния намеренно тёмные: плеер на телевизоре не
 * зависит от темы панели и всегда остаётся контрастным.
 */
export function PlayerMock({
  variant = 'display',
  size = 'sm',
  className = '',
}: {
  variant?: Variant
  size?: Size
  className?: string
}) {
  const pairing = variant === 'pairing'
  const compact = size === 'sm'

  return (
    <div
      role="img"
      aria-label={
        pairing
          ? 'Макет экрана привязки SHAWTY: восьмизначный код D8XK 92QF и QR-код.'
          : 'Макет экрана телевизора SHAWTY: сейчас идёт программа «Летнее меню», версия 42.'
      }
      className={`dark ${className}`}
    >
      <Window
        tag="SHAWTY"
        title={pairing ? 'player / pairing' : 'player / display'}
        bodyClassName="p-0"
      >
        <div className="relative aspect-video overflow-hidden bg-[#0a0a0a] text-white">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[78%] opacity-40 [mask-image:linear-gradient(90deg,transparent,#000_38%)]">
            <Dither scene={pairing ? 'flow' : 'crystals'} focus={0.62} cell={compact ? 2 : 3} />
          </div>

          <div
            className={`relative z-10 flex h-full flex-col ${compact ? 'p-3' : 'p-5 sm:p-7'}`}
          >
            <div
              className={`flex items-center justify-between font-mono tracking-[0.1em] text-white/55 uppercase ${
                compact ? 'text-[8px]' : 'text-[10px]'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Mark size={compact ? 9 : 12} className="text-primary" />
                <span translate="no">SHAWTY</span>
              </span>
              <span className="flex items-center gap-1.5">
                <i className={`bg-primary ${compact ? 'size-1' : 'size-1.5'}`} />
                {pairing ? 'Привязка' : 'В эфире'}
              </span>
            </div>

            {pairing ? (
              <div className="my-auto flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p
                    className={`font-mono tracking-[0.1em] text-white/45 uppercase ${
                      compact ? 'text-[8px]' : 'text-[10px]'
                    }`}
                  >
                    Код привязки
                  </p>
                  <p
                    className={`mt-2 font-mono font-medium tracking-[0.1em] whitespace-nowrap ${
                      compact ? 'text-[20px]' : 'text-[clamp(1.5rem,3.4vw,2.75rem)]'
                    }`}
                  >
                    D8XK <span className="text-white/45">92QF</span>
                  </p>
                  <p
                    className={`mt-2 leading-relaxed text-white/45 ${
                      compact ? 'text-[9px]' : 'text-[11px]'
                    }`}
                  >
                    Введите код в панели или отсканируйте QR
                  </p>
                </div>

                <QrMark className={compact ? 'w-16' : 'w-[27%] min-w-[88px] max-w-[148px]'} />
              </div>
            ) : (
              <div className="my-auto max-w-[15ch]">
                <p
                  className={`font-mono tracking-[0.1em] text-primary uppercase ${
                    compact ? 'text-[8px]' : 'text-[10px]'
                  }`}
                >
                  Сейчас
                </p>
                <p
                  className={`mt-2 leading-[1.02] font-medium tracking-[-0.03em] ${
                    compact ? 'text-[19px]' : 'text-[clamp(1.6rem,4vw,3rem)]'
                  }`}
                >
                  Летнее меню
                </p>
                <p
                  className={`mt-2 font-mono tracking-[0.06em] text-white/45 uppercase ${
                    compact ? 'text-[8px]' : 'text-[10px]'
                  }`}
                >
                  Завтрак · 09:00–12:00
                </p>
              </div>
            )}

            <div
              className={`flex items-center justify-between border-t border-white/10 pt-2 font-mono tracking-[0.1em] text-white/45 uppercase ${
                compact ? 'text-[7px]' : 'text-[9px]'
              }`}
            >
              <span>{pairing ? 'player / pairing' : 'плейлист / лето'}</span>
              <span>{pairing ? '8 знаков' : 'версия 42'}</span>
            </div>
          </div>
        </div>
      </Window>
    </div>
  )
}
