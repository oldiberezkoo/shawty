'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type CampaignRow = {
  campaignId: string
  campaignName: string
  screensReached: number
  screensApplied: number
  started: number
  completed: number
  skipped: number
  errors: number
  playedMs: number
  branches: { name: string; screens: number }[]
}

type Report = {
  from: string
  to: string
  totals: { started: number; completed: number; skipped: number; errors: number; playedMs: number; unattributed: number }
  campaigns: CampaignRow[]
}

const PERIODS = [
  { label: 'Сутки', days: 1 },
  { label: 'Неделя', days: 7 },
  { label: 'Месяц', days: 30 },
]

function minutes(ms: number): string {
  const value = Math.round(ms / 60_000)
  if (value < 60) return `${value} мин`
  return `${Math.floor(value / 60)} ч ${value % 60} мин`
}

/**
 * Что показала кампания.
 *
 * Заголовки колонок названы так, чтобы их нельзя было прочитать как «показы».
 * «Стартов подтверждено N» — это утверждение о том, что плеер сообщил о начале
 * показа; человек у экрана мог смотреть в другую сторону, и продукту об этом
 * ничего не известно (§9.6 плана).
 *
 * Связка кампании с показом точная: она идёт через таргеты публикации, а не
 * через «время публикации попало в интервал кампании». При пересечении
 * расписаний второе дало бы двум разным акциям один и тот же итог.
 */
export function CampaignReportCard({ companyId }: { companyId: string }) {
  const [days, setDays] = useState(7)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    async (periodDays: number) => {
      setError(null)
      setBusy(true)

      try {
        const to = new Date()
        const from = new Date(to.getTime() - periodDays * 24 * 60 * 60_000)

        const response = await fetch(
          `/api/dashboard/reports/campaigns?from=${from.toISOString()}&to=${to.toISOString()}`,
          { headers: { 'x-company-id': companyId }, cache: 'no-store' },
        )

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
          setError(payload?.error?.message ?? 'Не удалось построить отчёт')
          return
        }

        const payload = (await response.json()) as { report: Report }
        setReport(payload.report)
      } catch {
        setError('Отчёт недоступен')
      } finally {
        setBusy(false)
      }
    },
    [companyId],
  )

  const download = useCallback(async () => {
    if (!report) return

    const response = await fetch(
      `/api/dashboard/reports/campaigns?format=csv&from=${encodeURIComponent(report.from)}&to=${encodeURIComponent(report.to)}`,
      { headers: { 'x-company-id': companyId }, cache: 'no-store' },
    )

    if (!response.ok) return

    const blob = await response.blob()
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `campaigns-${report.from.slice(0, 10)}-${report.to.slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }, [companyId, report])

  return (
    <Card>
      <CardHeader
        title="Что показала кампания"
        description="Утверждается ровно то, что знает машина: материал начал показываться на экране и был показан столько-то миллисекунд. Человек у экрана мог смотреть в другую сторону — датчиков внимания нет, и «показов» в продукте не будет."
        action={
          <div className="flex items-center gap-2">
            {PERIODS.map((period) => (
              <Button
                key={period.days}
                size="sm"
                variant={days === period.days ? 'primary' : 'secondary'}
                onClick={() => {
                  setDays(period.days)
                  void load(period.days)
                }}
              >
                {period.label}
              </Button>
            ))}
            <Button size="sm" disabled={!report} onClick={() => void download()}>
              CSV
            </Button>
          </div>
        }
      />
      <CardBody className="flex flex-col gap-4">
        {error ? (
          <div className="rounded-[var(--radius-md)] border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">
            {error}
          </div>
        ) : null}

        {!report ? (
          <p className="text-[13px] text-text-subtle">
            Выберите период. Отчёт строится по событиям воспроизведения, а их телевизор присылает только по живому
            каналу, поэтому за старые периоды данных будет меньше.
          </p>
        ) : report.campaigns.length === 0 ? (
          // Здесь предложение, а не констатация: человек смотрит отчёт
          // скорее всего потому, что хочет понять, что показывалось на
          // экранах. Пустой отчёт без выхода оставляет его гадать, не
          // настроено ли расписание вовсе.
          <p className="text-[13px] text-text-subtle">
            Кампаний пока нет — пока не задано расписание, экраны показывают назначенный плейлист
            постоянно.{' '}
            <Link href="/dashboard/campaigns" className="text-text-muted underline underline-offset-4 hover:text-text">
              Посмотреть кампании
            </Link>
          </p>
        ) : (
          <>
            <div className="@container w-full overflow-x-auto">
            <table className="stack-table w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-text-subtle">
                  <th className="py-2 font-normal">Кампания</th>
                  <th className="py-2 text-right font-normal">Экранов</th>
                  <th className="py-2 text-right font-normal">Стартов подтверждено</th>
                  <th className="py-2 text-right font-normal">Показано</th>
                  <th className="py-2 text-right font-normal">Пропущено</th>
                </tr>
              </thead>
              <tbody>
                {report.campaigns.map((row) => (
                  <tr key={row.campaignId} className="border-b border-border last:border-0">
                    <td data-primary className="py-2">
                      <div className="font-medium">{row.campaignName}</div>
                      {row.branches.length > 0 ? (
                        <div className="text-[12px] text-text-subtle">
                          {row.branches.map((branch) => `${branch.name} (${branch.screens})`).join(', ')}
                        </div>
                      ) : null}
                    </td>
                    <td data-label="Экранов" className="tnum py-2 text-right text-text-muted">
                      {row.screensApplied} / {row.screensReached}
                    </td>
                    <td data-label="Стартов подтверждено" className="tnum py-2 text-right">{row.started}</td>
                    <td data-label="Показано" className="tnum py-2 text-right text-text-muted">{minutes(row.playedMs)}</td>
                    <td data-label="Пропущено" className={`tnum py-2 text-right ${row.skipped + row.errors > 0 ? 'text-warn' : 'text-text-subtle'}`}>
                      {row.skipped + row.errors}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {report.totals.unattributed > 0 ? (
              <p className="text-[12px] text-text-subtle">
                {report.totals.unattributed} стартов без связи с публикацией не приписаны ни одной кампании: такие
                события приходят от телевизора, перезагрузившегося между публикацией и отправкой. Они не входят ни в
                одну строку — иначе сумма по кампаниям была бы больше, чем произошло на самом деле.
              </p>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  )
}