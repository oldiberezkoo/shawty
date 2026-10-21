/**
 * Хранение инцидентов и чтение ленты.
 *
 * Запись и решение разведены: правило «открыть или закрыть» живёт в
 * `domain/monitoring`, здесь только чтение и запись. Иначе правило стало бы
 * неотличимо от способа хранения и перестало проверяться отдельно.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { db, withImmediateTransaction } from '@/db/client'
import { branches, deviceIncidents, screens } from '@/db/schema'
import { decideIncidents, isIntervalIncident, type IncidentAction, type IncidentType } from '@/domain/monitoring/incidents'
import type { ScreenRecordStatus } from '@/domain/monitoring/health'
import { HttpError } from '@/server/http/errors'

/**
 * Версия плеера, начиная с которой контент показывается корректно.
 *
 * Порог системный, а не настройка компании: профили устройств в P9 будут свои,
 * но общий минимум «плеер должен уметь H.264 с yuv420p и faststart» не может
 * зависеть от того, что ввёл администратор.
 */
export const REQUIRED_PLAYER_VERSION = '0.1.0'

/** Открытые инциденты компании — источник входных данных для решателя. */
function loadOpenIncidents(screenIds: readonly string[]): Map<string, { type: IncidentType; openedAt: Date }[]> {
  const grouped = new Map<string, { type: IncidentType; openedAt: Date }[]>()

  if (screenIds.length === 0) return grouped

  const rows = db
    .select({
      screenId: deviceIncidents.screenId,
      type: deviceIncidents.type,
      openedAt: deviceIncidents.openedAt,
    })
    .from(deviceIncidents)
    .where(and(inArray(deviceIncidents.screenId, screenIds), isNull(deviceIncidents.closedAt)))
    .all()

  for (const row of rows) {
    const list = grouped.get(row.screenId) ?? []
    list.push({ type: row.type, openedAt: row.openedAt })
    grouped.set(row.screenId, list)
  }

  return grouped
}

/** Применяет действия решателя к базе. */
export function applyIncidentActions(
  screenId: string,
  companyId: string,
  actions: readonly IncidentAction[],
): void {
  if (actions.length === 0) return

  withImmediateTransaction((tx) => {
    for (const action of actions) {
      if (action.action === 'open') {
        // Условная вставка по отсутствию открытого инцидента того же типа.
        // Дубликаты исключаются на уровне запроса: лента не должна принимать
        // одно и то же событие дважды.
        const existing = tx
          .select({ id: deviceIncidents.id })
          .from(deviceIncidents)
          .where(
            and(
              eq(deviceIncidents.screenId, screenId),
              eq(deviceIncidents.type, action.type),
              isNull(deviceIncidents.closedAt),
            ),
          )
          .get()

        if (existing) continue

        // Событие рождается закрытым: у него нет длительности, и открытая
        // запись «возврат» тянулась бы дальше любого простоя.
        const closedAt = isIntervalIncident(action.type) ? null : action.openedAt

        tx.insert(deviceIncidents)
          .values({
            id: crypto.randomUUID(),
            screenId,
            companyId,
            type: action.type,
            openedAt: action.openedAt,
            closedAt,
            detail: action.detail ?? null,
          })
          .run()

        continue
      }

      tx.update(deviceIncidents)
        .set({ closedAt: action.closedAt })
        .where(
          and(
            eq(deviceIncidents.screenId, screenId),
            eq(deviceIncidents.type, action.type),
            isNull(deviceIncidents.closedAt),
          ),
        )
        .run()
    }
  })
}

/** Экраны компании с их входными данными для решателя. */
export function screensForMonitoring(companyId: string) {
  return db
    .select({
      id: screens.id,
      recordStatus: screens.status,
      lastSeenAt: screens.lastSeenAt,
      offlineAfterSec: screens.offlineAfterSec,
      playerVersion: screens.playerVersion,
    })
    .from(screens)
    .where(eq(screens.companyId, companyId))
    .all()
}

export type ScreenScanResult = {
  companyId: string
  now: Date
  actions: number
  openedOffline: number
  reconnected: number
}

/**
 * Один проход по компании: открыть, закрыть и записать инциденты.
 *
 * Отдельная функция без таймера — чтобы тесты проверяли поведение, не
 * поднимая фоновый интервал на весь процесс (как насосы доставки и расписания).
 */
