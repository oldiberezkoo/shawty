/** Один замер часов по кадру `clock`. */
export type ClockSample = { offsetMs: number; rttMs: number }

/**
 * Смещение часов устройства относительно сервера.
 *
 * Смещение считается по середине пути «туда-обратно»: клиент отправляет
 * `clientAt`, сервер отвечает `serverAt`, ответ приходит в `receivedAt`.
 * Замер с наименьшей задержкой меньше всего страдает от очередей, поэтому
 * принимается не каждый ответ, а лучший (или любой, если прошлый устарел).
 */
export function measureClock(clientAt: number, serverAt: number, receivedAt: number): ClockSample {
  const rttMs = Math.max(0, receivedAt - clientAt)
  const offsetMs = serverAt - (clientAt + receivedAt) / 2

  return { offsetMs, rttMs }
}

/** Пора ли принять новый замер: он точнее прежнего или прежний устарел. */
export function shouldAcceptClockSample(
  sample: ClockSample,
  bestRttMs: number,
  syncedAt: number,
  now: number,
  staleMs: number,
): boolean {
  return sample.rttMs <= bestRttMs + 1 || now - syncedAt > staleMs
}
