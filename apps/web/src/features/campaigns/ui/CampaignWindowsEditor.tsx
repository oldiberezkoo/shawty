'use client'

import { Button } from '@/components/ui/button'
import { minutesToTime, timeToMinutes, WEEKDAYS } from '../format'
import type { CampaignWindowView } from '../model'

/**
 * Окна показа.
 *
 * Пустой список означает «круглосуточно в срок действия». Снятие последнего
 * дня недопустимо: маска 0 означала бы «никогда», и оператор потерял бы и
 * окно, и способ его вернуть.
 */
export function CampaignWindowsEditor(props: {
  windows: CampaignWindowView[]
  onChange: (windows: CampaignWindowView[]) => void
}) {
  const { windows, onChange } = props

  const patchWindow = (index: number, patch: Partial<CampaignWindowView>) => {
    onChange(windows.map((window, position) => (position === index ? { ...window, ...patch } : window)))
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-text-muted">Окна показа</span>
        <Button
          size="sm"
          onClick={() =>
            onChange([
              ...windows,
              { daysOfWeek: 127, startMinute: 540, endMinute: 1080, timezoneSource: 'branch' },
            ])
          }
        >
          Добавить окно
        </Button>
      </div>

      {windows.map((window, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2 text-[13px]">
          <div className="flex items-center gap-1">
            {WEEKDAYS.map((day) => (
              <button
                key={day.bit}
                type="button"
                onClick={() => {
                  const next = window.daysOfWeek ^ day.bit
                  patchWindow(index, { daysOfWeek: next === 0 ? 127 : next })
                }}
                className={`h-7 w-7 border text-[12px] transition-colors ${
                  (window.daysOfWeek & day.bit) !== 0
                    ? 'border-text bg-text text-bg'
                    : 'border-border text-text-subtle hover:bg-surface-2'
                }`}
              >
                {day.short}
              </button>
            ))}
          </div>

          <input
            type="time"
            value={minutesToTime(window.startMinute)}
            onChange={(event) => patchWindow(index, { startMinute: timeToMinutes(event.target.value) })}
            className="h-8 border border-border bg-surface px-2 text-[13px] text-text"
          />
          <span className="text-text-subtle">—</span>
          <input
            type="time"
            value={minutesToTime(window.endMinute)}
            onChange={(event) => patchWindow(index, { endMinute: timeToMinutes(event.target.value) })}
            className="h-8 border border-border bg-surface px-2 text-[13px] text-text"
          />

          <Button size="sm" variant="ghost" onClick={() => onChange(windows.filter((_, position) => position !== index))}>
            Убрать
          </Button>
        </div>
      ))}
    </div>
  )
}
