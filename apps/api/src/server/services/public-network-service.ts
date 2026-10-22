import { sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { deviceTelemetrySamples, screens } from '@/db/schema'
import { computeHealth } from '@/domain/monitoring/health'

/**
 * Публичная сводка по сети.
 *
 * Наружу отдаём только агрегаты: количество экранов на обслуживании,
 * количество экранов на связи и суммарную оценку канала по последним
 * heartbeat. Ни названий компаний, ни экранов, ни пользователей здесь нет.
 */
export type PublicNetworkStats = {
  /** Парные экраны во всех компаниях. */
  screens: number
  /** Из них те, чей последний heartbeat укладывается в offlineAfterSec. */
  online: number
  /**
   * Сумма последних значений downlink по онлайн-экранам, Мбит/с.
   *
   * Network Information API сообщает оценку пропускной способности, а не
   * биллинг трафика. Поэтому наружу это уходит как «канал», а не «объём».
   */
  downlinkMbps: number | null
  /** Время самого свежего heartbeat, который участвовал в расчёте. */
  measuredAt: string | null
  generatedAt: string
}

export function getPublicNetworkStats(): PublicNetworkStats {
  const now = new Date()

  const screenRows = db
    .select({
      id: screens.id,
      status: screens.status,
      lastSeenAt: screens.lastSeenAt,
      offlineAfterSec: screens.offlineAfterSec,
    })
    .from(screens)
    .all()

  const paired = screenRows.filter((screen) => screen.status === 'paired')
  const onlineIds = new Set<string>()

  for (const screen of paired) {
    const health = computeHealth({
      recordStatus: screen.status,
      lastSeenAt: screen.lastSeenAt,
      offlineAfterSec: screen.offlineAfterSec,
      now,
    })

    if (health === 'online') onlineIds.add(screen.id)
  }

  // Последний сэмпл на экран. Оконные функции SQLite здесь не нужны: таблица
  // небольшая, а коррелированный max(at) читается заметно проще.
  const latestRows = db
    .select({
      screenId: deviceTelemetrySamples.screenId,
      downlinkKbps: deviceTelemetrySamples.downlinkKbps,
      at: deviceTelemetrySamples.at,
    })
    .from(deviceTelemetrySamples)
    .where(
      sql`${deviceTelemetrySamples.at} = (
        select max(t.at)
        from device_telemetry_samples t
        where t.screen_id = ${deviceTelemetrySamples.screenId}
      )`,
    )
    .all()

  let downlinkKbps = 0
  let hasDownlink = false
  let measuredAtMs = 0

  for (const row of latestRows) {
    if (!onlineIds.has(row.screenId)) continue

    if (row.downlinkKbps != null && Number.isFinite(row.downlinkKbps)) {
      downlinkKbps += row.downlinkKbps
      hasDownlink = true
    }

    const at = row.at.getTime()
    if (at > measuredAtMs) measuredAtMs = at
  }

  return {
    screens: paired.length,
    online: onlineIds.size,
    downlinkMbps: hasDownlink ? Math.round((downlinkKbps / 1000) * 10) / 10 : null,
    measuredAt: measuredAtMs > 0 ? new Date(measuredAtMs).toISOString() : null,
    generatedAt: now.toISOString(),
  }
}
