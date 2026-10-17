/**
 * Единая точка входа: один процесс поднимает Next и WebSocket на одном порту.
 *
 * Почему так: SQLite открыт одним соединением на процесс, и разносить его
 * между «воркерами» Next нельзя. Один порт заодно упрощает экспорт: один
 * адрес для дашборда, один для плеера, один Origin для проверки.
 */
import { createServer, type IncomingMessage } from 'node:http'
import { parse } from 'node:url'
import next from 'next'
import { WebSocketServer } from 'ws'

import { serverConfig } from '../src/config/server'
import { handleDeviceConnection } from '../src/server/ws/device'
import { deviceHub } from '../src/server/ws/hub'
import { expireStaleSessions } from '../src/server/services/pairing-service'
import { pruneRateLimitBuckets } from '../src/server/http/rate-limit'
import { logger } from '../src/lib/logger'
import { loadOrCreateSecret } from '../src/lib/secret-store'

const dev = process.env.NODE_ENV !== 'production'
const port = serverConfig.port

/**
 * Проверка Origin.
 *
 * Сокет устройства не должен приниматься со стороннего сайта: иначе зловредная
 * страница откроет канал от имени чужого устройства. Плеер на телевизоре
 * заходит с того же адреса, поэтому сравниваем с публичным адресом сервера.
 */
function isOriginAllowed(request: IncomingMessage): boolean {
  const origin = request.headers.origin
  if (!origin) return true // не браузер: плеер и curl не присылают Origin

  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return false
  }

  try {
    if (originHost === new URL(serverConfig.publicUrl).host) return true
  } catch {
    // Некорректный PUBLIC_URL: проверяем по заголовку Host.
  }

  // Локальная разработка: Origin может отличаться портом.
  if (!dev) return false

  const host = request.headers.host
  return typeof host === 'string' && originHost === host
}

async function main(): Promise<void> {
  loadOrCreateSecret()

  const app = next({ dev, hostname: '0.0.0.0', port })
  const handle = app.getRequestHandler()

  await app.prepare()

  const server = createServer((req, res) => {
    // Next начинает отправку ответа внутри handle, поэтому свои заголовки
    // (Set-Cookie и прочее) нужно ставить ДО вызова: иначе они молча теряются.
    void handle(req, res, parse(req.url ?? '/', true))
  })

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

  // Проверка живых соединений: без неё «мёртвые» сокеты повисают до
  // следующего heartbeat, и панель показывает экраны офлайн позже нужного.
  const sweepTimer = setInterval(() => {
    deviceHub.sweep()
  }, 30_000)

  // Закрытие протухших сессий привязки и счётчиков ограничения частоты.
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

  server.listen(port, () => {
    logger.info(
      { port, dev, publicUrl: serverConfig.publicUrl },
      `SHAWTY слушает http://localhost:${port}`,
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
    deviceHub.closeAll()
    server.close(() => process.exit(0))
    // Страховка: если сокеты держат соединение, выходим по таймауту.
    setTimeout(() => process.exit(0), 5000).unref()
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'сервер не запустился')
  process.exit(1)
})
