/**
 * Насос расписания.
 *
 * Задача: в момент, когда по расписанию меняется программа, выпустить новую
 * публикацию для тех экранов, у которых она действительно должна смениться.
 *
 * Почему это фоновый код, а не часть обработчика публикации: смена программы
 * происходит сама — в 09:00 или в 22:30, когда никто не нажимал кнопку.
 * Обработчик маршрута работает в момент клика и ничего не знает о времени.
 *
 * Живёт в процессе канала устройств по той же причине, что и насос доставки:
 * вся фоновая работа сосредоточена в одном месте процесса, который видит и
 * базу, и сокеты (§3.2 плана). Сокетов сам насос не трогает — он создаёт
 * публикацию, а её развозит насос доставки.
 *
 * Важное ограничение: насос трогает только экраны, у которых публикация уже
 * была. Первое назначение остаётся за оператором — иначе кнопка «назначить»
 * тихо публиковала бы контент на всю сеть, что прямо противоречит смыслу
 * разделения «назначил» и «опубликовал».
 */
import { isNotNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { screenPublications } from '@/db/schema'
import { publishScreens } from '@/server/services/release-service'
import {
  finishExpiredCampaigns,
  invalidatePlanCache,
  screensNeedingScheduleChange,
} from '@/server/services/schedule-service'
import { logger } from '@/lib/logger'

/** Как часто проверять расписание. */
const TICK_MS = 30_000

/**
 * Сколько экранов обрабатывать за один проход.
 *
 * Ограничение не про производительность, а про предсказуемость: разбор
 * расписания на сотне экранов создаёт одну публикацию, и оператор видит
 * ровно одно событие. Без предела одна неудачная конфигурация могла бы
 * породить тысячу мелких публикаций и забить лог доставки.
 */
const MAX_SCREENS_PER_TICK = 200

let timer: NodeJS.Timeout | null = null

export type SchedulePumpStats = {
  ticks: number
  published: number
  screens: number
  campaignsEnded: number
  errors: number
}

const stats: SchedulePumpStats = { ticks: 0, published: 0, screens: 0, campaignsEnded: 0, errors: 0 }

export function schedulePumpStats(): SchedulePumpStats {
  return { ...stats }
}

/** Экраны, у которых публикация уже была: только для них работает расписание. */
function alreadyPublished(): Set<string> {
  const rows = db
    .select({ screenId: screenPublications.screenId })
    .from(screenPublications)
    .where(isNotNull(screenPublications.desiredVersion))
    .all()

  return new Set(rows.map((row) => row.screenId))
}

function tick(): void {
  stats.ticks += 1

  const now = new Date()

  // Кампании с истёкшим сроком выходят из расписания. Это делается здесь,
  // а не по таймеру в интерфейсе: иначе сеть продолжала бы крутить контент
  // прошедшей акции до тех пор, пока кто-нибудь не откроет дашборд.
  const ended = finishExpiredCampaigns(now)
  if (ended > 0) {
    stats.campaignsEnded += ended
    invalidatePlanCache()
  }

  let changes
  try {
    changes = screensNeedingScheduleChange(now)
  } catch (error) {
    stats.errors += 1
    logger.error({ err: error }, 'насос расписания: не удалось разобрать расписание')
    return
  }

  if (changes.length === 0) return

  const published = alreadyPublished()

  const byCompany = new Map<string, string[]>()
  for (const change of changes.slice(0, MAX_SCREENS_PER_TICK)) {
    if (!published.has(change.screenId)) continue

    const list = byCompany.get(change.companyId) ?? []
    list.push(change.screenId)
    byCompany.set(change.companyId, list)
  }

  for (const [companyId, screenIds] of byCompany) {
    try {
      const result = publishScreens({
        companyId,
        screenIds,
        reason: 'смена программы по расписанию',
        at: now,
      })

      stats.published += 1
      stats.screens += result.screens

      logger.info(
        { companyId, version: result.version, screens: result.screens },
        'расписание: программа сменилась, выпущена публикация',
      )
    } catch (error) {
      stats.errors += 1
      logger.error({ err: error, companyId, screens: screenIds.length }, 'расписание: публикация не создана')
    }
  }
}

export function startSchedulePump(intervalMs = TICK_MS): void {
  if (timer) return

  // Первый проход сразу: смена, случившаяся, пока сервер стоял, не должна
  // ждать следующего тика.
  tick()

  timer = setInterval(tick, intervalMs)
  timer.unref?.()

  logger.info({ intervalMs }, 'насос расписания запущен')
}

/** Один проход. Отдельно от таймера, чтобы тесты не поднимали фон. */
export function runSchedulePumpOnce(): void {
  tick()
}

export function stopSchedulePump(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}