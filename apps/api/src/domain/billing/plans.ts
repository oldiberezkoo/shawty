/**
 * Тарифы по умолчанию.
 *
 * Один источник для сида и для создания новой компании: если набор тарифов
 * разойдётся между демо-данными и регистрацией, новая сеть увидит пустой
 * список тарифов или подписку на несуществующий план.
 *
 * Деньги хранятся в тийинах (`monthlyPriceCents`), как их ждёт платёжный
 * провайдер: 199 000 сум — это 19 900 000.
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

const MIB = 1024 ** 2

export const GIB = 1024 ** 3

/**
 * ID первого тарифа не меняется вместе с названием: на него уже ссылаются
 * существующие подписки, и переименование строки в базе дешевле, чем миграция
 * внешних ключей.
 */
export const FREE_PLAN_ID = 'plan-starter'

export const DEFAULT_PLANS: readonly DefaultPlan[] = [
  {
    id: FREE_PLAN_ID,
    name: 'Free',
    screensLimit: 2,
    branchesLimit: 1,
    storageBytesLimit: 256 * MIB,
    seatsLimit: 1,
    eventRetentionDays: 14,
    monthlyPriceCents: 0,
    currency: 'UZS',
  },
  {
    id: 'plan-growth',
    name: 'Growth',
    screensLimit: 5,
    branchesLimit: 3,
    storageBytesLimit: 258 * MIB,
    seatsLimit: 2,
    eventRetentionDays: 60,
    monthlyPriceCents: 19_900_000,
    currency: 'UZS',
  },
  {
    id: 'plan-pro',
    name: 'Pro',
    screensLimit: 8,
    branchesLimit: 5,
    storageBytesLimit: 1 * GIB,
    seatsLimit: 5,
    eventRetentionDays: 180,
    monthlyPriceCents: 49_900_000,
    currency: 'UZS',
  },
]

export type AddonKind = 'screens' | 'storage'

export type AddonDefinition = {
  kind: AddonKind
  label: string
  unitLabel: string
  /** Цена за одну единицу в месяц, в тийинах. */
  unitPriceCents: number
  currency: string
  /** Сколько единиц максимум можно докупить одной сети. */
  maxQuantity: number
}

/**
 * Докупаемые опции.
 *
 * ГБ считается не только как место на диске. В цену входят все накладные
 * расходы на доставку контента:
 *
 * - S3 Standard во Франкфурте — $0,0245/ГБ·мес;
 * - исходящий международный трафик — $0,09/ГБ, в среднем две доставки
 *   одного ГБ на экраны за месяц: $0,18;
 * - запросы, версионирование и мониторинг — около $0,005;
 * - доля серверного времени, БД и бэкапов — около $0,02.
 *
 * Итого $0,2295 ≈ 2 732 сум по курсу ЦБ 11 903,15 на 23.10.2026.
 * Поддержка +15%, маржа +40%, эквайринг 3% и НДС 12%:
 * 2 732 × 1,15 × 1,4 / (1 − 0,03 − 0,12) ≈ 5 175 → 5 000 сум/ГБ.
 *
 * Экран дешевле в хранении, но занимает канал, очередь доставки и поддержку;
 * 25 000 сум/мес держит доп. экран ниже среднего чека Growth (≈39 800 сум)
 * и не обесценивает сам тариф.
 */
export const ADDON_CATALOG: Record<AddonKind, AddonDefinition> = {
  screens: {
    kind: 'screens',
    label: 'Дополнительные экраны',
    unitLabel: 'экран',
    unitPriceCents: 2_500_000,
    currency: 'UZS',
    maxQuantity: 500,
  },
  storage: {
    kind: 'storage',
    label: 'Дополнительное хранилище',
    unitLabel: 'ГБ',
    unitPriceCents: 500_000,
    currency: 'UZS',
    maxQuantity: 10_240,
  },
}

export function addonMonthlyCents(kind: AddonKind, quantity: number): number {
  return ADDON_CATALOG[kind].unitPriceCents * Math.max(0, Math.trunc(quantity))
}
