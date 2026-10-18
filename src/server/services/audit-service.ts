/**
 * Журнал действий сотрудников.
 *
 * Пишется при каждом значимом действии и только при успешном. Журнал, который
 * молчит об отвязке экрана и ротации секрета, хуже отсутствующего: он выглядит
 * полным, и на него перестают смотреть именно тогда, когда он нужен.
 *
 * Запись идёт в ту же транзакцию, что и само действие. Отдельной записью
 * журнал «увидел бы» отвязанный экран, даже если запись об отвязке не
 * прошла бы по причине обрыва, — и наоборот, действие без следа.
 */
import { and, asc, count, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm'
import { db, type Transaction } from '@/db/client'
import { auditLog, users } from '@/db/schema'
import { HttpError } from '@/server/http/errors'

/**
 * Каталог действий.
 *
 * Нужен не для красоты, а для двух вещей: чтобы интерфейс не показывал
 * «неизвестное действие» на собственном же действии, и чтобы реестр можно было
 * проверить тестом — запись с действием вне каталога означала бы опечатку,
 * которая тихо потерялась бы в фильтре.
 */
export const AUDIT_ACTIONS = {
  'pairing.confirmed': 'Экран привязан',
  'screen.disabled': 'Экран отключён',
  'screen.enabled': 'Экран включён',
  'screen.unpaired': 'Экран отвязан',
  'screen.rotated': 'Секрет экрана заменён',
  'media.deleted': 'Файл удалён',
  'media.forced_deleted': 'Файл удалён принудительно',
  'playlist.published': 'Версия плейлиста зафиксирована',
  'playlist.deleted': 'Плейлист удалён',
  'campaign.created': 'Кампания создана',
  'campaign.approve': 'Кампания согласована',
  'campaign.activate': 'Кампания запущена',
  'campaign.end': 'Кампания завершена',
  'campaign.archive': 'Кампания в архиве',
  'campaign.deleted': 'Кампания удалена',
  'campaign.published': 'Кампания опубликована',
  'assignment.changed': 'Назначение контента изменено',
  'release.published': 'Публикация выпущена',
} as const

export type AuditAction = keyof typeof AUDIT_ACTIONS

/** Группы для фильтра в интерфейсе. Порядок — от частого к редкому. */
export const AUDIT_GROUPS: { label: string; prefix: string }[] = [
  { label: 'Все', prefix: '' },
  { label: 'Экраны', prefix: 'screen.' },
  { label: 'Привязка', prefix: 'pairing.' },
  { label: 'Контент', prefix: 'media.' },
  { label: 'Плейлисты', prefix: 'playlist.' },
  { label: 'Кампании', prefix: 'campaign.' },
  { label: 'Публикация', prefix: 'release.' },
  { label: 'Назначения', prefix: 'assignment.' },
]

export type AuditInput = {
  companyId: string
  actorUserId?: string | null
  action: AuditAction
  targetType?: string | null
  targetId?: string | null
  meta?: Record<string, unknown> | null
  ip?: string | null
}

/**
 * Запись в журнал вне транзакции.
 *
 * Метаданные урезаются по длине: строка в журнале должна читаться, а журнал
 * растёт бесконечно, и одно действие с длинным именем файла способно занять
 * в нём больше, чем всё остальное за месяц.
 */
export function recordAudit(input: AuditInput): void {
  writeAudit(db as unknown as Transaction, input, new Date())
}

/** Запись внутри транзакции действия. */
export function recordAuditTx(tx: Transaction, input: AuditInput): void {
  writeAudit(tx, input, input.at ?? new Date())
}

function writeAudit(tx: Transaction, input: AuditInput, at: Date): void {
  tx.insert(auditLog)
    .values({
      id: crypto.randomUUID(),
      companyId: input.companyId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId?.slice(0, 64) ?? null,
      metaJson: input.meta ? JSON.stringify(input.meta).slice(0, 2000) : null,
      ip: input.ip?.slice(0, 64) ?? null,
      at,
    })
    .run()
}

export type AuditRow = {
  id: string
  action: string
  actionLabel: string
  targetType: string | null
  targetId: string | null
  meta: Record<string, unknown> | null
  ip: string | null
  at: Date
  actorUserId: string | null
  actorName: string | null
}

export type AuditQuery = {
  companyId: string
  from?: Date | null
  to?: Date | null
  actorUserId?: string | null
  prefix?: string | null
  limit?: number
  offset?: number
}

/**
 * Чтение журнала с фильтрами.
 *
 * Фильтр по компании обязателен и стоит первым: журнал — это персональные
 * данные сотрудников, и выдача чужой компании была бы утечкой, а не ошибкой
 * отображения.
 */
export function listAudit(query: AuditQuery): { rows: AuditRow[]; total: number } {
  const limit = Math.min(500, Math.max(1, query.limit ?? 50))
  const offset = Math.max(0, query.offset ?? 0)

  const conditions: SQL[] = [eq(auditLog.companyId, query.companyId)]

  if (query.from) conditions.push(gte(auditLog.at, query.from))
  if (query.to) conditions.push(lte(auditLog.at, query.to))
  if (query.actorUserId) conditions.push(eq(auditLog.actorUserId, query.actorUserId))
  if (query.prefix) conditions.push(sql`${auditLog.action} LIKE ${query.prefix}%`)

  const where = and(...conditions)

  const total =
    Number(db.select({ value: count() }).from(auditLog).where(where).get()?.value ?? 0)

  const rows = db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      metaJson: auditLog.metaJson,
      ip: auditLog.ip,
      at: auditLog.at,
      actorUserId: auditLog.actorUserId,
      actorName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(where)
    .orderBy(desc(auditLog.at))
    .limit(limit)
    .offset(offset)

  const parsed = rows.all()

  return {
    total,
    rows: parsed.map((row) => ({
      id: row.id,
      action: row.action,
      actionLabel: AUDIT_ACTIONS[row.action as AuditAction] ?? row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      meta: parseMeta(row.metaJson),
      ip: row.ip,
      at: row.at,
      actorUserId: row.actorUserId,
      actorName: row.actorName,
    })),
  }
}

/**
 * Разбор метаданных.
 *
 * Битое JSON не должно ронять страницу журнала: запись могла остаться от
 * старой версии кода или обрезаться по длине.
 */
function parseMeta(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null

  try {
    const value = JSON.parse(raw) as unknown
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Кто и что делал за период — для отчёта по сотрудникам. */
export function auditByActor(query: { companyId: string; from: Date; to: Date }) {
  return db
    .select({
      actorUserId: auditLog.actorUserId,
      actorName: users.name,
      actions: count(),
      lastActionAt: sql<Date>`max(${auditLog.at})`,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(
      and(eq(auditLog.companyId, query.companyId), gte(auditLog.at, query.from), lte(auditLog.at, query.to)),
    )
    .groupBy(auditLog.actorUserId)
    .orderBy(desc(count()))
    .all()
    .map((row) => ({
      actorUserId: row.actorUserId,
      actorName: row.actorName ?? 'Система',
      actions: Number(row.actions),
      lastActionAt: row.lastActionAt,
    }))
}

/** Сотрудники, оставившие записи: источник для фильтра в интерфейсе. */
export function auditActors(companyId: string) {
  return db
    .selectDistinct({ actorUserId: auditLog.actorUserId, actorName: users.name })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(eq(auditLog.companyId, companyId))
    .orderBy(asc(users.name))
    .all()
}

/** Выгрузка журнала в CSV — тот же состав, что и на экране. */
export function auditCsv(rows: AuditRow[]): string {
  const header = ['at', 'actor', 'action', 'action_label', 'target_type', 'target_id', 'ip', 'meta']

  const lines = rows.map((row) =>
    [
      row.at.toISOString(),
      row.actorName ?? '',
      row.action,
      row.actionLabel,
      row.targetType ?? '',
      row.targetId ?? '',
      row.ip ?? '',
      row.meta ? JSON.stringify(row.meta) : '',
    ]
      .map(csvCell)
      .join(','),
  )

  return [header.join(','), ...lines].join('\n')
}

function csvCell(value: string): string {
  if (!/[",\n]/.test(value)) return value

  return `"${value.replace(/"/g, '""')}"`
}

/** Разбор границ периода журнала. */
export function parseAuditPeriod(fromRaw: string | null, toRaw: string | null): { from: Date; to: Date } {
  const now = new Date()
  const to = toRaw ? new Date(toRaw) : now
  const from = fromRaw ? new Date(fromRaw) : new Date(to.getTime() - 30 * 24 * 60 * 60_000)

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw HttpError.badRequest('invalid_period', 'Не удалось разобрать дату периода')
  }

  if (from.getTime() > to.getTime()) {
    throw HttpError.badRequest('invalid_period', 'Начало периода позже конца')
  }

  return { from, to }
}