import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-text hover:bg-primary-hover border border-transparent',
  secondary:
    'bg-surface text-text border border-border hover:bg-surface-2 hover:border-border-strong',
  ghost: 'bg-transparent text-text-muted border border-transparent hover:bg-surface-2 hover:text-text',
  danger: 'bg-danger text-white border border-transparent hover:opacity-90',
  link: 'bg-transparent text-text border border-transparent underline underline-offset-4 hover:text-text-muted p-0 h-auto',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-[var(--radius-sm)]',
  md: 'h-9 px-4 text-sm gap-2 rounded-[var(--radius-md)]',
  lg: 'h-11 px-6 text-[15px] gap-2 rounded-[var(--radius-md)]',
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
      className={`inline-flex items-center justify-center font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  )
}
