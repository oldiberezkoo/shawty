/**
 * График замера.
 *
 * Полоска, а не «настоящий» график: нужно увидеть форму — ровная связь, провалы
 * или шум, — а не снять значение с оси. Точные числа стоят рядом текстом.
 *
 * Пустые точки пропускаются, а не рисуются нулём: ноль на графике пинга читался
 * бы как идеальная связь, хотя на самом деле замера просто не было.
 */
export function Sparkline({
  values,
  width = 240,
  height = 40,
  tone = 'primary',
  label,
}: {
  values: (number | null)[]
  width?: number
  height?: number
  tone?: 'primary' | 'warn'
  label?: string
}) {
  const points = values.map((value, index) => ({ value, index })).filter((point) => point.value !== null)

  if (points.length < 2) {
    return (
      <span className="text-[12px] text-text-subtle">
        {points.length === 0 ? 'Замеров пока нет' : 'Нужно минимум два замера для графика'}
      </span>
    )
  }

  const max = Math.max(...points.map((point) => point.value as number))
  const min = Math.min(...points.map((point) => point.value as number))
  const span = Math.max(1, max - min)
  const stepX = width / Math.max(1, values.length - 1)

  const path = points
    .map((point) => {
      const x = point.index * stepX
      const y = height - ((point.value as number) - min) / span * (height - 6) - 3
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const stroke = tone === 'warn' ? 'var(--warn)' : 'var(--primary)'

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label ?? `График: от ${min} до ${max}`}
      className="overflow-visible"
    >
      <polyline points={path} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((point) => {
        const x = point.index * stepX
        const y = height - ((point.value as number) - min) / span * (height - 6) - 3
        return <circle key={point.index} cx={x} cy={y} r="1.6" fill={stroke} />
      })}
    </svg>
  )
}
