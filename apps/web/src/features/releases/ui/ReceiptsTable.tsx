'use client'

import Link from 'next/link'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { formatInstantAgo } from '@/shared/lib/relative-time'
import { STATE_LABEL, STATE_TONE } from '../format'
import type { ReceiptView } from '../model'

/** Чеки последней публикации по каждому экрану. */
export function ReceiptsTable(props: {
  latestRelease: { version: number; createdAt: string; itemCount: number } | null
  receipts: ReceiptView[]
}) {
  if (!props.latestRelease || props.receipts.length === 0) return null

  return (
    <Card>
      <CardHeader
        title={`Публикация №${props.latestRelease.version}`}
        description={`${formatInstantAgo(props.latestRelease.createdAt)} · ${
          props.latestRelease.itemCount
        } материалов · ${props.receipts.length} экранов`}
      />
      <CardBody className="p-0">
        <div className="@container w-full overflow-x-auto">
          <table className="stack-table w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-text-subtle">
                <th className="px-5 py-2 font-normal">Экран</th>
                <th className="px-5 py-2 font-normal">Состояние доставки</th>
                <th className="px-5 py-2 text-right font-normal">Подтверждено</th>
              </tr>
            </thead>
            <tbody>
              {props.receipts.map((receipt) => (
                <tr key={receipt.screenId} className="border-b border-border last:border-0">
                  <td data-primary className="px-5 py-2">
                    <Link href="/dashboard/screens" className="font-medium hover:underline underline-offset-4">
                      {receipt.screenName}
                    </Link>
                  </td>
                  <td data-label="Состояние доставки" className={`px-5 py-2 ${STATE_TONE[receipt.state] ?? 'text-text-muted'}`}>
                    {STATE_LABEL[receipt.state] ?? receipt.state}
                    {receipt.errorCode ? (
                      <span className="ml-2 text-[12px] text-text-subtle">{receipt.errorCode}</span>
                    ) : null}
                  </td>
                  <td data-label="Подтверждено" className="px-5 py-2 text-right text-text-muted">
                    {formatInstantAgo(receipt.ackedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  )
}
