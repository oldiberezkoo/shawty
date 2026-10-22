'use client'

import { Card, CardBody } from '@/components/ui/card'
import type { DeliverySummaryView } from '../model'

function NumberTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  const toneClass: Record<string, string> = {
    default: 'text-text',
    success: 'text-success',
    warn: 'text-warn',
    info: 'text-info',
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-2">
        <span className="section-title">{label}</span>
        <span className={`tnum font-mono text-[30px] leading-none font-normal tracking-[-0.03em] ${toneClass[tone] ?? ''}`}>{value}</span>
      </CardBody>
    </Card>
  )
}

/** Четыре числа доставки и предупреждение об отказах. */
export function DeliveryStats(props: { summary: DeliverySummaryView }) {
  const { summary } = props
  const failed = summary.failed ?? 0

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <NumberTile label="Отправлено" value={summary.sent} tone="default" />
        <NumberTile label="Применили" value={summary.applied} tone="success" />
        <NumberTile label="Загружают" value={summary.downloading} tone="info" />
        <NumberTile label="Нет связи" value={summary.noContact} tone={summary.noContact > 0 ? 'warn' : 'default'} />
      </div>

      {failed > 0 ? (
        <div className="border border-text bg-text px-4 py-3 text-[12.5px] leading-relaxed text-bg">
          <span className="mr-2 font-mono text-[10px] tracking-[0.08em] uppercase opacity-60">
            Ошибка
          </span>
          {failed} {failed === 1 ? 'экран не смог' : 'экрана не смогли'} применить публикацию. Такие чеки
          помечены «отказ» в таблице ниже — их придётся разобрать вручную: повторная отправка прекращена.
        </div>
      ) : null}
    </>
  )
}
