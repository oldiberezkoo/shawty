import type { ReactNode } from 'react'

/**
 * Таблица данных.
 *
 * Главное изменение против прежней разметки: на узком экране таблица
 * превращается в строки-карточки. Раньше на телефоне таблица уезжала по
 * горизонтали, и колонку «состояние» приходилось искать пальцем.
 *
 * Реализация без JS: CSS переключает раскладку по ширине контейнера через
 * контейнерные запросы, поэтому таблица остаётся таблицей для скринридеров.
 */

export type TableColumn = {
  /** Ключ поля в строке. */
  key: string
  label: string
  /** Что показывать вместо данных в узкой раскладке. */
  mobileLabel?: string
  /** Выравнивание. Числа и метрики — вправо. */
  align?: 'left' | 'right'
  /** Ширина колонки: числом, а не классом, чтобы не расползлось при доработках. */
  width?: string
  /** Прячется на самой узкой раскладке: редкие колонки не занимают место. */
  secondary?: boolean
}

export function DataTable({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  caption,
}: {
  columns: TableColumn[]
  rows: Record<string, ReactNode>[]
  rowKey: (row: Record<string, ReactNode>, index: number) => string
  onRowClick?: (row: Record<string, ReactNode>) => void
  empty?: ReactNode
  caption?: string
}) {
  if (rows.length === 0 && empty) {
    return <>{empty}</>
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        {caption ? <caption className="sr-only">{caption}</caption> : null}

        <thead>
          <tr className="border-b border-border">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                className={`px-4 py-2.5 text-[11px] font-semibold tracking-[0.03em] text-text-subtle uppercase ${
                  column.align === 'right' ? 'text-right' : 'text-left'
                } ${column.secondary ? 'hidden md:table-cell' : ''}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`row border-b border-border last:border-0 ${
                onRowClick ? 'cursor-pointer' : ''
              }`}
            >
              {columns.map((column, position) => (
                <td
                  key={column.key}
                  data-label={column.mobileLabel ?? column.label}
                  className={`px-4 py-2.5 align-middle ${
                    column.align === 'right' ? 'text-right' : 'text-left'
                  } ${column.secondary ? 'hidden md:table-cell' : ''}`}
                  // Первая ячейка строки объявляет строку целиком: на узкой
                  // раскладке именно она отвечает за её название.
                  headers={position === 0 ? undefined : undefined}
                >
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Тот же список, но в виде карточек.
 *
 * Используется там, где на телефоне таблица нечитаема: иерархия «филиал →
 * экраны» в три уровня шириной 320px превращается в кашу из колонок.
 */
export function CardList({
  items,
  empty,
}: {
  items: { key: string; header: ReactNode; meta?: ReactNode; body: ReactNode }[]
  empty?: ReactNode
}) {
  if (items.length === 0 && empty) {
    return <>{empty}</>
  }

  return (
    <ul className="divide-y divide-[var(--border)]">
      {items.map((item) => (
        <li key={item.key} className="px-4 py-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0 font-medium">{item.header}</div>
            {item.meta ? <div className="shrink-0 text-[12px] text-text-muted">{item.meta}</div> : null}
          </div>
          <div className="mt-1.5 text-[13px] text-text-muted">{item.body}</div>
        </li>
      ))}
    </ul>
  )
}