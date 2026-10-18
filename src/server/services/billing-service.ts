/**
 * Подписка, тарифы и потребление.
 *
 * Потребление считается из таблиц, а не из `usage_counters`: счётчик в базе
 * разошёлся бы с реальностью при любом сбое обработки, и единственное, что
 * тогда покажет счётчик, — «всё хорошо» при исчерпанном лимите. Считать
 * по факту дороже на одну выборку и единственно верно.
 *
 * Деньги здесь не считаются: платёжный провайдер — отдельное решение (P8),
 * а тариф меняется вручную и пишется в журнал действий.
 */
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { plans, screens, subscriptions, mediaAssets } from '@/db/schema'
import { recordAudit } from '@/server/services/audit-service'
import { countSeats } from '@/server/services/team-service'
import { HttpError } from '@/server/http/errors'

/** Состояние подписки. Отдельный тип, чтобы `noticeFor` видел все варианты. */
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled'

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

export type UsageLine = {
  key: string
  label: string
  used: number
  limit: number
  /** Доля в процентах, округлённая для показа. */
  percent: number
  /** Превышен ли лимит. */
  exceeded: boolean
  /** Близко к лимиту: 80% и выше. Предупреждаем до отказа, а не после. */
  nearLimit: boolean
  /** Как показывать: `bytes` для хранилища, `count` для остального. */
  kind: 'count' | 'bytes'
}

/** Порог предупреждения. Отказ приходит вслед за ним, и это осознанно. */
const NEAR_LIMIT_PERCENT = 80

/** Сколько дней до истечения считать «скоро истечёт». */
const EXPIRING_SOON_DAYS = 7

export type SubscriptionView = {
  plan: PlanView | null
  status: SubscriptionStatus | null
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  trialEndsAt: Date | null
  daysLeft: number | null
  /** Причина, по которой подписка требует внимания. `null` — всё в порядке. */
  notice: { tone: 'warn' | 'danger'; title: string; hint: string } | null
  usage: UsageLine[]
}

export function listPlans(): PlanView[] {
  return db
    .select()
    .from(plans)
    .where(eq(plans.isActive, true))
    .orderBy(asc(plans.monthlyPriceCents))
    .all()
}

export function getSubscription(companyId: string): SubscriptionView {
  const row = db
    .select({
      plan: plans,
      status: subscriptions.status,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      trialEndsAt: subscriptions.trialEndsAt,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.companyId, companyId))
    .get()

  if (!row) {
    return {
      plan: null,
      status: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialEndsAt: null,
      daysLeft: null,
      notice: {
        tone: 'danger' as const,
        title: 'Подписка не настроена',
        hint: 'Обратитесь к администратору сети: без тарифа привязка новых экранов невозможна.',
      },
      usage: [],
    }
  }

  const usage = usageFor(companyId, row.plan)
  const daysLeft = Math.ceil((row.currentPeriodEnd.getTime() - Date.now()) / 86_400_000)

  return {
    plan: row.plan,
    status: row.status,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    trialEndsAt: row.trialEndsAt,
    daysLeft,
    notice: noticeFor({ status: row.status, daysLeft, trialEndsAt: row.trialEndsAt, usage, companyId }),
    usage,
  }
}

/**
 * Уведомление о подписке.
 *
 * Тон зависит от того, что именно случилось. «Через 5 дней» — это жёлтое
 * сообщение, «просрочено» — красное, «приостановлена» — красное с другим
 * текстом: отличать надо, потому что в первом случае платить добровольно, а во
 * втором счёт уже заблокирован.
 */
