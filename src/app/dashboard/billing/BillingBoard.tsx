'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { FormError } from '@/components/ui/form'
import { Badge, Notice } from '@/components/ui/status-badge'
import { UsageBar, SettingRow } from '@/components/ui/metric'
import { CSRF_COOKIE } from '@/lib/cookie-names'

export type UsageLine = {
  key: string
  label: string
  used: number
  limit: number
  percent: number
  exceeded: boolean
  nearLimit: boolean
  kind: 'count' | 'bytes'
}

export type PlanView = {
  id: string
  name: string
  screensLimit: number
  branchesLimit: number
  storageBytesLimit: number
  seatsLimit: number
  eventRetentionDays: number
  monthlyPriceCents: number
  currency: string
}

export type BillingState = {
  plan: PlanView | null
  status: string | null
  daysLeft: number | null
  currentPeriodEnd: string | null
  trialEndsAt: string | null
  notice: { tone: 'warn' | 'danger'; title: string; hint: string } | null
}

function readCsrf(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

/**
 * Форматирование потребления.
 *
 * Дублируется в клиентском компоненте намеренно: значение выводится в шкале и
 * в подписи, а тащить серверный сервис в браузер ради двух функций нельзя —
 * он тянет базу.
 */
function plural(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10
  const mod100 = value % 100

  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few

  return many
}

function formatValue(value: number, kind: 'count' | 'bytes'): string {
  if (kind === 'bytes') {
    if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(0)} МБ`
    return `${(value / 1024 ** 3).toFixed(1)} ГБ`
  }

  return `${value} ${plural(value, 'экран', 'экрана', 'экранов')}`
}

function formatPrice(cents: number, currency: string): string {
  if (cents === 0) return 'Бесплатно'

  return `${(cents / 100).toLocaleString('ru-RU')} ${currency === 'UZS' ? 'сум' : currency} / мес`
}

const STATUS_LABEL: Record<string, string> = {
  trial: 'Пробный период',
  active: 'Активна',
  past_due: 'Оплата не прошла',
  suspended: 'Приостановлена',
  cancelled: 'Отменена',
}

/**
 * Тариф и потребление.
 *
 * Главное на экране — не цена, а **остаток**: сколько экранов и места ещё
 * можно использовать. Администратору смотрит на плитку «3 из 80», а не на
 * списание суммы, и предупреждаться он должен заранее, а не при отказе.
 */
export function BillingBoard({
  companyId,
  state,
  usage,
  plans,
  canChangePlan,
}: {
  companyId: string
  state: BillingState
  usage: UsageLine[]
  plans: PlanView[]
  canChangePlan: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<PlanView | null>(null)

  const change = useCallback(
    async (planId: string) => {
      setError(null)
      setBusy(true)

      try {
        const response = await fetch('/api/dashboard/billing', {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'x-company-id': companyId,
            'x-csrf-token': readCsrf(),
          },
          body: JSON.stringify({ planId }),
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
          setError(payload?.error?.message ?? 'Не удалось сменить тариф')
          return
        }

        setConfirming(null)
        router.refresh()
      } finally {
        setBusy(false)
      }
    },
    [companyId, router],
  )

  const periodEnd = state.currentPeriodEnd
    ? new Date(state.currentPeriodEnd).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <div className="flex flex-col gap-6">
      {state.notice ? (
        <Notice tone={state.notice.tone} title={state.notice.title}>
          {state.notice.hint}
        </Notice>
      ) : null}

      {error ? <FormError onDismiss={() => setError(null)}>{error}</FormError> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardBody className="flex flex-col gap-1">
            <span className="text-[12px] text-text-muted">Тариф</span>
            <span className="text-[22px] leading-tight font-semibold">{state.plan?.name ?? '—'}</span>
            {state.plan ? (
              <span className="text-[12px] text-text-subtle">{formatPrice(state.plan.monthlyPriceCents, state.plan.currency)}</span>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex flex-col gap-1">
            <span className="text-[12px] text-text-muted">Состояние</span>
            <span className="flex items-center gap-2 text-[15px] font-medium">
              {STATUS_LABEL[state.status ?? ''] ?? '—'}
            </span>
            <span className="text-[12px] text-text-subtle">
              {state.daysLeft !== null ? `до ${periodEnd} · ${state.daysLeft} дн` : 'период не задан'}
            </span>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex flex-col gap-1">
            <span className="text-[12px] text-text-muted">Хранение событий</span>
            <span className="text-[22px] leading-tight font-semibold">{state.plan?.eventRetentionDays ?? '—'}</span>
            <span className="text-[12px] text-text-subtle">дней по тарифу</span>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Потребление"
          description="Считается по факту из базы, а не по счётчику: счётчик расходился бы с реальностью при любом сбое обработки и показывал бы «всё хорошо» при исчерпанном лимите."
        />
        <CardBody className="flex flex-col gap-5">
          {usage.map((line) => (
            <UsageBar
              key={line.key}
              label={line.label}
              used={line.used}
              limit={line.limit}
              usedText={formatValue(line.used, line.kind)}
              limitText={formatValue(line.limit, line.kind)}
            />
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Смена тарифа"
          description={
            canChangePlan
              ? 'Понижение ниже текущего потребления разрешено: лишние экраны перестанут получать публикации. Смена фиксируется в журнале действий.'
              : 'Менять тариф может только владелец компании.'
          }
        />
        <CardBody className="p-0">
          <ul className="divide-y divide-[var(--border)]">
            {plans.map((plan) => {
              const current = plan.id === state.plan?.id

              return (
                <li key={plan.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium">{plan.name}</span>
                      {current ? <Badge tone="info">текущий</Badge> : null}
                    </div>

                    <div className="mt-1 text-[12px] leading-relaxed text-text-muted">
                      {plan.screensLimit} экранов · {plan.seatsLimit} {plural(plan.seatsLimit, 'место', 'места', 'мест')} ·
                      хранилище {formatValue(plan.storageBytesLimit, 'bytes')} · события {plan.eventRetentionDays} дн
                    </div>
                  </div>

                  <div className="shrink-0 text-[13px] font-medium">{formatPrice(plan.monthlyPriceCents, plan.currency)}</div>

                  {!current && canChangePlan ? (
                    <Button size="sm" disabled={busy} onClick={() => setConfirming(plan)}>
                      Перейти
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </CardBody>
      </Card>

      {confirming ? (
        <Modal
          open
          onClose={() => setConfirming(null)}
          title={`Переход на тариф «${confirming.name}»`}
          description={
            confirming.monthlyPriceCents > (state.plan?.monthlyPriceCents ?? 0)
              ? 'Период начнётся заново с сегодняшнего дня.'
              : 'Оплаченный период сохранится: срок не обнуляется при понижении.'
          }
          size="sm"
          footer={
            <>
              <Button size="sm" onClick={() => setConfirming(null)}>
                Отмена
              </Button>
              <Button size="sm" variant="primary" disabled={busy} onClick={() => void change(confirming.id)}>
                Перейти
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3 text-[13px]">
            <SettingRow label="Экранов" hint="лимит тарифа">
              <span className="tnum">{confirming.screensLimit}</span>
            </SettingRow>
            <SettingRow label="Сотрудников" hint="места по тарифу">
              <span className="tnum">{confirming.seatsLimit}</span>
            </SettingRow>
            <SettingRow label="Хранилище">
              <span className="tnum">{formatValue(confirming.storageBytesLimit, 'bytes')}</span>
            </SettingRow>

            {/* Предупреждение о превышении показывается до подтверждения: решение
                принимается с открытыми глазами, а не после. */}
            {usage.some((line) => {
              const limits: Record<string, number> = {
                screens: confirming.screensLimit,
                branches: confirming.branchesLimit,
                seats: confirming.seatsLimit,
                storage: confirming.storageBytesLimit,
              }

              return line.used > (limits[line.key] ?? Number.MAX_SAFE_INTEGER)
            }) ? (
              <Notice tone="warn" title="Что перестанет работать">
                Часть экранов или сотрудников выйдет за лимит нового тарифа. Они сохранятся в системе, но новые
                публикации и приглашения для них станут недоступны.
              </Notice>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </div>
  )
}