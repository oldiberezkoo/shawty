const SIZE = 21

/**
 * Рисунок QR для макета плеера.
 *
 * Это не настоящий код привязки: сканировать его бессмысленно. Форма нужна,
 * чтобы интерфейс читался как экран привязки, а не как пустой квадрат.
 * Детерминированная сетка исключает расхождение серверной и клиентской
 * разметки.
 */
function isFinderCell(x: number, y: number): boolean | null {
  const inTopLeft = x < 7 && y < 7
  const inTopRight = x >= SIZE - 7 && y < 7
  const inBottomLeft = x < 7 && y >= SIZE - 7

  if (!inTopLeft && !inTopRight && !inBottomLeft) return null

  const localX = inTopRight ? x - (SIZE - 7) : x
  const localY = inBottomLeft ? y - (SIZE - 7) : y

  const ring = localX === 0 || localX === 6 || localY === 0 || localY === 6
  const core = localX >= 2 && localX <= 4 && localY >= 2 && localY <= 4

  return ring || core
}

function buildModules(): boolean[] {
  const modules: boolean[] = []
  let seed = 0x5a17

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const finder = isFinderCell(x, y)

      if (finder !== null) {
        modules.push(finder)
        continue
      }

      const inQuietZone =
        (x < 8 && y < 8) ||
        (x >= SIZE - 8 && y < 8) ||
        (x < 8 && y >= SIZE - 8)

      if (inQuietZone) {
        modules.push(false)
        continue
      }

      // Верхняя и левая линии синхронизации — узнаваемая деталь QR.
      if (x === 6 || y === 6) {
        modules.push((x + y) % 2 === 0)
        continue
      }

      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      modules.push((seed & 7) > 3)
    }
  }

  return modules
}

const MODULES = buildModules()

export function QrMark({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`grid aspect-square grid-cols-[repeat(21,minmax(0,1fr))] gap-px bg-white p-1 ${className}`}
    >
      {MODULES.map((on, index) => (
        <span key={index} className={on ? 'bg-[#0a0a0a]' : 'bg-white'} />
      ))}
    </div>
  )
}
