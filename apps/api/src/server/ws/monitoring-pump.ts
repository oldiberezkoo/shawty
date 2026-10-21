/**
 * Насос мониторинга.
 *
 * Задача: превратить текущее состояние экранов в интервалы простоя. Без него
 * «экран упал в 14:03» — единственное, что известно о сбое, и ответить на
 * вопрос «сколько он лежал» нечем.
 *
 * Отдельный насос по той же причине, что насосы доставки и расписания: весь
 * фоновый учёт живёт в процессе канала устройств. Сокетов он не касается —
 * источник истины это `last_seen_at` в базе, а не наличие соединения.
 */
import { db } from '@/db/client'
import { screens } from '@/db/schema'
import { scanCompanyIncidents } from '@/server/services/incident-service'
import { logger } from '@/lib/logger'

/** Как часто проверять здоровье экранов. */
const TICK_MS = 30_000

let timer: NodeJS.Timeout | null = null

export type MonitoringPumpStats = {
  ticks: number
  openedOffline: number
  reconnected: number
  actions: number
  errors: number
}

const stats: MonitoringPumpStats = { ticks: 0, openedOffline: 0, reconnected: 0, actions: 0, errors: 0 }

export function monitoringPumpStats(): MonitoringPumpStats {
  return { ...stats }
}

/**
 * Компании, где есть хоть один экран.
 *
 * Пустые компании обходить незачем: у компании без экранов не бывает простоя,
 * а компаний с нулевыми экранами в базе может быть много.
 */
function companiesWithScreens(): string[] {
  return db
    .selectDistinct({ companyId: screens.companyId })
    .from(screens)
    .all()
    .map((row) => row.companyId)
}

function tick(): void {
  stats.ticks += 1

  const now = new Date()

  let companyIds: string[]
  try {
    companyIds = companiesWithScreens()
  } catch (error) {
    stats.errors += 1
    logger.error({ err: error }, 'насос мониторинга: не удалось прочитать список экранов')
    return
  }

  let opened = 0
  let reconnected = 0

  for (const companyId of companyIds) {
    try {
      const result = scanCompanyIncidents(companyId, now)
      opened += result.openedOffline
      reconnected += result.reconnected
      stats.actions += result.actions
    } catch (error) {
      stats.errors += 1
      logger.error({ err: error, companyId }, 'насос мониторинга: компания не обработана')
    }
  }

  stats.openedOffline += opened
  stats.reconnected += reconnected

  // В лог попадают только новые простои и возвраты. Печатать каждый тик
  // означало бы забить лог молчанием: сеть торгового центра даёт кратковременные
  // обрывы на каждом экране, и читать их список невозможно.
  if (opened > 0) {
    logger.warn({ opened, companies: companyIds.length }, 'насос мониторинга: экраны перестали выходить на связь')
  }

  if (reconnected > 0) {
    logger.info({ reconnected }, 'насос мониторинга: экраны вернулись на связь')
  }
}

export function startMonitoringPump(intervalMs = TICK_MS): void {
  if (timer) return

  // Первый проход сразу: обрыв, случившийся при перезапуске сервера, не
  // должен ждать тика — иначе возврат записался бы раньше самого простоя.
  tick()

  timer = setInterval(tick, intervalMs)
  timer.unref?.()

  logger.info({ intervalMs }, 'насос мониторинга запущен')
}

/** Один проход. Отдельно от таймера, чтобы тесты не поднимали фон. */
export function runMonitoringPumpOnce(): void {
  tick()
}

export function stopMonitoringPump(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}