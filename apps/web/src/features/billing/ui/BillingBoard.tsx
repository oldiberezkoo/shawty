'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { FormError } from '@/components/ui/form'
import { Badge, Notice } from '@/components/ui/status-badge'
import { UsageBar, SettingRow } from '@/components/ui/metric'
import { dashboardRequest } from '@/shared/api/dashboard-client'
import { formatStorageSize } from '@/shared/lib/format'
import { plural } from '@/shared/lib/plural'

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

export type AddonLine = {
  kind: 'screens' | 'storage'
  label: string
  unitLabel: string
  quantity: number
  unitPriceCents: number
  monthlyPriceCents: number
  currency: string
}

export type AddonsView = {
  screens: AddonLine
  storage: AddonLine
  monthlyPriceCents: number
  currency: string
}

function formatValue(value: number, kind: 'count' | 'bytes'): string {
  if (kind === 'bytes') return formatStorageSize(value)

  return `${value} ${plural(value, 'экран', 'экрана', 'экранов')}`
}

function formatMoney(cents: number, currency: string): string {
  return `${(cents / 100).toLocaleString('ru-RU')} ${currency === 'UZS' ? 'сум' : currency}`
}

function formatPrice(cents: number, currency: string): string {
  if (cents === 0) return 'Бесплатно'

  return `${formatMoney(cents, currency)} / мес`
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
  addons,
  monthlyTotalCents,
  canChangePlan,
}: {
  companyId: string
  state: BillingState
  usage: UsageLine[]
  plans: PlanView[]
  addons: AddonsView
  monthlyTotalCents: number
  canChangePlan: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [addonBusy, setAddonBusy] = useState<'screens' | 'storage' | null>(null)
  const [confirming, setConfirming] = useState<PlanView | null>(null)

  const change = useCallback(
    async (planId: string) => {
      setError(null)
      setBusy(true)

      const result = await dashboardRequest(
        '/api/dashboard/billing',
        { method: 'PATCH', body: JSON.stringify({ planId }) },
        companyId,
        'Не удалось сменить тариф',
      )

      setBusy(false)

      if (!result.ok) {
        setError(result.message)
        return
      }

      setConfirming(null)
      router.refresh()
    },
    [companyId, router],
  )

  const adjustAddon = useCallback(
    async (kind: 'screens' | 'storage', delta: number) => {
      const line = addons[kind]
      const quantity = Math.max(0, line.quantity + delta)

      if (quantity === line.quantity) return

      setError(null)
      setAddonBusy(kind)

      const result = await dashboardRequest(
        '/api/dashboard/billing/addons',
        { method: 'PATCH', body: JSON.stringify({ kind, quantity }) },
        companyId,
        'Не удалось изменить опцию',
      )

      setAddonBusy(null)

      if (!result.ok) {
        setError(result.message)
        return
      }

      router.refresh()
    },
    [addons, companyId, router],
  )

  const planPrice = state.plan?.monthlyPriceCents ?? 0
  const planCurrency = state.plan?.currency ?? addons.currency

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
            <span className="section-title">Тариф</span>
            <span className="text-[22px] leading-tight font-medium">{state.plan?.name ?? '—'}</span>
            {state.plan ? (
              <span className="text-[12px] text-text-subtle">
                {formatPrice(planPrice, planCurrency)}
                {addons.monthlyPriceCents > 0 ? ` + ${formatMoney(addons.monthlyPriceCents, addons.currency)} опции` : ''}
              </span>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex flex-col gap-1">
            <span className="section-title">Состояние</span>
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
            <span className="section-title">Хранение событий</span>
            <span className="text-[22px] leading-tight font-medium">{state.plan?.eventRetentionDays ?? '—'}</span>
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
          title="Докупаемые опции"
          description={
            canChangePlan
              ? 'Экраны и хранилище сверх тарифа. Цена ГБ включает место, международный трафик доставки и серверное время. Лимит применяется сразу, оплата вносится вручную вместе с тарифом.'
              : 'Докупать экраны и хранилище может только владелец компании.'
          }
        />
        <CardBody className="flex flex-col gap-5">
          {(['screens', 'storage'] as const).map((kind) => {
            const line = addons[kind]
            const busyLine = addonBusy === kind
            const quantityText =
              kind === 'screens'
                ? `+${line.quantity} ${plural(line.quantity, 'экран', 'экрана', 'экранов')}`
                : `+${line.quantity} ГБ`

            return (
              <SettingRow
                key={kind}
                label={line.label}
                hint={`${formatMoney(line.unitPriceCents, line.currency)} за ${line.unitLabel} / мес`}
              >
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <span className="tnum text-[13px] text-text-muted">{quantityText}</span>

                  {canChangePlan ? (
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyLine || line.quantity === 0}
                        onClick={() => void adjustAddon(kind, -1)}
                        aria-label={`Убрать ${line.unitLabel}`}
                      >
                        −
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyLine}
                        onClick={() => void adjustAddon(kind, 1)}
                        aria-label={`Добавить ${line.unitLabel}`}
                      >
                        +
                      </Button>
                    </div>
                  ) : null}

                  <span className="tnum w-24 text-right text-[13px] font-medium">
                    {line.monthlyPriceCents > 0 ? formatPrice(line.monthlyPriceCents, line.currency) : '—'}
                  </span>
                </div>
              </SettingRow>
            )
          })}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <span className="text-[12px] text-text-subtle">
              Итого по тарифу и опциям — в счёте за месяц.
            </span>
            <span className="text-[13px] font-medium">
              Итого: {formatPrice(monthlyTotalCents, planCurrency)}
            </span>
          </div>
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