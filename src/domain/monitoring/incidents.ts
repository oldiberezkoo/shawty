/**
 * Инциденты: что и когда произошло с экраном.
 *
 * Инцидент — не «экран сейчас офлайн», а **интервал**: когда началось и когда
 * закончилось. Пока нет интервала, нет ответа на вопрос «где и когда была
 * недоступность», а без него любой процент доступности — выдумка.
 *
 * Модуль чистый: принимает состояние экрана и открытые инциденты, отдаёт
 * список действий. Ни базы, ни таймеров — иначе правило невозможно проверить
 * на истории, которую уже нельзя воспроизвести.
 */
import { computeHealth, silenceBeganAt, type ScreenHealth, type ScreenRecordStatus } from './health'

/**
 * Типы инцидентов.
 *
 * `offline` и `reconnected` разведены намеренно: «нет связи» — это интервал,
 * а «вернулся» — событие. Смешивать их в одной записи нельзя, потому что
 * событие не имеет длительности, и в среднем по времени оно испортило бы
 * расчёт доступности.
 */
export const INCIDENT_TYPES = [
  'offline',
  'reconnected',
  'version_mismatch',
  'storage_low',
  'unpaired',
  'revoked',
] as const
export type IncidentType = (typeof INCIDENT_TYPES)[number]

/**
 * Типы-события, а не интервалы.
 *
 * У них нет длительности: «экран вернулся» — это точка во времени, и держать
 * такую запись открытой нельзя. Иначе лента вечно показывала бы «возврат
 * идёт уже полчаса», а расчёт доступности считал бы незакрытый интервал
 * простоя и завышал время недоступности.
 */
export const EVENT_INCIDENT_TYPES: readonly IncidentType[] = ['reconnected']

/** Есть ли у этого типа длительность вообще. */
export function isIntervalIncident(type: IncidentType): boolean {
  return !EVENT_INCIDENT_TYPES.includes(type)
}

/** Инцидент, который ещё не закрыт. */
export type OpenIncident = {
  type: IncidentType
  openedAt: Date
}

export type IncidentInput = {
  recordStatus: ScreenRecordStatus
  lastSeenAt: Date | null
  offlineAfterSec: number
  now: Date
  open: readonly OpenIncident[]
  /** Версия плеера, о которой сообщил экран. */
  playerVersion?: string | null
  /** Минимальная версия плеера, при которой контент показывается корректно. */
  requiredPlayerVersion?: string | null
}

/** Одно изменение в ленте инцидентов. */
export type IncidentAction =
  | { action: 'open'; type: IncidentType; openedAt: Date; detail?: string }
  | { action: 'close'; type: IncidentType; closedAt: Date }

/**
 * Номер версии плеера в сравнимом виде.
 *
 * Сравнение строк сломано на любой из этих строк: «0.10.0» меньше «0.9.0»,
 * потому что сравниваются символы, а не числа. Экран на 0.10 и сервер на 0.9
 * сообщили бы о «совпадении версий» и пропустили бы рассинхронизацию форматов.
 */
export function comparePlayerVersions(a: string, b: string): number {
  const parse = (value: string) => {
    // Пре-релиз отделяется заранее: `0.2.0-rc.1` разбирается на числа
    // [0, 2, 0] и суффикс `rc.1`. Иначе суффикс попал бы в числа как нули, и
    // сборка-кандидат оказывалась бы *новее* релиза — то есть переход с
    // релизной версии на кандидата не поднимал бы тревогу.
    const dash = value.indexOf('-')
    const core = dash === -1 ? value : value.slice(0, dash)
    const prerelease = dash === -1 ? null : value.slice(dash + 1)

    const numbers = core.split('.').map((part) => Number.parseInt(part, 10))
    return { numbers: numbers.map((part) => (Number.isFinite(part) ? part : 0)), prerelease }
  }

  const left = parse(a)
  const right = parse(b)
  const length = Math.max(left.numbers.length, right.numbers.length)

  for (let index = 0; index < length; index += 1) {
    const diff = (left.numbers[index] ?? 0) - (right.numbers[index] ?? 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }

  // Одинаковые номера: пре-релиз предшествует релизу.
  if (left.prerelease === right.prerelease) return 0
  if (left.prerelease === null) return 1
  if (right.prerelease === null) return -1

  return left.prerelease < right.prerelease ? -1 : 1
}

function has(open: readonly OpenIncident[], type: IncidentType): boolean {
  return open.some((incident) => incident.type === type)
}

/**
 * Что сделать с инцидентами экрана прямо сейчас.
 *
 * Порядок правил:
 *
 * 1. Экран не в сети и нет открытого `offline` — открыть.
 * 2. Экран в сети и `offline` открыт — закрыть и записать `reconnected`.
 * 3. Версия плеера ниже требуемой — открыть `version_mismatch`, и **не
 *    закрывать никогда**: это не авария с концом, а состояние до визита.
 *
 * Пункт 3 закрывается только вручную или при обновлении, и это осознанно:
 * «исправилось само» здесь означало бы, что причину никто не устранил.
 */
export function decideIncidents(input: IncidentInput): IncidentAction[] {
  const actions: IncidentAction[] = []
  const health: ScreenHealth = computeHealth(input)

  if (health === 'offline') {
    if (!has(input.open, 'offline')) {
      const began = silenceBeganAt(input)
      actions.push({
        action: 'open',
        type: 'offline',
        // Если heartbeat не было никогда, начало неизвестно, и мы не выдумываем
        // его: отрезок от «неизвестно» до сих пор — это честная оговорка,
        // а ложная точность в отчёте о простоях дороже.
        openedAt: began ?? input.now,
        detail: began ? undefined : 'Heartbeat не поступал ни разу',
      })
    }
  }

  if (health === 'online' && has(input.open, 'offline')) {
    // Закрываем по последнему подтверждённому heartbeat, а не по моменту
    // обнаружения: экран был жив с этого момента, и всё остальное — время,
    // в которое насос просто не смотрел.
    const closedAt = input.lastSeenAt ?? input.now

    actions.push({ action: 'close', type: 'offline', closedAt })
    actions.push({
      action: 'open',
      type: 'reconnected',
      openedAt: closedAt,
      detail: describeSilence(input),
    })
  }

  const { playerVersion, requiredPlayerVersion } = input

  if (
    playerVersion &&
    requiredPlayerVersion &&
    comparePlayerVersions(playerVersion, requiredPlayerVersion) < 0 &&
    !has(input.open, 'version_mismatch')
  ) {
    actions.push({
      action: 'open',
      type: 'version_mismatch',
      openedAt: input.now,
      detail: `Плеер ${playerVersion}, требуется ${requiredPlayerVersion}`,
    })
  }

  return actions
}

/** Сколько молчал экран до возврата — одной строкой, а не только числом. */
function describeSilence(input: IncidentInput): string | undefined {
  const offline = input.open.find((incident) => incident.type === 'offline')
  if (!offline) return undefined

  const seconds = Math.max(0, Math.round((input.now.getTime() - offline.openedAt.getTime()) / 1000))
  return `Молчал ${formatDuration(seconds)}`
}

/**
 * Длительность словами.
 *
 * Число секунд в интерфейсе никто не читает: «молчал 7 минут» понятно,
 * а «молчал 428 секунд» выглядит как ошибка. Форматирование живёт здесь,
 * потому что это часть решения «что записать в ленту», а не вёрстки.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} с`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} мин`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const rest = minutes % 60
    return rest > 0 ? `${hours} ч ${rest} мин` : `${hours} ч`
  }

  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours > 0 ? `${days} дн ${restHours} ч` : `${days} дн`
}