export function scanCompanyIncidents(companyId: string, now = new Date()): ScreenScanResult {
  const rows = screensForMonitoring(companyId)
  const screenIds = rows.map((row) => row.id)
  const open = loadOpenIncidents(screenIds)

  let actions = 0
  let openedOffline = 0
  let reconnected = 0

  for (const row of rows) {
    const decisions = decideIncidents({
      recordStatus: row.recordStatus as ScreenRecordStatus,
      lastSeenAt: row.lastSeenAt,
      offlineAfterSec: row.offlineAfterSec,
      now,
      open: open.get(row.id) ?? [],
      playerVersion: row.playerVersion,
      requiredPlayerVersion: REQUIRED_PLAYER_VERSION,
    })

    if (decisions.length === 0) continue

    applyIncidentActions(row.id, companyId, decisions)
    actions += decisions.length

    for (const decision of decisions) {
      if (decision.action === 'open' && decision.type === 'offline') openedOffline += 1
      if (decision.action === 'open' && decision.type === 'reconnected') reconnected += 1
    }
  }

  return { companyId, now, actions, openedOffline, reconnected }
}

/**
 * Инцидент, который открывается по событию, а не по тику насоса.
 *
 * Отзыв доступа и потеря привязки известны в момент действия администратора, и
 * ждать до следующего прохода насоса значило бы показать пустую ленту сразу
 * после того, как человек что-то сделал.
 */
export function recordEventIncident(params: {
  screenId: string
  companyId: string
  type: 'unpaired' | 'revoked'
  detail?: string | null
  now?: Date
}): void {
  const now = params.now ?? new Date()

  const existing = db
    .select({ id: deviceIncidents.id })
    .from(deviceIncidents)
    .where(
      and(
        eq(deviceIncidents.screenId, params.screenId),
        eq(deviceIncidents.type, params.type),
        isNull(deviceIncidents.closedAt),
      ),
    )
    .get()

  if (existing) return

  db.insert(deviceIncidents)
    .values({
      id: crypto.randomUUID(),
      screenId: params.screenId,
      companyId: params.companyId,
      type: params.type,
      openedAt: now,
      detail: params.detail ?? null,
    })
    .run()
}

export type IncidentView = {
  id: string
  screenId: string
  screenName: string
  type: IncidentType
  openedAt: Date
  closedAt: Date | null
  detail: string | null
  durationMs: number | null
}

/**
 * Лента событий компании.
 *
 * Порядок — по времени открытия, а не по вставке: насос может закрыть простой
 * и открыть возврат одной транзакцией, и по времени вставки возврат оказался
 * бы раньше самого простоя.
 */
export function listIncidents(
  companyId: string,
  options: { limit?: number; openOnly?: boolean; screenId?: string } = {},
): IncidentView[] {
  const conditions = [eq(deviceIncidents.companyId, companyId)]

  if (options.openOnly) conditions.push(isNull(deviceIncidents.closedAt))
  if (options.screenId) conditions.push(eq(deviceIncidents.screenId, options.screenId))

  const rows = db
    .select({
      id: deviceIncidents.id,
      screenId: deviceIncidents.screenId,
      screenName: screens.name,
      type: deviceIncidents.type,
      openedAt: deviceIncidents.openedAt,
      closedAt: deviceIncidents.closedAt,
      detail: deviceIncidents.detail,
    })
    .from(deviceIncidents)
    .innerJoin(screens, eq(screens.id, deviceIncidents.screenId))
    .where(and(...conditions))
    .orderBy(desc(deviceIncidents.openedAt))
    .limit(options.limit ?? 50)
    .all()

  const now = Date.now()

  return rows.map((row) => ({
    ...row,
    // У события (возврат) длительности нет вовсе: показывать «0 мин» значит
    // выдумать измеренную величину. Для простоя длительность настоящая.
    durationMs: isIntervalIncident(row.type)
      ? row.closedAt
        ? row.closedAt.getTime() - row.openedAt.getTime()
        : now - row.openedAt.getTime()
      : null,
  }))
}