function noticeFor(input: {
  status: SubscriptionStatus
  daysLeft: number
  trialEndsAt: Date | null
  usage: UsageLine[]
  companyId: string
}): SubscriptionView['notice'] {
  if (input.status === 'suspended') {
    return {
      tone: 'danger',
      title: 'Подписка приостановлена',
      hint: 'Экраны не получают публикации. Восстановите подписку, чтобы сеть заработала.',
    }
  }

  if (input.status === 'cancelled') {
    return {
      tone: 'danger',
      title: 'Подписка отменена',
      hint: 'Сеть работает до конца оплаченного периода. Продлите подписку, чтобы не прервать показ.',
    }
  }

  if (input.status === 'past_due') {
    return {
      tone: 'danger',
      title: 'Оплата не прошла',
      hint: 'Доступ будет ограничен после повторной попытки списания. Проверьте способ оплаты.',
    }
  }

  // Просроченная подписка не отключает сеть целиком: экраны продолжают
  // показывать последнюю программу, и обрыв связи для зрителя недопустим.
  // Ограничивается только привязка новых экранов, и это проверяется в одном
  // месте (pairing-service), а не размазывается по мутирующим операциям.
  // Просроченная подписка не отключает сеть целиком: экраны продолжают
  // показывать последнюю программу. Ограничивается только привязка новых
  // экранов, и проверяется она в одном месте — в привязке, а не здесь.
  // Пробный период: считаемся от его конца, а не от текущего периода.
  if (input.status === 'trial' && input.trialEndsAt) {
    const trialDays = Math.ceil((input.trialEndsAt.getTime() - Date.now()) / 86_400_000)

    if (trialDays < 0) {
      return {
        tone: 'danger',
        title: 'Пробный период закончился',
        hint: 'Выберите тариф, иначе публикация будет остановлена.',
      }
    }

    if (trialDays <= EXPIRING_SOON_DAYS) {
      return {
        tone: 'warn',
        title: `Пробный период заканчивается через ${trialDays} дн`,
        hint: 'После этого публикация остановится. Выберите тариф заранее.',
      }
    }
  }

  if (input.status === 'active' && input.daysLeft < 0) {
    return {
      tone: 'danger',
      title: 'Подписка просрочена',
      hint: 'Оплата не поступила. Публикация приостановлена до оплаты.',
    }
  }

  if (input.status === 'active' && input.daysLeft <= EXPIRING_SOON_DAYS) {
    return {
      tone: 'warn',
      title: `Подписка истекает через ${input.daysLeft} дн`,
      hint: 'Продлите тариф, чтобы сеть не прервалась в неподходящий момент.',
    }
  }

  const exceeded = input.usage.find((line) => line.exceeded)

  if (exceeded) {
    return {
      tone: 'danger',
      title: `Превышен лимит: ${exceeded.label}`,
      hint: `${formatUsage(exceeded)} при лимите ${formatUsage(exceeded, exceeded.limit)}. Часть функций ограничена до смены тарифа.`,
    }
  }

  const near = input.usage.find((line) => line.nearLimit)

  if (near) {
    return {
      tone: 'warn',
      title: `${near.label}: ${formatUsage(near)} из ${near.limit}`,
      hint: 'Приближается лимит тарифа. Смена тарифа доступна в настройках компании.',
    }
  }

  return null
}

/**
 * Потребление компании.
 *
 * Отозванные экраны не считаются: устройство, которому сняли доверие, больше
 * не занимает место на тарифе, иначе пришлось бы удалять его из базы, чтобы
 * освободить лимит.
 */
export function usageFor(companyId: string, plan: PlanView): UsageLine[] {
  const activeScreens = db
    .select({ count: sql<number>`count(*)` })
    .from(screens)
    .where(and(eq(screens.companyId, companyId), ne(screens.status, 'revoked')))
    .get()

  const branches = db
    .select({ count: sql<number>`count(*)` })
    .from(sql`branches`)
    .where(sql`company_id = ${companyId}`)
    .get()

  const storage = db
    .select({ total: sql<number>`coalesce(sum(${mediaAssets.bytes}), 0)` })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.companyId, companyId), ne(mediaAssets.state, 'archived')))
    .get()

  return [
    line('screens', 'Экраны', Number(activeScreens?.count ?? 0), plan.screensLimit, 'count'),
    line('branches', 'Филиалы', Number(branches?.count ?? 0), plan.branchesLimit, 'count'),
    line('seats', 'Сотрудники', countSeats(companyId), plan.seatsLimit, 'count'),
    line('storage', 'Хранилище', Number(storage?.total ?? 0), plan.storageBytesLimit, 'bytes'),
  ]
}

function line(key: string, label: string, used: number, limit: number, kind: UsageLine['kind']): UsageLine {
  const percent = limit > 0 ? Math.round((used / limit) * 1000) / 10 : 0

  return {
    key,
    label,
    used,
    limit,
    percent,
    exceeded: used > limit,
    nearLimit: percent >= NEAR_LIMIT_PERCENT,
    kind,
  }
}

/** Человекочитаемое потребление: байты — в ГБ, остальное — штуки. */
export function formatUsage(line: UsageLine, value = line.used): string {
  if (line.kind === 'bytes') return formatBytes(value)

  return `${value} ${plural(value, 'экран', 'экрана', 'экранов')}`
}

