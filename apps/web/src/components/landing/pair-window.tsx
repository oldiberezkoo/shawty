import { Window } from '@/components/visual/window'

/**
 * Парная половина сцены привязки: панель, куда вводят код с телевизора.
 *
 * Это макет, а не форма. Поэтому внутри нет кнопок и полей: страница не должна
 * притворяться, что ввод здесь уже работает.
 */
export function PairWindow({ className = '' }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Макет панели SHAWTY: форма привязки экрана с кодом D8XK 92QF."
      className={className}
    >
      <Window tag="SHAWTY" title="pair / screen" bodyClassName="p-4">
        <p className="section-title">Код с экрана</p>

        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {['D', '8', 'X', 'K', '9', '2', 'Q', 'F'].map((char, index) => (
            <span
              key={`${char}-${index}`}
              className="flex h-8 items-center justify-center border border-border-strong bg-field font-mono text-[13px] text-text"
            >
              {char}
            </span>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="font-mono text-[9px] tracking-[0.08em] text-text-subtle uppercase">
            Филиал
          </span>
          <span className="truncate text-[12px] text-text">Витрина · вход</span>
        </div>

        <div className="mt-3 flex h-9 items-center justify-center bg-primary font-mono text-[10px] tracking-[0.08em] text-primary-text uppercase">
          Привязать
        </div>

        <p className="mt-2 font-mono text-[9px] leading-relaxed tracking-[0.04em] text-text-subtle">
          Код одноразовый. После привязки экран получит ключи.
        </p>
      </Window>
    </div>
  )
}
