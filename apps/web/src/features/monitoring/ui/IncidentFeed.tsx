'use client'

import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { formatSilence, formatTime, INCIDENT_LABEL, INCIDENT_TONE } from '../format'
import type { FeedItem } from '../model'

/** Лента инцидентов в порядке, когда они произошли. */
export function IncidentFeed(props: { items: FeedItem[] }) {
  return (
    <Card>
      <CardHeader title="Лента событий" description="Простой, возврат, потеря привязки и отзыв доступа — в порядке, когда они произошли." />
      <CardBody className="p-0">
        {props.items.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-text-subtle">
            Событий пока нет. Это хороший знак: значит, сеть не теряла экраны.
          </p>
        ) : (
          <div className="@container w-full overflow-x-auto">
            <table className="stack-table w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-text-subtle">
                  <th className="px-5 py-2 font-normal">Когда</th>
                  <th className="px-5 py-2 font-normal">Что произошло</th>
                  <th className="px-5 py-2 font-normal">Экран</th>
                  <th className="px-5 py-2 font-normal">Подробности</th>
                </tr>
              </thead>
              <tbody>
                {props.items.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td data-primary className="w-32 px-5 py-2 text-text-subtle">{formatTime(item.openedAt)}</td>
                    <td data-label="Что произошло" className={`px-5 py-2 ${INCIDENT_TONE[item.type] ?? 'text-text-muted'}`}>
                      {INCIDENT_LABEL[item.type] ?? item.type}
                    </td>
                    <td data-label="Экран" className="px-5 py-2 font-medium">{item.screenName}</td>
                    <td data-label="Подробности" className="px-5 py-2 text-text-muted">
                      {item.detail ?? '—'}
                      {item.durationMs !== null && item.type === 'offline' ? (
                        <span className="ml-2 text-text-subtle">
                          {item.closedAt ? `(${formatSilence(Math.round(item.durationMs / 1000))})` : '(идёт)'}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
