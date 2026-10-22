/**
 * Тарифы по умолчанию.
 *
 * Один источник для сида и для создания новой компании: если набор тарифов
 * разойдётся между демо-данными и регистрацией, новая сеть увидит пустой
 * список тарифов или подписку на несуществующий план.
 */
export type DefaultPlan = {
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

export const STARTER_PLAN_ID = 'plan-starter'

export const DEFAULT_PLANS: readonly DefaultPlan[] = [
  {
    id: STARTER_PLAN_ID,
    name: 'Start',
    screensLimit: 5,
    branchesLimit: 2,
    storageBytesLimit: 5 * 1024 ** 3,
    seatsLimit: 3,
    eventRetentionDays: 14,
    monthlyPriceCents: 0,
    currency: 'UZS',
  },
  {
    id: 'plan-growth',
    name: 'Growth',
    screensLimit: 80,
    branchesLimit: 25,
    storageBytesLimit: 100 * 1024 ** 3,
    seatsLimit: 10,
    eventRetentionDays: 60,
    monthlyPriceCents: 450_000,
    currency: 'UZS',
  },
  {
    id: 'plan-pro',
    name: 'Pro',
    screensLimit: 500,
    branchesLimit: 200,
    storageBytesLimit: 1024 * 1024 ** 3,
    seatsLimit: 50,
    eventRetentionDays: 180,
    monthlyPriceCents: 1_800_000,
    currency: 'UZS',
  },
]
