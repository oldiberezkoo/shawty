'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/ui/form'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/status-badge'
import { CSRF_COOKIE } from '@/lib/cookie-names'

export type PlanOption = {
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

const TAGLINES: Record<string, string> = {
  'plan-starter': 'Для первого экрана и проверки сценария.',
  'plan-growth': 'Для сети, которой нужен запас по экранам и филиалам.',
  'plan-pro': 'Для большой сети с длинной историей и широкой командой.',
}

function readCsrf(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

function plural(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10
  const mod100 = value % 100

  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few

  return many
}

function formatPrice(cents: number): string {
  if (cents === 0) return '0'

  return (cents / 100).toLocaleString('ru-RU')
}

function formatStorage(bytes: number): string {
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} МБ`
  if (bytes < 1024 ** 4) return `${Math.round(bytes / 1024 ** 3)} ГБ`

  return `${Math.round(bytes / 1024 ** 4)} ТБ`
}

/**
 * Выбор тарифа на первом входе.
 *
 * Показывается один раз — после регистрации, когда сеть уже создана, но
 * владелец ещё не решил, на чём работать. Стартовый тариф выбран заранее:
 * человек не обязан платить, чтобы увидеть панель, а сравнение лимитов
 * остаётся перед глазами.
 *
 * Модалка не блокирует работу: её можно закрыть и вернуться позже. Флаг
 * «тариф выбран» ставится только явным действием, поэтому при следующем
 * заходе вопрос вернётся — но не всплывёт посреди уже начатой настройки.
 */
export function PlanOnboardingModal({
  companyId,
  companyName,
  plans,
  currentPlanId,
}: {
  companyId: string
  companyName: string
  plans: PlanOption[]
  currentPlanId: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  const [selectedId, setSelectedId] = useState(
    currentPlanId ?? plans.find((plan) => plan.monthlyPriceCents === 0)?.id ?? plans[0]?.id ?? '',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = plans.find((plan) => plan.id === selectedId) ?? null

  const submit = useCallback(async () => {
    if (!selected) return

    setError(null)
    setBusy(true)

    try {
      const response = await fetch('/api/dashboard/onboarding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-company-id': companyId,
          'x-csrf-token': readCsrf(),
        },
        body: JSON.stringify({ planId: selected.id }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        setError(payload?.error?.message ?? 'Не удалось выбрать тариф')
        return
      }

      setOpen(false)
      router.refresh()
    } catch {
      setError('Сервер недоступен. Проверьте соединение.')
    } finally {
      setBusy(false)
    }
  }, [companyId, router, selected])

  if (plans.length === 0) return null

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Первый вход · выбор тарифа"
      size="xl"
      footer={
        <>
          <Button size="md" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
            Позже
          </Button>
          <Button size="md" variant="primary" disabled={busy || !selected} onClick={() => void submit()}>
            {busy
              ? 'Сохраняем…'
              : selected
                ? selected.monthlyPriceCents === 0
                  ? 'Продолжить бесплатно'
                  : `Подключить ${selected.name}`
                : 'Выберите тариф'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="section-title">Сеть создана</p>

          <h2 className="max-w-[24ch] text-[clamp(1.35rem,1.15rem+0.8vw,1.75rem)] leading-[1.08] font-medium tracking-[-0.035em] text-balance">
            «{companyName}» готова к работе. <em>Выберите тариф.</em>
          </h2>

          <p className="max-w-[72ch] text-[12.5px] leading-relaxed text-text-muted">
            Start бесплатен: пяти экранов хватает, чтобы проверить сценарий целиком. Тариф можно сменить в
            любой момент в разделе «Тариф» — данные и настройки при переходе сохраняются.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Тариф">
          {plans.map((plan) => {
            const active = plan.id === selectedId
            const popular = plan.id === 'plan-growth'

            return (
              <div
                key={plan.id}
                role="radio"
                aria-checked={active}
                tabIndex={0}
                onClick={() => setSelectedId(plan.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedId(plan.id)
                  }
                }}
                className={`flex cursor-pointer flex-col gap-4 border p-4 text-left transition-[border-color,background-color] duration-150 ${
                  active
                    ? 'border-primary bg-primary-soft'
                    : 'border-border bg-surface-2/40 hover:border-border-strong hover:bg-surface-2'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[15px] font-medium tracking-[-0.02em]">{plan.name}</span>
                      {popular ? <Badge tone="info">Популярный</Badge> : null}
                    </div>

                    <p className="mt-1 text-[11.5px] leading-relaxed text-text-muted">
                      {TAGLINES[plan.id] ?? 'Тариф для вашей сети.'}
                    </p>
                  </div>

                  <span
                    aria-hidden
                    className={`mt-0.5 flex size-4 shrink-0 items-center justify-center border ${
                      active ? 'border-primary bg-primary text-primary-text' : 'border-border-strong'
                    }`}
                  >
                    {active ? <Check className="size-3" strokeWidth={2.4} /> : null}
                  </span>
                </div>

                <div className="flex items-baseline gap-1.5">
                  <span className="text-[24px] leading-none font-medium tracking-[-0.04em]">
                    {formatPrice(plan.monthlyPriceCents)}
                  </span>
                  <span className="text-[11px] text-text-subtle">
                    {plan.monthlyPriceCents === 0 ? 'сум · навсегда' : `${plan.currency === 'UZS' ? 'сум' : plan.currency} / мес`}
                  </span>
                </div>

                <ul className="flex flex-col gap-1.5 border-t border-border pt-3 text-[11.5px] leading-snug text-text-muted">
                  <PlanLine>{plan.screensLimit} экранов</PlanLine>
                  <PlanLine>
                    {plan.branchesLimit} {plural(plan.branchesLimit, 'филиал', 'филиала', 'филиалов')}
                  </PlanLine>
                  <PlanLine>
                    {plan.seatsLimit} {plural(plan.seatsLimit, 'сотрудник', 'сотрудника', 'сотрудников')}
                  </PlanLine>
                  <PlanLine>{formatStorage(plan.storageBytesLimit)} хранилища</PlanLine>
                  <PlanLine>{plan.eventRetentionDays} дней истории</PlanLine>
                </ul>
              </div>
            )
          })}
        </div>

        {error ? <FormError onDismiss={() => setError(null)}>{error}</FormError> : null}

        <ul className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4 text-[11.5px] text-text-subtle">
          <li className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 shrink-0 text-primary" strokeWidth={1.7} />
            Карта не нужна для Start
          </li>
          <li className="flex items-center gap-1.5">
            <RefreshCw className="size-3.5 shrink-0 text-primary" strokeWidth={1.7} />
            Смена тарифа без потери данных
          </li>
          <li className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 shrink-0 text-primary" strokeWidth={1.7} />
            Оплата Growth и Pro — вручную, в разделе «Тариф»
          </li>
        </ul>
      </div>
    </Modal>
  )
}

function PlanLine({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-1.5">
      <Check className="mt-px size-3 shrink-0 text-text-subtle" strokeWidth={2} />
      <span className="min-w-0">{children}</span>
    </li>
  )
}
