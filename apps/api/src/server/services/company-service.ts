import { and, eq, isNull } from 'drizzle-orm'
import { db, withImmediateTransaction, type Transaction } from '@/db/client'
import { auditLog, companies, memberships, plans, subscriptions } from '@/db/schema'
import { DEFAULT_PLANS, FREE_PLAN_ID } from '@/domain/billing/plans'
import { slugifyCompanyName } from '@/lib/slug'
import { HttpError } from '@/server/http/errors'

/** Длительность первого периода подписки. */
const PERIOD_MS = 30 * 24 * 60 * 60_000

export type CreatedCompany = {
  companyId: string
  name: string
  slug: string
}

/**
 * Создание компании вместе с владельцем и стартовой подпиской.
 *
 * Вынесено из регистрации, потому что тот же путь нужен аккаунтам, которые
 * уже существуют, но остались без компании: без него человек с валидной
 * сессией не может попасть в панель и не видит способа это исправить.
 *
 * Тарифы вставляются здесь же, если их нет. Регистрация не должна зависеть от
 * того, выполняли ли на стенде `pnpm db:seed`: иначе новая сеть падает на
 * внешнем ключе подписки.
 */
export function createCompanyForOwner(params: {
  userId: string
  name: string
  now?: Date
}): CreatedCompany {
  return withImmediateTransaction((tx) => createCompanyInTx(tx, params))
}

/** Вариант для уже открытой транзакции: регистрация создаёт пользователя и сеть атомарно. */
export function createCompanyInTx(
  tx: Transaction,
  params: { userId: string; name: string; now?: Date },
): CreatedCompany {
  const name = params.name.trim().replace(/\s+/g, ' ')

  if (name.length < 2) {
    throw HttpError.badRequest('invalid_input', 'Название компании слишком короткое')
  }

  const now = params.now ?? new Date()

  for (const plan of DEFAULT_PLANS) {
    tx.insert(plans).values(plan).onConflictDoNothing().run()
  }

  const slug = uniqueSlug(tx, slugifyCompanyName(name))
  const companyId = crypto.randomUUID()

  tx.insert(companies)
    .values({
      id: companyId,
      slug,
      name,
      timezone: 'Asia/Tashkent',
      locale: 'ru',
      status: 'active',
      createdAt: now,
    })
    .run()

  tx.insert(memberships)
    .values({
      id: crypto.randomUUID(),
      userId: params.userId,
      companyId,
      role: 'owner',
      status: 'active',
      createdAt: now,
    })
    .run()

  tx.insert(subscriptions)
    .values({
      id: crypto.randomUUID(),
      companyId,
      planId: FREE_PLAN_ID,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + PERIOD_MS),
      createdAt: now,
      updatedAt: now,
    })
    .run()

  tx.insert(auditLog)
    .values({
      id: crypto.randomUUID(),
      companyId,
      actorUserId: params.userId,
      action: 'company.created',
      targetType: 'company',
      targetId: companyId,
      metaJson: JSON.stringify({ name, slug, plan: FREE_PLAN_ID }),
      at: now,
    })
    .run()

  return { companyId, name, slug }
}

/** `slug` уникален в базе; суффикс добавляется, а не затирает чужую сеть. */
function uniqueSlug(tx: Transaction, base: string): string {
  for (let attempt = 1; attempt <= 100; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`

    const existing = tx
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.slug, candidate))
      .get()

    if (!existing) return candidate
  }

  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

/** Показывать ли выбор тарифа на первом входе. */
export function isOnboardingCompleted(companyId: string): boolean {
  const row = db
    .select({ completedAt: companies.onboardingCompletedAt })
    .from(companies)
    .where(eq(companies.id, companyId))
    .get()

  return Boolean(row?.completedAt)
}

/** Отметка «тариф выбран». Повторный вызов ничего не меняет. */
export function completePlanOnboarding(companyId: string, now = new Date()): void {
  db.update(companies)
    .set({ onboardingCompletedAt: now })
    .where(and(eq(companies.id, companyId), isNull(companies.onboardingCompletedAt)))
    .run()
}
