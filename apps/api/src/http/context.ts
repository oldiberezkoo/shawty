import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Контекст текущего HTTP-запроса.
 *
 * Старые обработчики писали cookie через `next/headers`, где хранилище
 * привязано к запросу неявно. В Hono такого хранилища нет, поэтому его роль
 * играет AsyncLocalStorage: middleware кладёт сюда запрос и буфер Set-Cookie,
 * а `cookies.ts` читает и пишет через него, не меняя сигнатуры сервисов.
 */
export type RequestStore = {
  request: Request
  setCookies: string[]
}

export const requestStorage = new AsyncLocalStorage<RequestStore>()

export function currentRequest(): RequestStore {
  const store = requestStorage.getStore()
  if (!store) throw new Error('request context is not available')
  return store
}
