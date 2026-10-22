'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/card'
import { formatTime, zoneLabel } from '../format'
import type { ScreenSchedule } from '../model'

/** Таблица экранов с текущей программой и состоянием публикации. */
export function ScheduleTable(props: {
  screens: ScreenSchedule[]
  selectedId: string | null
  picked: Set<string>
  onSelect: (screenId: string) => void
  onTogglePicked: (screenId: string) => void
  onToggleAll: () => void
}) {
  const allPicked = props.screens.length > 0 && props.picked.size === props.screens.length

  return (
    <Card>
      <CardHeader
        title="Что и когда идёт на экранах"
        description="Расписание считает сервер. «Ожидает смены» значит, что программа по расписанию отличается от выложенной — публикацию выпустит насос расписания в ближайшие секунды. Отметьте экраны, чтобы назначить или снять программу сразу нескольким. Окна по дням и часам задаются кампанией: выберите экран ниже и откройте «Кампании»."
        action={
          <Link href="/dashboard/campaigns">
            <Button size="sm">Кампании и окна показа</Button>
          </Link>
        }
      />
      <CardBody className="p-0">
        <div className="@container w-full overflow-x-auto">
          <table className="stack-table w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-text-subtle">
                <th className="w-10 px-5 py-2.5 font-normal">
                  <input
                    type="checkbox"
                    aria-label="Выбрать все экраны"
                    checked={allPicked}
                    onChange={props.onToggleAll}
                    className="size-4 cursor-pointer accent-[var(--primary)]"
                  />
                </th>
                <th className="px-5 py-2.5">Экран</th>
                <th className="px-5 py-2.5">Сейчас идёт</th>
                <th className="px-5 py-2.5">Источник</th>
                <th className="px-5 py-2.5">Смена программы</th>
                <th className="px-5 py-2.5 text-right">Состояние</th>
              </tr>
            </thead>
            <tbody>
              {props.screens.map((screen) => (
                <tr
                  key={screen.screenId}
                  onClick={() => props.onSelect(screen.screenId)}
                  className={`cursor-pointer border-b border-border last:border-0 ${
                    screen.screenId === props.selectedId ? 'bg-surface-2' : ''
                  }`}
                >
                  <td className="px-5 py-2">
                    <input
                      type="checkbox"
                      checked={props.picked.has(screen.screenId)}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => props.onTogglePicked(screen.screenId)}
                      aria-label={`Выбрать ${screen.screenName}`}
                      className="size-4 cursor-pointer accent-[var(--primary)]"
                    />
                  </td>
                  <td data-primary className="px-5 py-2">
                    <div className="font-medium">{screen.screenName}</div>
                    <div className="text-[12px] text-text-subtle">{zoneLabel(screen.timezone, screen.timezoneSource)}</div>
                  </td>
                  <td data-label="Сейчас идёт" className="px-5 py-2">
                    {screen.playlist ? (
                      <>
                        <div>
                          {screen.campaignName ?? 'постоянная программа'}
                          {screen.playlist ? ` · ${screen.playlist.name} в.${screen.playlist.version}` : ''}
                        </div>
                        {screen.fallbackPlaylist ? (
                          <div className="text-[12px] text-text-subtle">
                            запасной: {screen.fallbackPlaylist.name} в.{screen.fallbackPlaylist.version}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-text-subtle">ничего не назначено</span>
                    )}
                  </td>
                  <td data-label="Источник" className="px-5 py-2 text-text-muted">
                    {screen.chain.length === 0 ? (
                      <span className="text-text-subtle">только постоянная программа</span>
                    ) : (
                      screen.chain.map((entry, index) => (
                        <div key={entry.campaignId}>
                          {index + 1}. {entry.campaignName}
                        </div>
                      ))
                    )}
                  </td>
                  <td data-label="Смена программы" className="px-5 py-2 text-text-muted">
                    {formatTime(screen.nextChangeAt, screen.timezone)}
                  </td>
                  <td data-label="Состояние" className="tnum px-5 py-2 text-right">
                    {screen.needsChange ? (
                      <span className="text-warn">ожидает смены</span>
                    ) : screen.appliedVersion != null ? (
                      <span className="text-success">применено</span>
                    ) : (
                      <span className="text-text-subtle">не публиковалось</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {props.screens.length === 0 ? (
          <EmptyState
            title="Экранов пока нет"
            hint="Расписание считается для конкретных экранов: пока их нет, показать нечего. Подключите первый — и здесь появится, что и когда на нём идёт."
            action={
              <Link href="/pair">
                <Button size="sm" variant="primary">
                  Подключить экран
                </Button>
              </Link>
            }
          />
        ) : null}
      </CardBody>
    </Card>
  )
}
