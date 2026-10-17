import type { WebSocket } from 'ws'
import { encodeFrame, type ServerFrame } from './protocol'
import { logger } from '@/lib/logger'

/**
 * Реестр подключений устройств.
 *
 * Сокеты намеренно не хранятся в базе: после перезапуска процесса все
 * подключения всё равно разорвутся, а устройства восстановятся по heartbeat.
 */
type DeviceConnection = {
  socket: WebSocket
  screenId: string | null
  companyId: string | null
  deviceId: string | null
  /** Сессия привязки, за которой наблюдает это устройство. */
  watchedPairingSessionId: string | null
  isAlive: boolean
  connectedAt: number
}

class DeviceHub {
  private readonly byScreenId = new Map<string, Set<DeviceConnection>>()
  private readonly byPairingSessionId = new Map<string, DeviceConnection>()
  private readonly all = new Set<DeviceConnection>()

  add(connection: DeviceConnection): void {
    this.all.add(connection)
    this.byPairingSessionId.delete(connection.watchedPairingSessionId ?? '')
  }

  remove(connection: DeviceConnection): void {
    this.all.delete(connection)

    if (connection.screenId) {
      const set = this.byScreenId.get(connection.screenId)
      if (set) {
        set.delete(connection)
        if (set.size === 0) this.byScreenId.delete(connection.screenId)
      }
    }

    if (connection.watchedPairingSessionId) {
      const watcher = this.byPairingSessionId.get(connection.watchedPairingSessionId)
      if (watcher === connection) {
        this.byPairingSessionId.delete(connection.watchedPairingSessionId)
      }
    }
  }

  bindScreen(connection: DeviceConnection, screenId: string, companyId: string, deviceId: string): void {
    connection.screenId = screenId
    connection.companyId = companyId
    connection.deviceId = deviceId

    const set = this.byScreenId.get(screenId) ?? new Set<DeviceConnection>()
    set.add(connection)
    this.byScreenId.set(screenId, set)
  }

  watchPairing(connection: DeviceConnection, sessionId: string): void {
    if (connection.watchedPairingSessionId) {
      this.byPairingSessionId.delete(connection.watchedPairingSessionId)
    }
    connection.watchedPairingSessionId = sessionId
    // На одну сессию привязки приходится ровно один телевизор: перетираем прежнего,
    // иначе подтверждение ушло бы случайному наблюдателю.
    this.byPairingSessionId.set(sessionId, connection)
  }

  /**
   * Уведомляет телевизор, что привязка подтверждена.
   *
   * Секретов в кадре нет намеренно: учётные данные телевизор забирает сам
   * по HTTP, доказывая владение локальным nonce. Поэтому подтверждение
   * работает и когда сокета нет, а канал остаётся простым ускорителем.
   */
  notifyPairingConfirmed(sessionId: string, screenId: string): boolean {
    const connection = this.byPairingSessionId.get(sessionId)
    if (!connection) return false

    send(connection, { type: 'pairing.confirmed', screenId })
    return true
  }

  /**
   * Отправляет манифест всем подключённым экранам компании.
   *
   * Возвращает число доставленных: панель показывает его как «отправлено»,
   * а не как «должно быть отправлено». Разница между отправленным и
   * применённым — это и есть суть контроля результата.
   */
  sendManifest(companyId: string, frame: ServerFrame): number {
    let delivered = 0

    for (const connection of this.all) {
      if (connection.companyId !== companyId) continue
      if (send(connection, frame)) delivered += 1
    }

    return delivered
  }

  sendToScreens(screenIds: readonly string[], frame: ServerFrame): number {
    let delivered = 0

    for (const screenId of screenIds) {
      const set = this.byScreenId.get(screenId)
      if (!set) continue
      for (const connection of set) {
        if (send(connection, frame)) delivered += 1
      }
    }

    return delivered
  }

  /** Рассылка ping и отключение тех, кто не ответил. */
  sweep(): void {
    for (const connection of [...this.all]) {
      if (!connection.isAlive) {
        logger.debug({}, 'соединение не ответило на ping, закрываем')
        connection.socket.terminate()
        continue
      }

      connection.isAlive = false
      send(connection, { type: 'ping', at: Date.now() })
    }
  }

  closeAll(): void {
    for (const connection of [...this.all]) {
      connection.socket.close(1001, 'Сервер перезапускается')
    }
    this.all.clear()
    this.byScreenId.clear()
    this.byPairingSessionId.clear()
  }
}

function send(connection: DeviceConnection, frame: ServerFrame): boolean {
  if (connection.socket.readyState !== connection.socket.OPEN) return false
  try {
    connection.socket.send(encodeFrame(frame))
    return true
  } catch (error) {
    logger.warn({ err: error }, 'не удалось отправить кадр устройству')
    return false
  }
}

export type { DeviceConnection }

/**
 * Реестр подключений устройств — общий синглтон на весь процесс.
 *
 * Важная деталь: приложение состоит из двух независимых реестров модулей.
 * Кастомный сервер (`server/index.ts`) запускается через tsx, а обработчики
 * маршрутов Next собираются Turbopack в собственный бандл. Обычный
 * `export const deviceHub = new DeviceHub()` создал бы ДВА разных объекта:
 * подтверждение привязки доставляло бы токен в реестр, который никто не
 * читает, а дашборд всегда показывал бы экраны офлайн.
 *
 * Объединение возможно только через `globalThis` — он у них общий.
 * `Symbol.for` гарантирует один и тот же ключ во всех копиях модуля.
 */
const HUB_KEY = Symbol.for('shawty.deviceHub')

function getHub(): DeviceHub {
  const store = globalThis as Record<symbol, unknown>
  const existing = store[HUB_KEY]

  if (existing instanceof DeviceHub) return existing

  const created = new DeviceHub()
  store[HUB_KEY] = created
  return created
}

export const deviceHub: DeviceHub = getHub()
