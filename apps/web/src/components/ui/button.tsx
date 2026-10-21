import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
type Size = 'sm' | 'md' | 'lg'

/**
 * Кнопка.
 *
 * Три состояния по важности, а не пять по цвету. Основное действие на экране
 * должно быть ровно одно — иначе взгляд не знает, куда нажать. Вторичные
 * действия уходят в приглушённый вид, опасные — подтверждением.
 *
 * У основной кнопки есть собственная тень: на белом фоне синяя плашка и без
 * неё читается, но тень отделяет её от страницы в тот момент, когда кнопка
 * стоит рядом с карточкой того же цвета.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-text border border-transparent shadow-[0_1px_2px_rgb(70_95_255_/_0.28)] hover:bg-primary-hover active:bg-primary',
  secondary:
    'bg-surface text-text border border-border-strong shadow-[var(--shadow-xs)] hover:bg-surface-2 active:bg-surface-3',
  ghost: 'bg-transparent text-text-muted border border-transparent hover:bg-surface-2 hover:text-text',
  danger: 'bg-danger-bg text-danger border border-danger-border hover:bg-danger-bg/75 active:bg-danger-bg',
  link: 'bg-transparent text-text border border-transparent underline underline-offset-4 hover:text-text-muted p-0 h-auto',
}

const SIZES: Record<Size, string> = {
  // Минимальная высота 32px — минимум для попадания пальцем на телефоне.
  sm: 'h-8 px-3 text-[12.5px] gap-1.5 rounded-[var(--radius-sm)]',
  md: 'h-10 px-4 text-[13px] gap-2 rounded-[var(--radius-md)]',
  lg: 'h-11 px-5 text-[13.5px] gap-2 rounded-[var(--radius-md)]',
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  children?: ReactNode
}

/**
 * Базовая кнопка. Собственная реализация вместо готовой библиотеки: нужен
 * один согласованный набор состояний, а Base UI не покрывает кнопки.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 select-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-1 focus-visible:ring-offset-bg focus-visible:outline-none active:translate-y-px disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  )
}

/**
 * Значок в кнопке.
 *
 * Отдельный слот, чтобы иконка не прыгала при загрузке: у кнопки с иконкой
 * ширина фиксирована, и текст перестаёт смещаться в момент нажатия.
 */
export function ButtonIcon({ children }: { children: ReactNode }) {
  return <span className="-ml-0.5 flex size-4 shrink-0 items-center justify-center">{children}</span>
}
