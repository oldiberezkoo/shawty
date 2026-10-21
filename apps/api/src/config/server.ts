/**
 * Настройки уровня сервера. Не хранятся в БД: часть решений принимается до того,
 * как известна компания, и потому не может быть её настройкой.
 */

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  return raw === 'true' || raw === '1'
}

export const serverConfig = {
  port: intFromEnv('PORT', 4000),
  /** Публичный адрес для QR. На ТВ должен быть доступен из локальной сети или извне. */
  publicUrl: (process.env.PUBLIC_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
  /** Публичный адрес API: WS-подключение плеера идёт сюда, а не на веб-порт. */
  apiUrl: (process.env.API_PUBLIC_URL ?? 'http://localhost:4000').replace(/\/+$/, ''),

  pairing: {
    /** Короткоживущий код подтверждения: требование ТЗ — 5 минут. */
    codeTtlMs: intFromEnv('PAIRING_CODE_TTL_MS', 5 * 60_000),
    /** Одноразовый токен выдачи учётных данных телевизору. */
    enrollmentTtlMs: intFromEnv('PAIRING_ENROLLMENT_TTL_MS', 60_000),
    /** После исчерпания попыток сессия закрывается независимо от оставшегося времени. */
    maxAttempts: intFromEnv('PAIRING_MAX_ATTEMPTS', 8),
    /** Длина кода. 8 символов из 31-символьного алфавита ≈ 39.6 бита. */
    codeLength: intFromEnv('PAIRING_CODE_LENGTH', 8),
    /**
     * Носить ли код внутри QR.
     *
     * По умолчанию false: QR содержит только идентификатор сессии, а код человек
     * вводит руками. Это защищает от подглядывания через плечевой обзор и от
     * перехвата камерой. Включать true имеет смысл только для доверенной сети,
     * где привязка массовая и оператор физически рядом с экраном.
     *
     * Настройка не может быть пер-компанией: QR создаётся до того, как известно,
     * в какую компанию попадёт телевизор.
     */
    qrCarriesCode: boolFromEnv('PAIRING_QR_CARRIES_CODE', false),
    /** Защита таблицы сессий от истощения: не больше N незакрытых сессий одновременно. */
    maxPendingSessions: intFromEnv('PAIRING_MAX_PENDING_SESSIONS', 500),
    rateLimit: {
      /** Стартов привязки с одного адреса. */
      startPerIp: {
        limit: intFromEnv('RATE_LIMIT_PAIRING_START_PER_IP', 5),
        windowMs: intFromEnv('RATE_LIMIT_PAIRING_START_WINDOW_MS', 10 * 60_000),
      },
      /** Обмен одноразового токена на постоянные учётные данные. */
      exchangePerSession: {
        limit: intFromEnv('RATE_LIMIT_PAIRING_EXCHANGE', 5),
        windowMs: intFromEnv('RATE_LIMIT_PAIRING_EXCHANGE_WINDOW_MS', 5 * 60_000),
      },
      /** Обмен постоянного секрета устройства на короткоживущий токен. */
      tokenPerDevice: {
        limit: intFromEnv('RATE_LIMIT_DEVICE_TOKEN', 10),
        windowMs: intFromEnv('RATE_LIMIT_DEVICE_TOKEN_WINDOW_MS', 15 * 60_000),
      },
    },
  },

  device: {
    /** Время жизни access-токена устройства. Постоянный секрет по сети не ходит. */
    accessTokenTtlMs: intFromEnv('DEVICE_ACCESS_TOKEN_TTL_MS', 15 * 60_000),
    /** TTL при первом обмене секрета устройства на токен. Длинный, чтобы не гонять ТВ. */
    initialExchangeTtlMs: intFromEnv('DEVICE_INITIAL_EXCHANGE_TTL_MS', 365 * 24 * 60 * 60_000),
  },

  media: {
    /**
     * Пределы файла. Значения по умолчанию; компания сможет их сузить
     * в настройках (P7), но не расширить выше системного максимума —
     * иначе один файл уронит сеть телевизоров.
     */
    maxBytes: intFromEnv('MEDIA_MAX_BYTES', 512 * 1024 * 1024),
    maxWidth: intFromEnv('MEDIA_MAX_WIDTH', 3840),
    maxHeight: intFromEnv('MEDIA_MAX_HEIGHT', 2160),
    /** Максимальная длительность ролика: 10 минут. */
    maxDurationMs: intFromEnv('MEDIA_MAX_DURATION_MS', 10 * 60_000),
    /** Короче этого видео почти наверняка ошибка. */
    minDurationMs: intFromEnv('MEDIA_MIN_DURATION_MS', 1000),
    /** Показ изображения по умолчанию. */
    defaultImageDurationMs: intFromEnv('MEDIA_DEFAULT_IMAGE_MS', 8000),
    /** Параллельных задач обработки: ffmpeg тяжёлый, процесс один. */
    transcodeConcurrency: intFromEnv('MEDIA_TRANSCODE_CONCURRENCY', 2),
    /** Доля, с которой считаем файл слишком тяжёлым для ТВ. */
    transcodeMaxBitrateBps: intFromEnv('MEDIA_TRANSCODE_MAX_BITRATE', 8_000_000),
    /** За сколько до конца ролика берём кадр для превью. */
    posterAtFraction: Number.parseFloat(process.env.MEDIA_POSTER_FRACTION ?? '0.1'),
  },

  player: {
    heartbeatSec: intFromEnv('PLAYER_HEARTBEAT_SEC', 30),
    /** Порог «нет связи». Ниже 60 секунд ловим мигание сети в торговом центре. */
    offlineAfterSec: intFromEnv('PLAYER_OFFLINE_AFTER_SEC', 90),
    /** За сколько до смены расписания плеер готовит следующую публикацию. */
    prefetchBeforeMs: intFromEnv('PLAYER_PREFETCH_BEFORE_MS', 10 * 60_000),
    /** Горизонт расписания, закладываемый в манифест. */
    scheduleHorizonDays: intFromEnv('PLAYER_SCHEDULE_HORIZON_DAYS', 7),
  },
} as const

export type ServerConfig = typeof serverConfig
