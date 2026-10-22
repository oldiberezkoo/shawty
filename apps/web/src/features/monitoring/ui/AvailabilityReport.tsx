'use client'

import { Notice } from '@/components/ui/status-badge'
import { useCallback, useState } from 'react'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatDuration } from '@/domain/monitoring/incidents'
import { dashboardRequest } from '@/shared/api/dashboard-client'

type ReportScreen = {
  screenId: string
  screenName: string
  branchName: string | null
  offlineMs: number
  staleMs: number
  uptimePercent: number | null
  downtimeCount: number
}

type ReportBranch = {
  key: string
  name: string
  screens: number
  offlineMs: number
  staleMs: number
  uptimePercent: number | null
}

type Report = {
  from: string
  to: string
  totals: { screens: number; offlineMs: number; staleMs: number; uptimePercent: number | null }
  branches: ReportBranch[] | null
  screens: ReportScreen[]
}

const PERIODS = [
  { label: 'Сутки', days: 1 },
  { label: 'Неделя', days: 7 },
  { label: 'Месяц', days: 30 },
]

/**
 * Отчёт о недоступности за период.
 *
 * Три числа рядом, и они не взаимозаменяемы: «на связи», «на связи со старым
 * контентом» и «недоступен». Экран может быть жив и при этом показывать вчерашнюю
 * акцию — это разные виды проблемы и разные действия при разборе.
 *
 * Числа не округляются до красивых: округлённая доступность 99.6% рядом с
 * «лежал 6 часов» выглядит как округление ошибки.
 */
export function AvailabilityReport({ companyId }: { companyId: string }) {
  const [days, setDays] = useState(7)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    async (periodDays: number) => {
      setError(null)
      setBusy(true)

      const to = new Date()
      const from = new Date(to.getTime() - periodDays * 24 * 60 * 60_000)

      const url = `/api/dashboard/reports/availability?groupBy=branch&from=${from.toISOString()}&to=${to.toISOString()}`

      const result = await dashboardRequest<{ report: Report }>(
        url,
        { cache: 'no-store' },
        companyId,
        'Не удалось построить отчёт',
      )

      setBusy(false)

      if (!result.ok) {
        setError(result.status === 0 ? 'Отчёт недоступен' : result.message)
        return
      }

      setReport(result.data.report)
    },
    [companyId],
  )

  /**
   * Выгрузка CSV.
   *
   * Идёт через fetch с заголовком компании, а не ссылкой: маршрут требует
   * `x-company-id`, и обычное открытие вкладки упало бы с «не указана
   * компания». Компанию в ссылку класть нельзя — она утекла бы в историю
   * браузера и в логи.
   */
  const downloadCsv = useCallback(async () => {
    if (!report) return

    const url = `/api/dashboard/reports/availability?format=csv&from=${encodeURIComponent(report.from)}&to=${encodeURIComponent(report.to)}`

    const response = await fetch(url, { headers: { 'x-company-id': companyId }, cache: 'no-store' })

    if (!response.ok) {
      setError('Не удалось выгрузить CSV')
      return
    }

    const blob = await response.blob()
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `availability-${report.from.slice(0, 10)}-${report.to.slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }, [companyId, report])

  return (
    <Card>
      <CardHeader
        title="Недоступность за период"
        description="Считается из интервалов простоя, а не из событий воспроизведения: событие телевизор отправляет только по живому каналу и теряется при обрыве."
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
            <Button
              size="sm"
              disabled={!report}
              onClick={() => {
                if (!report) return
                void downloadCsv()
              }}
            >
              CSV
            </Button>
          </div>
        }
      />
      <CardBody className="flex flex-col gap-4">
        {error ? (
          <Notice tone="danger">{error}</Notice>
        ) : null}

        {!report ? (
          <p className="text-[13px] text-text-subtle">Выберите период — отчёт считается по инцидентам и может занять секунду.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <Metric label="Доступность" value={report.totals.uptimePercent === null ? '—' : `${report.totals.uptimePercent}%`} tone="success" />
              <Metric label="Простой" value={formatDuration(Math.round(report.totals.offlineMs / 1000))} tone={report.totals.offlineMs > 0 ? 'warn' : 'default'} />
              <Metric
                label="На связи, но старое"
                value={formatDuration(Math.round(report.totals.staleMs / 1000))}
                tone={report.totals.staleMs > 0 ? 'info' : 'default'}
              />
            </div>

            {report.branches && report.branches.length > 0 ? (
              <div className="flex flex-col gap-1 border-t border-border pt-3">
                <span className="text-[12px] text-text-muted">Где именно</span>
                {report.branches.map((branch) => (
                  <div key={branch.key} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="text-text">{branch.name}</span>
                    <span className="tnum text-text-muted">
                      {formatDuration(Math.round(branch.offlineMs / 1000))} · {branch.screens}{' '}
                      {branch.screens === 1 ? 'экран' : 'экранов'}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {report.screens.filter((row) => row.downtimeCount > 0).length > 0 ? (
              <div className="flex flex-col gap-1 border-t border-border pt-3">
                <span className="text-[12px] text-text-muted">Экраны с простоем</span>
                {report.screens
                  .filter((row) => row.downtimeCount > 0)
                  .sort((a, b) => b.offlineMs - a.offlineMs)
                  .map((row) => (
                    <div key={row.screenId} className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="text-text">
                        {row.screenName}
                        {row.branchName ? <span className="ml-2 text-text-subtle">{row.branchName}</span> : null}
                      </span>
                      <span className="tnum text-warn">
                        {formatDuration(Math.round(row.offlineMs / 1000))} · эпизодов {row.downtimeCount}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-[13px] text-success">За выбранный период ни один экран не был недоступен.</p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  const toneClass: Record<string, string> = {
    default: 'text-text',
    success: 'text-success',
    warn: 'text-warn',
    info: 'text-info',
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] text-text-muted">{label}</span>
      <span className={`tnum font-mono text-[24px] font-normal tracking-[-0.03em] ${toneClass[tone] ?? ''}`}>{value}</span>
    </div>
  )
}