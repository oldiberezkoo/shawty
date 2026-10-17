/**
 * Насос доставки.
 *
 * Задача: отправить манифест тем экранам, у которых есть живое соединение.
 *
 * Почему насос, а не вызов из обработчика публикации: обработчики маршрутов
 * Next и канал устройств работают в разных изоляциях процесса и не разделят
 * память. Реестр сокетов в обработчике маршрута всегда пуст — это уже
 * проявлялось в привязке, где попытка доставить кадр оттуда давала
 * `delivered: false`. Здесь используется тот же приём, который сработал:
 * единственный общий носитель между слоями — база SQLite.
 *
 * Насос берёт чеки в состоянии `queued`, отправляет манифест и переводит их
 * в `sent`. Экраны без соединения остаются в `queued` и попадают в число
 * «нет связи» — это честнее, чем считать их отправленными.
 */
import { and, eq, inArray, lt, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { deliveryReceipts, releases, screens } from '@/db/schema'
import { buildScreenManifest } from '@/server/services/release-service'
import { deviceHub } from './hub'
import { logger } from '@/lib/logger'

/** Как часто просматриваем очередь доставки. */
const TICK_MS = 2000

/**
 * Через сколько повторно отправляем уже отправленное.
 *
 * Устройство могло переподключиться между отправкой и применением: сокет
 * закрылся, манифест не доехал. Без повторной отправки такой экран ждал бы
 * следующей публикации, показывая старое — при формально успешной доставке.
 */
const RESEND_AFTER_MS = 60_000

let timer: NodeJS.Timeout | null = null

export type DeliveryPumpStats = {
  ticks: number
  sent: number
  resent: number
  skippedOffline: number
  errors: number
}

const stats: DeliveryPumpStats = { ticks: 0, sent: 0, resent: 0, skippedOffline: 0, errors: 0 }

export function deliveryPumpStats(): DeliveryPumpStats {
  return { ...stats }
}

type PendingRow = {
  receiptId: string
  releaseId: string
  companyId: string
  screenId: string
  state: typeof deliveryReceipts.$inferSelect.state
  sentAt: Date | null
  updatedAt: Date
}

function loadPending(): PendingRow[] {
  // Порог передаётся числом миллисекунд, а не объектом Date: better-sqlite3
  // умеет привязывать только числа, строки, буферы и null, и падает на дате.
  // Колонка updated_at хранится именно в миллисекундах.
  const resendThreshold = Date.now() - RESEND_AFTER_MS

  // Условие намеренно в SQL, а не в фильтре по загруженным строкам:
  // иначе в память подтягивались бы все чеки компании, включая применённые.
  return db
    .select({
      receiptId: deliveryReceipts.id,
      releaseId: deliveryReceipts.releaseId,
      companyId: screens.companyId,
      screenId: deliveryReceipts.screenId,
      state: deliveryReceipts.state,
      sentAt: deliveryReceipts.sentAt,
      updatedAt: deliveryReceipts.updatedAt,
    })
    .from(deliveryReceipts)
    .innerJoin(releases, eq(releases.id, deliveryReceipts.releaseId))
    .innerJoin(screens, eq(screens.id, deliveryReceipts.screenId))
    .where(
      and(
        inArray(deliveryReceipts.state, ['queued', 'sent']),
        sql`(${deliveryReceipts.state} = 'queued' OR ${deliveryReceipts.updatedAt} < ${resendThreshold})`,
      ),
    )
    .limit(500)
    .all()
}

function deliver(row: PendingRow): 'sent' | 'skipped' | 'error' {
  // Экран без живого соединения получит манифест при следующем опросе
  // состояния. Отправлять некуда, и помечать «отправлено» было бы враньём.
  if (!deviceHub.isOnline(row.screenId)) {
    stats.skippedOffline += 1
    return 'skipped'
  }

  const release = db
    .select({ version: releases.manifestVersion })
    .from(releases)
    .where(eq(releases.id, row.releaseId))
    .get()

  if (!release) return 'skipped'

  const manifest = buildScreenManifest(row.companyId, row.screenId, release.version)

  if (!manifest) {
    // Назначение есть, но показывать нечего: все файлы не готовы или удалены.
    // Экран покажет «нет назначенного контента», а панель — состояние без ошибки.
    stats.skippedOffline += 1
    return 'skipped'
  }

  const delivered = deviceHub.sendToScreens([row.screenId], {
    type: 'assignment',
    releaseVersion: release.version,
    manifest,
  })

  if (delivered === 0) {
    stats.skippedOffline += 1
    return 'skipped'
  }

  const now = new Date()

  db.update(deliveryReceipts)
    .set({
      state: 'sent',
      sentAt: row.state === 'queued' ? now : row.sentAt,
      updatedAt: now,
      attempts: sql`${deliveryReceipts.attempts} + 1`,
    })
    .where(eq(deliveryReceipts.id, row.receiptId))
    .run()

  if (row.state === 'queued') stats.sent += 1
  else stats.resent += 1

  return 'sent'
}

function tick(): void {
  stats.ticks += 1

  let pending: PendingRow[]
  try {
    pending = loadPending()
  } catch (error) {
    stats.errors += 1
    logger.error({ err: error }, 'насос доставки: не удалось прочитать очередь')
    return
  }

  if (pending.length === 0) return

  for (const row of pending) {
    try {
      deliver(row)
    } catch (error) {
      stats.errors += 1
      logger.error({ err: error, screenId: row.screenId }, 'насос доставки: экран не обработан')
    }
  }
}

export function startDeliveryPump(intervalMs = TICK_MS): void {
  if (timer) return

  // Первый проход сразу: публикация, случившаяся до запуска, не ждёт тика.
  tick()

  timer = setInterval(tick, intervalMs)
  // Не держим процесс ради насоса: корректное завершение важнее.
  timer.unref?.()

  logger.info({ intervalMs }, 'насос доставки запущен')
}

export function stopDeliveryPump(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

/** Проверка для интеграционных тестов: ждать опустошения очереди доставки. */
export function pendingCount(): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(deliveryReceipts)
    .where(inArray(deliveryReceipts.state, ['queued', 'downloading']))
    .get()
  return Number(row?.n ?? 0)
}

/** Чеки конкретного экрана — для проверок и диагностики. */
export function receiptsForScreen(screenId: string) {
  return db
    .select({
      state: deliveryReceipts.state,
      updatedAt: deliveryReceipts.updatedAt,
      sentAt: deliveryReceipts.sentAt,
    })
    .from(deliveryReceipts)
    .where(eq(deliveryReceipts.screenId, screenId))
    .all()
}

/** Публикации, застрявшие дольше порога: основа для повторной доставки и алертов. */
export function stuckReceipts(olderThanMs = 15 * 60_000) {
  const threshold = new Date(Date.now() - olderThanMs)

  return db
    .select({
      screenId: deliveryReceipts.screenId,
      state: deliveryReceipts.state,
      updatedAt: deliveryReceipts.updatedAt,
    })
    .from(deliveryReceipts)
    .where(
      and(
        inArray(deliveryReceipts.state, ['queued', 'sent', 'downloading', 'failed']),
        lt(deliveryReceipts.updatedAt, threshold),
      ),
    )
    .all()
}
