import Link from 'next/link'
import type { ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'quiet'
type Size = 'sm' | 'md'

/**
 * Ссылка-действие лендинга.
 *
 * Это именно `next/link`, а не кнопка внутри ссылки: на странице нет
 * клиентских обработчиков, и вложенный интерактивный элемент только путал бы
 * фокус и семантику.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    'border border-primary bg-primary text-primary-text hover:border-primary-hover hover:bg-primary-hover',
  secondary:
    'border border-transparent bg-plate text-text hover:bg-plate-hover',
  quiet:
    'border border-border-strong bg-transparent text-text hover:border-text',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[10px]',
  md: 'h-10 px-4 text-[11px]',
}

export function LandingCta({
  href,
  children,
  variant = 'primary',
  size = 'md',
  className = '',
}: {
  href: string
  children: ReactNode
  variant?: Variant
  size?: Size
  className?: string
}) {
  return (
    <Link
      href={href}
      className={`pressable inline-flex shrink-0 items-center justify-center gap-2 font-mono leading-none tracking-[0.08em] whitespace-nowrap uppercase transition-colors ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {children}
    </Link>
  )
}
