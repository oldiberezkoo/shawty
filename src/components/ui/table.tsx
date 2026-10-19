import type { ReactNode } from 'react'

/**
 * Таблица данных.
 *
 * Главное здесь — адаптация. Таблица переключается на карточки, когда
 * **контейнер** становится узким, а не когда окно браузера: панель занимает
 * часть ширины на широком мониторе, и таблица внутри неё точно так же не
 * помещается, как на телефоне. Проверка по окну в этой ситуации врала бы.
 *
 * Реализация без JavaScript: разметка таблицы остаётся таблицей, поэтому
 * скринридер по-прежнему читает строку как строку. Сворачивание — это стили,
 * а не подмена `<table>` на `<div>`.
 *
 * Класс `stack-table` разворачивается в `globals.css`: правила контейнерных
 * запросов не пишутся в разметке, потому что относятся сразу ко всем
 * экземплярам таблицы и их копирование приводит к расхождению.
 */

export type TableColumn = {
  /** Ключ поля в строке. */
  key: string
  label: string
  /**
   * Первая колонка. На узкой раскладке её подпись не выводится: она сама
   * становится названием строки, и повторять её над значением незачем.
   */
  primary?: boolean
  align?: 'left' | 'right'
  /** Ширина колонки. Числом, а не классом, чтобы не расползлось при доработках. */
  width?: string
  /** Прячется на самой узкой раскладке: редкая колонка не должна мешать. */
  secondary?: boolean
}

export type TableRow = Record<string, ReactNode>

export function DataTable({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  caption,
}: {
  columns: TableColumn[]
  rows: TableRow[]
  rowKey: (row: TableRow, index: number) => string
  onRowClick?: (row: TableRow) => void
  empty?: ReactNode
  caption?: string
}) {
  if (rows.length === 0 && empty) {
    return <>{empty}</>
  }

  return (
    <div className="@container w-full overflow-x-auto">
      <table className="stack-table w-full border-collapse text-[13px]">
        {caption ? <caption className="sr-only">{caption}</caption> : null}

        <thead>
          <tr className="border-b border-border">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                className={`px-5 py-2.5 text-[10.5px] font-semibold tracking-[0.06em] text-text-subtle uppercase ${
                  column.align === 'right' ? 'text-right' : 'text-left'
                }`}
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
              className={`row border-b border-border last:border-0 ${onRowClick ? 'cursor-pointer' : ''}`}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  data-label={column.label}
                  data-primary={column.primary ? '' : undefined}
                  data-secondary={column.secondary ? '' : undefined}
                  className={`px-5 py-3 align-middle ${
                    column.align === 'right' ? 'text-right' : 'text-left'
                  }`}
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
 * Список-карточки.
 *
 * Отдельный компонент там, где таблица нечитаема в любой раскладке: иерархия
 * «филиал → группа → экран» в три уровня на ширине 320px превращается в кашу
 * из колонок, и сворачивать её некуда.
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
        <li key={item.key} className="px-5 py-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div className="min-w-0 font-medium">{item.header}</div>
            {item.meta ? <div className="shrink-0 text-[12px] text-text-muted">{item.meta}</div> : null}
          </div>
          <div className="mt-1.5 text-[13px] text-text-muted">{item.body}</div>
        </li>
      ))}
    </ul>
  )
}