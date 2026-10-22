'use client'

import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { formatDay, formatTime, zoneLabel } from '../format'
import type { Preview } from '../model'

/** Полоска недели с отрезками разных кампаний. */
export function ScheduleTimeline(props: { preview: Preview }) {
  const { preview } = props
  const from = new Date(preview.from).getTime()
  const to = new Date(preview.to).getTime()
  const span = Math.max(1, to - from)
  const zone = preview.screen.timezone

  const position = (value: string) => ((new Date(value).getTime() - from) / span) * 100

  return (
    <Card>
      <CardHeader
        title={`Календарь: ${preview.screen.screenName}`}
        description={`${formatDay(preview.from, zone)} — ${formatDay(preview.to, zone)} · ${zoneLabel(zone, preview.screen.timezoneSource)}`}
      />
      <CardBody className="flex flex-col gap-3">
        <div className="relative h-9 overflow-hidden border border-border bg-surface-2">
          {preview.segments.map((segment, index) => {
            const left = position(segment.from)
            const right = position(segment.to)

            return (
              <div
                key={index}
                title={`${formatTime(segment.from, zone)} — ${formatTime(segment.to, zone)}`}
                className={`absolute top-0 h-full border-r border-border ${
                  segment.campaignId ? 'bg-primary/70' : 'bg-surface-3'
                }`}
                style={{ left: `${Math.max(0, left)}%`, width: `${Math.max(0.4, right - left)}%` }}
              />
            )
          })}
        </div>

        <div className="flex flex-wrap gap-3 text-[12px] text-text-subtle">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 bg-primary/70" />
            кампания
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 border border-border bg-surface-3" />
            постоянная программа
          </span>
        </div>

        <div className="flex justify-between text-[12px] text-text-subtle">
          {Array.from({ length: 8 }).map((_, index) => (
            <span key={index}>{formatDay(new Date(from + (span * index) / 7).toISOString(), zone)}</span>
          ))}
        </div>

        <div className="flex flex-col gap-1 border-t border-border pt-3 text-[13px]">
          <span className="text-[12px] text-text-muted">Кампании на этом экране</span>
          {preview.campaigns.length === 0 ? (
            <span className="text-text-subtle">Активных кампаний нет: идёт постоянная программа.</span>
          ) : (
            preview.campaigns.map((campaign) => (
              <div key={campaign.campaignId} className="text-text-muted">
                <span className="font-medium text-text">{campaign.name}</span> · приоритет {campaign.priority} ·{' '}
                {campaign.intervals.length === 0
                  ? 'в этом горизонте не показывается'
                  : campaign.intervals
                      .slice(0, 6)
                      .map((interval) => `${formatTime(interval.start, zone)}–${formatTime(interval.end, zone)}`)
                      .join(', ')}
              </div>
            ))
          )}
        </div>

        <p className="text-[12px] text-text-subtle">
          Следующая смена: {formatTime(preview.nextChangeAt, zone)}. Плеер узнаёт её заранее и готовит публикацию до
          переключения — экран не гаснет в момент смены рекламы.
        </p>
      </CardBody>
    </Card>
  )
}
