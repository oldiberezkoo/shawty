import { ICONS, bitmapPath, type IconName } from './bitmaps'

/**
 * Пиксельная иконка 9×9.
 *
 * Используется там, где иконка — часть бренда или состояния (пустые экраны,
 * декор, списки возможностей). Функциональные иконки действий остаются
 * линейными: у пиксельной формы нет узнаваемых мелких деталей, а на кнопке
 * важнее смысл, чем стиль.
 */
export function PixelIcon({
  name,
  size = 18,
  className = '',
  title,
}: {
  name: IconName
  size?: number
  className?: string
  title?: string
}) {
  return (
    <svg
      viewBox="0 0 9 9"
      width={size}
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
      <path d={bitmapPath(ICONS[name])} />
    </svg>
  )
}
