'use client'

import { Card, CardBody } from '@/components/ui/card'
import type { Totals } from '../model'

/** Сводка: всего экранов, на связи, без связи и открытые простои. */
export function MonitoringStats(props: { totals: Totals; openCount: number; silentCount: number }) {
  const { totals } = props

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Card>
        <CardBody className="flex flex-col gap-1">
          <span className="section-title">Всего экранов</span>
          <span className="tnum font-mono text-[30px] font-normal tracking-[-0.03em] text-text">{totals.screens}</span>
          <span className="text-[12px] text-text-subtle">
            в работе {totals.screens - totals.inactive}
            {totals.inactive > 0 ? ` · отключено или отвязано ${totals.inactive}` : ''}
          </span>
        </CardBody>
      </Card>
      <Card>
        <CardBody className="flex flex-col gap-1">
          <span className="section-title">На связи</span>
          <span className="tnum font-mono text-[30px] font-normal tracking-[-0.03em] text-success">{totals.online}</span>
        </CardBody>
      </Card>
      <Card>
        <CardBody className="flex flex-col gap-1">
          <span className="section-title">Нет связи</span>
          <span
            className={`tnum font-mono text-[30px] font-normal tracking-[-0.03em] ${totals.offline > 0 ? 'text-warn' : 'text-success'}`}
          >
            {totals.offline}
          </span>
          <span className="text-[12px] text-text-subtle">из {totals.screens - totals.inactive} рабочих</span>
        </CardBody>
      </Card>
      <Card>
        <CardBody className="flex flex-col gap-1">
          <span className="section-title">Открытых простоев</span>
          <span
            className={`tnum font-mono text-[30px] font-normal tracking-[-0.03em] ${props.openCount > 0 ? 'text-warn' : 'text-success'}`}
          >
            {props.openCount}
          </span>
          <span className="text-[12px] text-text-subtle">
            {props.silentCount > 0 ? `молчат сверх порога: ${props.silentCount}` : 'все отвечают вовремя'}
          </span>
        </CardBody>
      </Card>
    </div>
  )
}
