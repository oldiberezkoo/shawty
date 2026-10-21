/**
 * Точка входа API: Hono + WebSocket на одном порту.
 *
 * Один процесс важен для SQLite: соединение открыто ровно одно, а насосы
 * доставки и расписания работают в том же процессе, что и HTTP-обработчики.
 */
import { createServer, type IncomingMessage } from 'node:http'
import { parse } from 'node:url'
import { getRequestListener } from '@hono/node-server'
import { WebSocketServer } from 'ws'

import { createApp } from '@/app'
import { serverConfig } from '@/config/server'
import { handleDeviceConnection } from '@/server/ws/device'
import { deviceHub } from '@/server/ws/hub'
import { startDeliveryPump, stopDeliveryPump } from '@/server/ws/delivery-pump'
import { startSchedulePump, stopSchedulePump } from '@/server/ws/schedule-pump'
import { startMonitoringPump, stopMonitoringPump } from '@/server/ws/monitoring-pump'
import { expireStaleSessions } from '@/server/services/pairing-service'
import { pruneRateLimitBuckets } from '@/server/http/rate-limit'
import { logger } from '@/lib/logger'
import { loadOrCreateSecret } from '@/lib/secret-store'

const dev = process.env.NODE_ENV !== 'production'

function isOriginAllowed(request: IncomingMessage): boolean {
  const origin = request.headers.origin
  if (!origin) return true // не браузер: плеер и curl не присылают Origin

  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return false
  }

  const allowed = new Set<string>()
  try {
    allowed.add(new URL(serverConfig.publicUrl).host)
  } catch {
    // Некорректный PUBLIC_URL: ниже останется проверка по Host.
  }
  try {
    allowed.add(new URL(serverConfig.apiUrl).host)
  } catch {
    // Некорректный API_PUBLIC_URL.
  }

  if (allowed.has(originHost)) return true

  // Локальная разработка: веб и API на разных портах, но один хост.
  if (!dev) return false
  const host = request.headers.host
  return typeof host === 'string' && originHost === host
}

async function main(): Promise<void> {
  loadOrCreateSecret()

  const app = await createApp()
  const server = createServer(getRequestListener(app.fetch))

  const deviceWss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 })

  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url ?? '/')

    if (pathname !== '/ws/device') {
      socket.destroy()
      return
    }

    if (!isOriginAllowed(request)) {
      logger.warn({ origin: request.headers.origin }, 'ws upgrade с запрещённого Origin')
      socket.destroy()
      return
    }

    deviceWss.handleUpgrade(request, socket, head, (ws) => {
      handleDeviceConnection(ws, request)
    })
  })

  const sweepTimer = setInterval(() => {
    deviceHub.sweep()
  }, 30_000)

  startDeliveryPump()
  startSchedulePump()
  startMonitoringPump()

  const cleanupTimer = setInterval(() => {
    try {
      const expired = expireStaleSessions()
      const pruned = pruneRateLimitBuckets()
      if (expired > 0 || pruned > 0) {
        logger.info({ expired, pruned }, 'плановая уборка')
      }
    } catch (error) {
      logger.error({ err: error }, 'уборка не удалась')
    }
  }, 60_000)

  server.listen(serverConfig.port, () => {
    logger.info(
      { port: serverConfig.port, dev, webUrl: serverConfig.publicUrl },
      `SHAWTY API слушает http://localhost:${serverConfig.port}`,
    )
    if (!dev && !process.env.SERVER_SECRET) {
      logger.warn(
        {},
        'SERVER_SECRET не задан: используется локальный файл data/.secret. ' +
          'В продакшене задайте переменную окружения явно.',
      )
    }
  })

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'завершаю работу')
    clearInterval(sweepTimer)
    clearInterval(cleanupTimer)
    stopDeliveryPump()
    stopSchedulePump()
    stopMonitoringPump()
    deviceHub.closeAll()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5000).unref()
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'сервер не запустился')
  process.exit(1)
})
