import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
type Size = 'sm' | 'md' | 'lg'

/**
 * Кнопка.
 *
 * Три состояния по важности, а не пять по цвету. Основное действие на экране
 * должно быть ровно одно — иначе взгляд не знает, куда нажать. Вторичные
 * действия уходят в приглушённый вид, опасные — подтверждением.
 */
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-text border border-transparent hover:bg-primary-hover',
  secondary:
    'bg-surface text-text border border-border hover:bg-surface-2 hover:border-border-strong active:bg-surface-3',
  ghost: 'bg-transparent text-text-muted border border-transparent hover:bg-surface-2 hover:text-text',
  danger: 'bg-transparent text-danger border border-danger-border hover:bg-danger-bg',
  link: 'bg-transparent text-text border border-transparent underline underline-offset-4 hover:text-text-muted p-0 h-auto',
}

const SIZES: Record<Size, string> = {
  // Минимальная высота 32px — минимум для попадания пальцем на телефоне.
  sm: 'h-8 px-2.5 text-[13px] gap-1.5 rounded-[var(--radius-sm)]',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-[var(--radius-md)]',
  lg: 'h-10 px-5 text-[15px] gap-2 rounded-[var(--radius-md)]',
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
      className={`inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors duration-100 disabled:pointer-events-none disabled:opacity-45 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
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