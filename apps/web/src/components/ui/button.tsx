import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
type Size = 'sm' | 'md' | 'lg'

/**
 * Кнопка.
 *
 * Три состояния по важности, а не пять по цвету. Основное действие на экране
 * должно быть ровно одно — иначе взгляд не знает, куда нажать. Вторичные
 * действия уходят в тёмную плиту, опасные — в инверсию: белая плашка на
 * near-black заметнее розовой и не спорит с акцентом.
 *
 * Текст кнопки — mono-капс. Это «обслуживающий» слой интерфейса, и он
 * отделяет действие от содержимого без рамок и теней.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    'border border-primary bg-primary text-primary-text hover:border-primary-hover hover:bg-primary-hover active:bg-primary',
  secondary:
    'border border-transparent bg-plate text-text hover:bg-plate-hover active:bg-plate',
  ghost:
    'border border-transparent bg-transparent text-text-muted hover:bg-surface-2 hover:text-text active:bg-surface-3',
  danger:
    'border border-text bg-text text-bg hover:border-text-muted hover:bg-text-muted active:bg-text',
  link: 'h-auto border-0 bg-transparent p-0 text-text underline decoration-border-strong underline-offset-4 hover:text-primary hover:decoration-primary',
}

const SIZES: Record<Size, string> = {
  // Минимальная высота 32px — минимум для попадания пальцем на телефоне.
  sm: 'h-8 px-3 text-[10.5px] gap-1.5',
  md: 'h-10 px-4 text-[11px] gap-2',
  lg: 'h-11 px-5 text-[11.5px] gap-2',
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
      className={`inline-flex shrink-0 items-center justify-center font-mono font-normal tracking-[0.08em] whitespace-nowrap uppercase transition-[background-color,border-color,color] duration-150 select-none disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
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
  return <span className="-ml-0.5 flex size-3.5 shrink-0 items-center justify-center">{children}</span>
}
