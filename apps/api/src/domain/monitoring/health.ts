/**
 * Здоровье экрана: одно правило на всех.
 *
 * Определение «нет связи» живёт здесь потому, что оно нужно сразу трём
 * слоям — списку экранов в дашборде, насосу инцидентов и расчёту
 * доступности. Две копии этого правила разошлись бы за неделю: список показал
 * бы «онлайн», а отчёт — «недоступность», и разобраться в этом было бы
 * невозможно.
 *
 * Источник истины — время последнего heartbeat в базе, а не наличие сокета.
 * Обработчики маршрутов Next и канал устройств работают в разных изоляциях
 * процесса и не делят память, поэтому «сокет подключён» из дашборда не видно
 * в принципе (§3.2 плана).
 */

/** Состояние записи экрана в базе. */
export type ScreenRecordStatus = 'paired' | 'disabled' | 'revoked' | 'unpaired'

/**
 * Итоговое состояние экрана.
 *
 * Отличается от состояния записи: экран может быть `paired` в базе и при этом
 * не выходить на связь. Называть это «состоянием экрана» в интерфейсе честно,
 * а не «состоянием записи» — оператора интересует первое.
 */
export type ScreenHealth = 'online' | 'offline' | 'disabled' | 'unpaired' | 'revoked'

/**
 * Порог «нет связи» по умолчанию, секунды.
 *
 * Ниже 60 секунд даёт ложные тревоги: сеть торгового центра мигает постоянно,
 * и по одному пропущенному heartbeat экран выглядел бы недоступным каждые
 * полторы минуты.
 */
export const DEFAULT_OFFLINE_AFTER_SEC = 90

export type HealthInput = {
  recordStatus: ScreenRecordStatus
  lastSeenAt: Date | null
  offlineAfterSec: number
  now: Date
}

/**
 * Итоговое состояние.
 *
 * Порядок проверок значим: отозванный экран остаётся отозванным, даже если он
 * вдруг прислал heartbeat. Иначе устройство с удалённым доверием числилось бы
 * онлайн, а оператор не видел бы, что доступ убран.
 */
export function computeHealth(input: HealthInput): ScreenHealth {
  const { recordStatus, lastSeenAt, offlineAfterSec, now } = input

  if (recordStatus === 'revoked') return 'revoked'
  if (recordStatus === 'disabled') return 'disabled'
  if (recordStatus === 'unpaired') return 'unpaired'

  if (lastSeenAt) {
    const ageSeconds = (now.getTime() - lastSeenAt.getTime()) / 1000
    if (ageSeconds <= Math.max(1, offlineAfterSec)) return 'online'
  }

  return 'offline'
}

/** На связи ли экран прямо сейчас. */
export function isOnline(health: ScreenHealth): boolean {
  return health === 'online'
}

/**
 * Когда экран замолчал.
 *
 * Это `lastSeenAt + offline_after_sec`, а не время, когда насос это заметил.
 * Разница — до интервала насоса (полминуты), и именно она попала бы в отчёт
 * как «недоступность началась позже, чем на самом деле»: вопрос отчёта «где и
 * когда была недоступность» требует ответа по факту молчания.
 *
 * Если heartbeat не было никогда, момент начала неизвестен, и возвращается
 * `null` — честнее, чем выдуманное «сейчас».
 */
export function silenceBeganAt(input: {
  lastSeenAt: Date | null
  offlineAfterSec: number
}): Date | null {
  if (!input.lastSeenAt) return null

  return new Date(input.lastSeenAt.getTime() + Math.max(1, input.offlineAfterSec) * 1000)
}

/**
 * Сколько секунд экран молчит.
 *
 * `null`, если heartbeat не было ни разу: «молчит уже 400 дней» — это не
 * диагноз, а мусор в интерфейсе.
 */
export function silentSeconds(lastSeenAt: Date | null, now: Date): number | null {
  if (!lastSeenAt) return null

  return Math.max(0, Math.floor((now.getTime() - lastSeenAt.getTime()) / 1000))
}