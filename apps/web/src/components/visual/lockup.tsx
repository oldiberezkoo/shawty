import { Mark } from './mark'

/**
 * Бренд-блок.
 *
 * Знак, слово на акцентной плите и служебный чип. Плита — единственное место,
 * где акцент занимает площадь: в интерфейсе он остаётся меткой, а не фоном.
 */
export function Lockup({
  size = 20,
  chip = 'BY SHAWTY',
  tag = 'SHAWTY',
}: {
  size?: number
  chip?: string | null
  tag?: string
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <Mark size={size} className="shrink-0 text-primary" />

      <span
        translate="no"
        className="bg-primary px-[5px] py-px font-sans text-[16px] leading-[1.2] font-medium tracking-[-0.01em] text-primary-text uppercase"
      >
        {tag}
      </span>

      {chip ? (
        <span className="hidden bg-surface-3 px-1.5 py-1 font-mono text-[10px] leading-none tracking-[0.08em] text-text-subtle uppercase sm:inline-block">
          {chip}
        </span>
      ) : null}
    </span>
  )
}
