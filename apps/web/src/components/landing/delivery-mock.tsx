import { Window } from '@/components/visual/window'

const EVENTS = [
  { time: '10:00:01', source: 'версия', text: '42 назначена на «Витрина · вход»' },
  { time: '10:00:03', source: 'экран', text: 'файл 06.mp4 · 148 МБ скачан' },
  { time: '10:00:04', source: 'экран', text: 'программа принята в очередь' },
  { time: '10:00:05', source: 'панель', text: 'статус обновлён' },
]

/**
 * Журнал доставки.
 *
 * Времена и имена здесь — пример, а не данные работающей сети. Подпись под
 * окном говорит об этом прямо: лендинг не должен выдавать демонстрационный
 * журнал за живой мониторинг.
 */
export function DeliveryMock({ className = '' }: { className?: string }) {
  return (
    <div className={className}>
      <Window tag="SHAWTY" title="events / delivery" bodyClassName="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="section-title">Доставка</p>
            <p className="mt-1 font-mono text-[9px] text-text-subtle">кампания / летнее меню</p>
          </div>
          <span className="font-mono text-[9px] tracking-[0.08em] text-text-subtle uppercase">
            v42
          </span>
        </div>

        <div className="divide-y divide-border">
          {EVENTS.map((event) => (
            <div
              key={`${event.time}-${event.text}`}
              className="grid grid-cols-[4.25rem_3.5rem_minmax(0,1fr)] items-start gap-3 px-4 py-2.5"
            >
              <span className="font-mono text-[9px] leading-relaxed text-text-subtle">
                {event.time}
              </span>
              <span className="font-mono text-[8px] leading-relaxed tracking-[0.06em] text-text-subtle uppercase">
                {event.source}
              </span>
              <span className="text-[11px] leading-relaxed text-text">{event.text}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
          <span className="font-mono text-[9px] tracking-[0.08em] text-text-subtle uppercase">
            Итог
          </span>
          <span className="flex items-center gap-2 font-mono text-[9px] tracking-[0.06em] text-text uppercase">
            <i className="size-2 bg-primary" />
            Принято экраном
          </span>
        </div>
      </Window>

      <p className="mt-3 font-mono text-[9px] tracking-[0.06em] text-text-subtle uppercase">
        Пример журнала доставки
      </p>
    </div>
  )
}
