import { z } from 'zod'

/**
 * Протокол канала устройства.
 *
 * Токен доступа передаётся первым кадром `hello`, а не в адресе: адрес сокета
 * попадает в логи, историю и сторонние инструменты аналитики. Постоянный секрет
 * устройства по каналу не ходит никогда.
 */

export const deviceHelloFrame = z.object({
  type: z.literal('hello'),
  accessToken: z.string().min(16).max(4096),
})

export const deviceHeartbeatFrame = z.object({
  type: z.literal('heartbeat'),
  playerVersion: z.string().max(32).optional(),
  /** Версия публикации, которую плеер реально показывает. */
  appliedVersion: z.number().int().nullable().optional(),
  storage: z
    .object({
      usageBytes: z.number().int().nonnegative().optional(),
      quotaBytes: z.number().int().nonnegative().optional(),
    })
    .optional(),
  /**
   * Подтверждённые и неизвестные возможности устройства. Различаем явно:
   * браузер не всегда умеет сообщить о кодеке, и выдумывать это нельзя.
   */
  capabilities: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Подписка на состояние привязки.
 *
 * `deviceNonce` обязателен и проверяется сервером: идентификатор сессии виден
 * в QR, а значит доступен тому, кто посмотрел на экран. Без nonce такой
 * наблюдатель перехватил бы одноразовый токен выдачи.
 */
export const deviceWatchPairingFrame = z.object({
  type: z.literal('watch-pairing'),
  sessionId: z.string().min(16).max(64),
  deviceNonce: z.string().min(32).max(256),
})

/** Подтверждение фактического применения публикации. */
export const deviceAppliedFrame = z.object({
  type: z.literal('applied'),
  releaseVersion: z.number().int().positive(),
  manifestHash: z.string().max(128),
})

export const deviceErrorFrame = z.object({
  type: z.literal('player.error'),
  code: z.string().max(64),
  message: z.string().max(2000),
  releaseVersion: z.number().int().positive().optional(),
})

/**
 * Событие воспроизведения.
 *
 * Честная альтернатива «показов»: устройство сообщает, что материал
 * **показывался**, а панель считает это фактом. Никто не утверждает, что
 * человек посмотрел рекламу — утверждается ровно то, что известно машине.
 *
 * Ошибки и пропуски идут сюда же, а не отдельным кадром: «материал не
 * показался» — это тоже результат, и без него отчёт о недоступности был бы
 * неполным. Отдельный `player.error` остаётся для сбоев самого плеера.
 */
export const devicePlaybackFrame = z.object({
  type: z.literal('playback'),
  event: z.enum(['started', 'ended', 'error', 'skipped']),
  itemId: z.string().min(1).max(64),
  releaseVersion: z.number().int().positive().optional(),
  /** Сколько показывался материал до события, мс. */
  positionMs: z.number().int().nonnegative().optional(),
  errorCode: z.string().max(64).optional(),
})

export const devicePongFrame = z.object({ type: z.literal('pong') })

export const deviceFrameSchema = z.discriminatedUnion('type', [
  deviceHelloFrame,
  deviceHeartbeatFrame,
  deviceWatchPairingFrame,
  deviceAppliedFrame,
  deviceErrorFrame,
  devicePlaybackFrame,
  devicePongFrame,
])

export type DeviceFrame = z.infer<typeof deviceFrameSchema>
export type DevicePlaybackFrame = z.infer<typeof devicePlaybackFrame>

/** Кадры, которые сервер шлёт устройству. */
export type ServerFrame =
  | {
      type: 'hello.ok'
      deviceId: string
      screenId: string
      companyId: string
      heartbeatSec: number
    }
  | {
      type: 'hello.denied'
      code: 'unauthorized' | 'revoked' | 'disabled' | 'unpaired' | 'stale_token'
      /** Нужно ли устройству стереть локальные учётные данные. */
      reauth: boolean
      message: string
    }
  /**
   * Уведомление о подтверждении. Секретов не содержит: телевизор сам
   * получает учётные данные по HTTP, доказывая владение локальным nonce.
   */
  | { type: 'pairing.confirmed'; screenId: string }
  | { type: 'pairing.expired' }
  /**
   * Новая публикация. Манифест идёт прямо в кадре: файл может весить
   * десятки килобайт текста, а отдельный HTTP-запрос означал бы, что канал
   * перестал быть основным путём доставки.
   */
  | { type: 'assignment'; releaseVersion: number; manifest: unknown }
  | { type: 'ping'; at: number }

export function encodeFrame(frame: ServerFrame): string {
  return JSON.stringify(frame)
}
