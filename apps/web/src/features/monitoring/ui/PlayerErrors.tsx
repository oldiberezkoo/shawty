'use client'

import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { formatTime } from '../format'
import type { PlayerError } from '../model'

/** Ошибки воспроизведения: сеть жива, но материал не грузится. */
export function PlayerErrors(props: { rows: PlayerError[] }) {
  if (props.rows.length === 0) return null

  return (
    <Card>
      <CardHeader
        title="Ошибки воспроизведения"
        description="Что не смог показать плеер. Ошибка файла — это не простой: сеть жива, но материал не грузится."
      />
      <CardBody className="p-0">
        <div className="@container w-full overflow-x-auto">
          <table className="stack-table w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-text-subtle">
                <th className="px-5 py-2 font-normal">Когда</th>
                <th className="px-5 py-2 font-normal">Код</th>
                <th className="px-5 py-2 font-normal">Сообщение плеера</th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row, index) => (
                <tr key={index} className="border-b border-border last:border-0">
                  <td data-primary className="w-32 px-5 py-2 text-text-subtle">{formatTime(row.at)}</td>
                  <td data-label="Код" className="w-32 px-5 py-2 text-danger">{row.code}</td>
                  <td data-label="Сообщение плеера" className="px-5 py-2 text-text-muted">{row.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  )
}
