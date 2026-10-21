import { MARK, bitmapPath } from './bitmaps'

/**
 * Знак продукта.
 *
 * Кристалл рисуется одним path: цвет наследуется от `currentColor`, поэтому
 * в интерфейсе он акцентный, а на тёмной плите — чёрный.
 */
export function Mark({
  size = 20,
  className = '',
  title,
}: {
  size?: number
  className?: string
  title?: string
}) {
  return (
    <svg
      viewBox="0 0 7 10"
      width={(size * 7) / 10}
      height={size}
      fill="currentColor"
      shapeRendering="crispEdges"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path d={bitmapPath(MARK)} />
    </svg>
  )
}
