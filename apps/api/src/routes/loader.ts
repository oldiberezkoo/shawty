import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Hono } from 'hono'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const

type RouteHandler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Response | Promise<Response>

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    } else if (entry.isFile()) {
      yield full
    }
  }
}

/**
 * Регистрирует обработчики из `src/routes/<path>/route.ts`.
 *
 * Формат намеренно повторяет Next.js: это позволяет перенести существующие
 * маршруты без переписывания. `[id]` превращается в `:id`, а `params` остаётся
 * промисом — обработчики уже написаны под такой контракт.
 */
export async function registerRoutes(app: Hono): Promise<void> {
  const root = fileURLToPath(new URL('.', import.meta.url))

  for (const file of walk(root)) {
    if (!file.endsWith('route.ts')) continue

    const rel = relative(root, file).replace(/\\/g, '/')
    const routePath = `/api/${rel
      .replace(/\/route\.ts$/, '')
      .replace(/\[([^\]]+)\]/g, ':$1')}`

    const module = (await import(pathToFileURL(file).href)) as Record<string, unknown>

    for (const method of METHODS) {
      const handler = module[method]
      if (typeof handler !== 'function') continue

      app.on(method, routePath, async (context) => {
        return (handler as RouteHandler)(context.req.raw, {
          params: Promise.resolve(context.req.param()),
        })
      })
    }
  }
}
