'use client'

import Link from 'next/link'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { formatSilence, formatTime } from '../format'
import type { OpenDowntime } from '../model'

/** Экраны, которые молчат прямо сейчас. */
export function DowntimeTable(props: { rows: OpenDowntime[] }) {
  if (props.rows.length === 0) return null

  return (
    <Card>
      <CardHeader
        title="Недоступные экраны"
        description="Простой считается от последнего heartbeat, а не от момента обнаружения: в отчёте время вёрно, даже если насос отстал."
      />
      <CardBody className="p-0">
        <div className="@container w-full overflow-x-auto">
          <table className="stack-table w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-text-subtle">
                <th className="px-5 py-2 font-normal">Экран</th>
                <th className="px-5 py-2 font-normal">Филиал</th>
                <th className="px-5 py-2 text-right font-normal">Молчит</th>
                <th className="px-5 py-2 font-normal">С</th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row) => (
                <tr key={row.screenId} className="border-b border-border last:border-0">
                  <td data-primary className="px-5 py-2 font-medium">
                    <Link href={`/dashboard/screens/${row.screenId}`} className="hover:underline underline-offset-4">
                      {row.screenName}
                    </Link>
                  </td>
                  <td data-label="Филиал" className="px-5 py-2 text-text-muted">{row.branchName ?? '—'}</td>
                  <td data-label="Молчит" className="tnum px-5 py-2 text-right text-warn">
                    {row.silentSeconds === null ? '—' : formatSilence(row.silentSeconds)}
                  </td>
                  <td data-label="С" className="px-5 py-2 text-text-muted">{formatTime(row.openedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  )
}
