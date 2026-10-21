import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serverConfig } from '@/config/server'
import { requestStorage, type RequestStore } from '@/http/context'
import { toErrorResponse } from '@/server/http/request'
import { logger } from '@/lib/logger'
import { registerRoutes } from '@/routes/loader'

const allowedOrigins = new Set([
  serverConfig.publicUrl,
  serverConfig.apiUrl,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
])

export async function createApp(): Promise<Hono> {
  const app = new Hono()

  /**
   * Cookie в старом коде выставляются сервисами, а не обработчиком.
   * Буфер живёт в AsyncLocalStorage, а middleware переносит его в ответ.
   */
  app.use('*', async (context, next) => {
    const store: RequestStore = { request: context.req.raw, setCookies: [] }

    await requestStorage.run(store, async () => {
      await next()
    })

    for (const cookie of store.setCookies) {
      context.res.headers.append('set-cookie', cookie)
    }
  })

  app.use(
    '*',
    cors({
      origin: (origin) => (allowedOrigins.has(origin) ? origin : serverConfig.publicUrl),
      credentials: true,
      allowHeaders: ['content-type', 'x-csrf-token', 'x-company-id', 'x-device-token', 'authorization'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
      maxAge: 600,
    }),
  )

  app.get('/health', (context) => context.json({ ok: true, service: 'shawty-api' }))

  await registerRoutes(app)

  app.onError((error, context) => {
    logger.error({ err: error }, 'необработанная ошибка API')
    return toErrorResponse(error)
  })

  app.notFound((context) => context.json({ error: { code: 'not_found', message: 'Маршрут не найден' } }, 404))

  return app
}
