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

  isOnline(screenId: string): boolean {
    return (this.byScreenId.get(screenId)?.size ?? 0) > 0
  }

  onlineScreenIds(): string[] {
    return [...this.byScreenId.keys()]
  }

  /** Доставить одноразовый токен выдачи учётных данных телевизору. */
  deliverEnrollment(sessionId: string, enrollmentToken: string, expiresInMs: number): boolean {
    const connection = this.byPairingSessionId.get(sessionId)
    if (!connection) return false

    send(connection, { type: 'pairing.confirmed', enrollmentToken, expiresInMs })
    return true
  }

  notifyExpired(sessionId: string): void {
    const connection = this.byPairingSessionId.get(sessionId)
    if (connection) {
      send(connection, { type: 'pairing.expired' })
    }
  }

  sendToScreen(screenId: string, frame: ServerFrame): number {
    const set = this.byScreenId.get(screenId)
    if (!set) return 0

    let delivered = 0
    for (const connection of set) {
      if (send(connection, frame)) delivered += 1
    }
    return delivered
  }

  sendToCompany(companyId: string, frame: ServerFrame): number {
    let delivered = 0
    for (const connection of this.all) {
      if (connection.companyId === companyId && send(connection, frame)) {
        delivered += 1
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

  stats(): { total: number; onlineScreens: number } {
    return { total: this.all.size, onlineScreens: this.byScreenId.size }
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

export const deviceHub = new DeviceHub()