/**
 * Русская плюрализация.
 *
 * «1 экран», «2 экрана», «5 экранов» — это не украшение, а проверка того, что
 * счётчик живой: без неё интерфейс постоянно говорит «1 экранов», и глаз
 * перестаёт его читать.
 */
export function plural(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10
  const mod100 = value % 100

  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few

  return many
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} КБ`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} МБ`
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(1)} ГБ`

  return `${(bytes / 1024 ** 4).toFixed(1)} ТБ`
}

export function formatPrice(cents: number, currency: string): string {
  if (cents === 0) return 'Бесплатно'

  const symbol = currency === 'UZS' ? 'сум' : currency

  return `${(cents / 100).toLocaleString('ru-RU')} ${symbol} / мес`
}

/**
 * Смена тарифа.
 *
 * Понижение ниже текущего потребления разрешено: сеть не ломается, просто
 * лишние экраны перестают получать публикации. Это осознанный выбор — молча
 * отказывать в смене тарифа означало бы, что компания застревает на дорогом
 * плане, и выйти из этого можно только через поддержку.
 */
export function changePlan(params: {
  companyId: string
  planId: string
  actorUserId: string
  now?: Date
}): { plan: PlanView; blocked: string[] } {
  const target = db.select().from(plans).where(eq(plans.id, params.planId)).get()

  if (!target || !target.isActive) {
    throw HttpError.notFound('Тариф не найден')
  }

  const current = db
    .select({
      plan: plans,
      start: subscriptions.currentPeriodStart,
      end: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.companyId, params.companyId))
    .get()

  if (!current) {
    throw HttpError.badRequest('no_subscription', 'У компании нет подписки')
  }

  const usage = usageFor(params.companyId, current.plan)
  const blocked: string[] = []

  for (const item of usage) {
    const targetLimit = limitOf(target, item.key)

    if (item.used > targetLimit) {
      blocked.push(`${item.label}: ${formatUsage(item, item.used)} при лимите ${formatUsage(item, targetLimit)}`)
    }
  }

  // Период продолжается при понижении и начинается заново при повышении.
  // Обратное ломает оплату: понижение обнулило бы даты до конца оплаченного
  // периода, а оператор «сэкономил» бы на уже купленном времени.
  const upgrading = target.monthlyPriceCents > current.plan.monthlyPriceCents
  const now = params.now ?? new Date()
  const periodStart = upgrading ? now : current.start
  const periodEnd = upgrading ? new Date(now.getTime() + 30 * 24 * 60 * 60_000) : current.end

  db.update(subscriptions)
    .set({
      planId: target.id,
      status: 'active',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      updatedAt: now,
    })
    .where(eq(subscriptions.companyId, params.companyId))
    .run()

  recordAudit({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    action: 'billing.plan_changed',
    targetType: 'plan',
    targetId: target.id,
    meta: {
      from: current.plan.name,
      to: target.name,
      // Фиксируется и понижение: по журналу видно, кто и зачем уводил сет��
      // с дорогого плана, а по одному факту смены это не прочитать.
      direction: upgrading ? 'upgrade' : 'downgrade',
      overLimit: blocked,
    },
  })

  return { plan: target, blocked }
}

function limitOf(plan: PlanView, key: string): number {
  switch (key) {
    case 'screens':
      return plan.screensLimit
    case 'branches':
      return plan.branchesLimit
    case 'seats':
      return plan.seatsLimit
    case 'storage':
      return plan.storageBytesLimit
    default:
      return Number.MAX_SAFE_INTEGER
  }
}

/**
 * Места по тарифу для приглашения.
 *
 * Считается здесь, а не в `team-service`: у команды есть свой `assertSeatAvailable`
 * с лимитом на входе, и это тот же вопрос двумя способами. Оставляем один
 * источник истины — биллинг, потому что он знает тариф.
 */
export function assertSeatAvailable(companyId: string): void {
  const subscription = getSubscription(companyId)
  const seats = subscription.usage.find((line) => line.key === 'seats')

  if (!seats) return

  if (seats.exceeded) {
    throw HttpError.conflict(
      'seats_limit_reached',
      `Места по тарифу закончились: ${seats.limit}. Смените тариф или уберите сотрудника.`,
    )
  }
}