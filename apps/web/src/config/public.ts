/**
 * Публичные настройки веба.
 *
 * Здесь нет доступа к базе или сервисам: только адреса и значения,
 * которые безопасно отдавать в браузер.
 */

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const publicConfig = {
  /** Публичный адрес веб-приложения: из него строятся ссылки на плеер. */
  appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? process.env.PUBLIC_URL ?? 'http://localhost:3000').replace(
    /\/+$/,
    '',
  ),

  /** Длительность показа изображения по умолчанию — та же, что в API. */
  defaultImageDurationMs: intFromEnv('NEXT_PUBLIC_MEDIA_DEFAULT_IMAGE_MS', 8000),
} as const
