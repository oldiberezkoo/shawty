import {
  Activity,
  CalendarClock,
  Folder,
  Megaphone,
  MonitorSmartphone,
} from 'lucide-react'
import { Mark } from '@/components/visual/mark'
import { Window } from '@/components/visual/window'

const NAV = [
  { icon: MonitorSmartphone, label: 'Экраны', active: true },
  { icon: Folder, label: 'Медиа', active: false },
  { icon: Megaphone, label: 'Кампании', active: false },
  { icon: CalendarClock, label: 'Расписание', active: false },
  { icon: Activity, label: 'Мониторинг', active: false },
]

const SCREENS = [
  { name: 'Витрина · вход', state: 'подтверждён', online: true, accent: true },
  { name: 'Зал · меню', state: 'синхронизация', online: true, accent: false },
  { name: 'Кухня · очередь', state: 'нет связи', online: false, accent: false },
]

/**
 * Макет панели для hero.
 *
 * Показывает ровно те сущности, которые есть в продукте: сеть экранов,
 * состояние устройства и текущую кампанию. Внутри нет кнопок и ссылок —
 * это картинка с ролью `img`, а не второй интерфейс на странице.
 */
export function DashboardMock({ className = '' }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Макет панели SHAWTY: список экранов по филиалам, статусы связи и подтверждённая кампания «Летнее меню»."
      className={className}
    >
      <Window
        tag="SHAWTY"
        title="dashboard / screens"
        bodyClassName="p-0"
        className="[&>div:first-child]:py-2"
      >
        <div className="flex min-h-[286px]">
          <aside className="hidden w-[108px] shrink-0 flex-col border-r border-border bg-surface-rail px-2 py-3 sm:flex">
            <div className="mb-4 flex items-center gap-1.5 px-1.5 font-mono text-[8px] tracking-[0.12em] text-text-subtle uppercase">
              <Mark size={9} className="text-primary" />
              <span translate="no">SHAWTY</span>
            </div>

            <div className="flex flex-col gap-0.5">
              {NAV.map((item) => {
                const Icon = item.icon

                return (
                  <span
                    key={item.label}
                    className={`flex items-center gap-1.5 px-1.5 py-1.5 font-mono text-[8px] tracking-[0.04em] uppercase ${
                      item.active
                        ? 'border-l-2 border-primary bg-surface-2 text-text'
                        : 'text-text-subtle'
                    }`}
                  >
                    <Icon className="size-2.5" strokeWidth={1.7} />
                    {item.label}
                  </span>
                )
              })}
            </div>

            <div className="mt-auto border-t border-border px-1.5 pt-2 font-mono text-[7px] leading-relaxed tracking-[0.06em] text-text-subtle uppercase">
              Start
              <br />
              5 экранов
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
              <div className="min-w-0">
                <p className="section-title">Экраны</p>
                <p className="mt-1 truncate font-mono text-[8px] text-text-subtle">
                  5 экранов · 2 филиала
                </p>
              </div>
              <span className="bg-primary px-1.5 py-1 font-mono text-[7px] tracking-[0.06em] text-primary-text uppercase">
                Подключить
              </span>
            </div>

            <div className="grid grid-cols-3 gap-px border-b border-border bg-border">
              {[
                { label: 'Всего', value: '5' },
                { label: 'На связи', value: '4' },
                { label: 'В синхро', value: '1' },
              ].map((metric) => (
                <div key={metric.label} className="bg-bg px-3 py-2.5">
                  <p className="font-mono text-[7px] tracking-[0.08em] text-text-subtle uppercase">
                    {metric.label}
                  </p>
                  <p className="mt-1 font-mono text-[19px] leading-none tracking-[-0.04em] text-text">
                    {metric.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="px-3 py-2">
              <div className="mb-1 flex items-center justify-between font-mono text-[7px] tracking-[0.08em] text-text-subtle uppercase">
                <span>Экран</span>
                <span>Состояние</span>
              </div>

              <div className="flex flex-col">
                {SCREENS.map((screen) => (
                  <div
                    key={screen.name}
                    className={`flex items-center justify-between gap-3 border-t border-border px-0.5 py-2 ${
                      screen.accent ? 'border-l-2 border-l-primary pl-2' : ''
                    }`}
                  >
                    <span className="truncate text-[10px] text-text">{screen.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5 font-mono text-[7px] tracking-[0.04em] text-text-subtle uppercase">
                      <i
                        className={`size-1.5 ${
                          screen.online
                            ? screen.state === 'подтверждён'
                              ? 'bg-text'
                              : 'border border-text-subtle'
                            : 'border border-dashed border-text-subtle'
                        }`}
                      />
                      {screen.state}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mx-3 mb-3 flex items-center justify-between gap-2 border border-border bg-surface px-2.5 py-2">
              <div className="min-w-0">
                <p className="font-mono text-[7px] tracking-[0.08em] text-text-subtle uppercase">
                  Кампания
                </p>
                <p className="mt-0.5 truncate text-[10px] text-text">Летнее меню</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-[7px] tracking-[0.04em] text-text-subtle uppercase">
                  09:00–23:00
                </p>
                <p className="mt-1 flex items-center justify-end gap-1 font-mono text-[7px] tracking-[0.04em] text-text uppercase">
                  <i className="size-1.5 bg-primary" />
                  Принято
                </p>
              </div>
            </div>
          </div>
        </div>
      </Window>
    </div>
  )
}