/** Инциденты за период — для расчёта доступности. */
export function incidentsBetween(
  companyId: string,
  from: Date,
  to: Date,
  types: readonly IncidentType[] = ['offline'],
) {
  return db
    .select({
      screenId: deviceIncidents.screenId,
      type: deviceIncidents.type,
      openedAt: deviceIncidents.openedAt,
      closedAt: deviceIncidents.closedAt,
    })
    .from(deviceIncidents)
    .where(
      and(
        eq(deviceIncidents.companyId, companyId),
        inArray(deviceIncidents.type, [...types]),
        // Инцидент попадает в период, если он пересекается с ним: начало
        // раньше периода, а конец внутри — тоже часть ответа на вопрос.
        lte(deviceIncidents.openedAt, to),
        // Простой попадает в период, если он пересекается с ним: инцидент,
        // начавшийся накануне и закрывшийся сегодня в три часа ночи, —
        // часть ответа на вопрос «где и когда была недоступность».
        or(isNull(deviceIncidents.closedAt), gte(deviceIncidents.closedAt, from)),
      ),
    )
    .orderBy(asc(deviceIncidents.openedAt))
    .all()
}

/** Открытые инциденты простоя — «что лежит прямо сейчас». */
export function openOfflineIncidents(companyId: string) {
  return db
    .select({
      screenId: deviceIncidents.screenId,
      screenName: screens.name,
      branchName: branches.name,
      lastSeenAt: screens.lastSeenAt,
      openedAt: deviceIncidents.openedAt,
    })
    .from(deviceIncidents)
    .innerJoin(screens, eq(screens.id, deviceIncidents.screenId))
    .leftJoin(branches, eq(branches.id, screens.branchId))
    .where(
      and(
        eq(deviceIncidents.companyId, companyId),
        eq(deviceIncidents.type, 'offline'),
        isNull(deviceIncidents.closedAt),
      ),
    )
    .orderBy(asc(deviceIncidents.openedAt))
    .all()
    .map((row) => ({
      ...row,
      // Сколько молчит: считаем от последнего heartbeat, а не от начала
      // инцидента. Они совпадают не всегда, и оператору нужна именно эта цифра.
      silentSeconds: row.lastSeenAt ? Math.floor((Date.now() - row.lastSeenAt.getTime()) / 1000) : null,
    }))
}

/** Сколько секунд экран молчит — для таблицы здоровья. */
export function silenceSecondsFor(companyId: string, now = new Date()): Map<string, number> {
  const rows = db
    .select({ id: screens.id, lastSeenAt: screens.lastSeenAt })
    .from(screens)
    .where(eq(screens.companyId, companyId))
    .all()

  const result = new Map<string, number>()

  for (const row of rows) {
    if (!row.lastSeenAt) continue
    result.set(row.id, Math.max(0, Math.floor((now.getTime() - row.lastSeenAt.getTime()) / 1000)))
  }

  return result
}

/** Проверка, что инцидент принадлежит компании: лента не должна течь по id. */
export function requireIncidentCompany(incidentId: string, companyId: string): void {
  const row = db
    .select({ id: deviceIncidents.id })
    .from(deviceIncidents)
    .where(and(eq(deviceIncidents.id, incidentId), eq(deviceIncidents.companyId, companyId)))
    .get()

  if (!row) throw HttpError.notFound('Инцидент не найден')
}

/** Сколько открытых инцидентов каждого типа — для пороговых алертов. */
export function openIncidentCounts(companyId: string): Record<string, number> {
  const rows = db
    .select({ type: deviceIncidents.type, count: sql<number>`count(*)` })
    .from(deviceIncidents)
    .where(and(eq(deviceIncidents.companyId, companyId), isNull(deviceIncidents.closedAt)))
    .groupBy(deviceIncidents.type)
    .all()

  return Object.fromEntries(rows.map((row) => [row.type, Number(row.count)]))
}

/** За последние сутки, для сводки на обзорной странице. */
export function incidentsSince(companyId: string, since: Date) {
  return db
    .select({ type: deviceIncidents.type, count: sql<number>`count(*)` })
    .from(deviceIncidents)
    .where(and(eq(deviceIncidents.companyId, companyId), gte(deviceIncidents.openedAt, since)))
    .groupBy(deviceIncidents.type)
    .all()
}