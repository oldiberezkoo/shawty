/**
 * Правила допуска медиа. Чистые функции без файловой системы и без ffmpeg:
 * всё, что можно решить по первым байтам и по метаданным, решается здесь и
 * проверяется тестами.
 *
 * Важный принцип: тип файла определяется по содержимому, а не по заголовку
 * от клиента. Заголовок `Content-Type` приходит из браузера и подделывается
 * тривиально, а телевизор потом получает битый файл.
 */

export type MediaKind = 'image' | 'video'

export type DetectedFormat = {
  kind: MediaKind
  /** Канонический MIME, которому мы доверяем. */
  mime: string
  extension: string
  label: string
}

export type DetectionFailure = {
  ok: false
  reason: 'empty' | 'unknown_signature' | 'too_short'
}

export type DetectionResult = ({ ok: true } & DetectedFormat) | DetectionFailure

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = ''
  for (let i = start; i < start + length && i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i] as number)
  }
  return out
}

/**
 * Определение формата по сигнатуре.
 *
 * Поддерживаем сознательно немного: то, что мы умеем надёжно воспроизводить
 * и проверять. Неподдерживаемый формат должен отклоняться с понятным
 * сообщением, а не молча попадать на экран и не показываться.
 */
export function detectFormat(bytes: Uint8Array): DetectionResult {
  if (bytes.length === 0) return { ok: false, reason: 'empty' }
  if (bytes.length < 12) return { ok: false, reason: 'too_short' }

  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ok: true, kind: 'image', mime: 'image/jpeg', extension: 'jpg', label: 'JPEG' }
  }

  // PNG
  if (
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === 'PNG' &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { ok: true, kind: 'image', mime: 'image/png', extension: 'png', label: 'PNG' }
  }

  // GIF
  if (ascii(bytes, 0, 4) === 'GIF8') {
    return { ok: true, kind: 'image', mime: 'image/gif', extension: 'gif', label: 'GIF' }
  }

  // BMP
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return { ok: true, kind: 'image', mime: 'image/bmp', extension: 'bmp', label: 'BMP' }
  }

  // WebP: RIFF-контейнер, формат записан в позиции 8
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return { ok: true, kind: 'image', mime: 'image/webp', extension: 'webp', label: 'WebP' }
  }

  // ISO-BMFF (MP4 / MOV / M4A): сигнатура ftyp на позиции 4
  const brand = ascii(bytes, 4, 4)
  if (brand === 'ftyp') {
    const majorBrand = ascii(bytes, 8, 4)

    if (majorBrand === 'avif' || majorBrand === 'avis' || majorBrand === 'heic' || majorBrand === 'mif1') {
      return {
        ok: true,
        kind: 'image',
        mime: majorBrand === 'heic' ? 'image/heic' : 'image/avif',
        extension: majorBrand === 'heic' ? 'heic' : 'avif',
        label: majorBrand === 'heic' ? 'HEIC' : 'AVIF',
      }
    }

    return { ok: true, kind: 'video', mime: 'video/mp4', extension: 'mp4', label: 'MP4' }
  }

  // Matroska / WebM
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { ok: true, kind: 'video', mime: 'video/webm', extension: 'webm', label: 'WebM' }
  }

  // AVI
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'AVI ') {
    return { ok: true, kind: 'video', mime: 'video/x-msvideo', extension: 'avi', label: 'AVI' }
  }

  // Поток MPEG
  if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && (bytes[3] === 0xba || bytes[3] === 0xb3)) {
    return { ok: true, kind: 'video', mime: 'video/mpeg', extension: 'mpg', label: 'MPEG' }
  }

  return { ok: false, reason: 'unknown_signature' }
}

export type MediaLimits = {
  maxBytes: number
  maxWidth: number
  maxHeight: number
  maxDurationMs: number
  minDurationMs: number
  /** Длительность показа изображения по умолчанию. */
  defaultImageDurationMs: number
}

export type RejectionReason =
  | 'file_too_large'
  | 'too_wide'
  | 'too_tall'
  | 'too_long'
  | 'too_short'

export type ValidationVerdict =
  | { ok: true }
  | { ok: false; reason: RejectionReason; message: string }

function humanSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} ГБ`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} МБ`
  return `${Math.round(bytes / 1024)} КБ`
}

export function validateSize(bytes: number, limits: MediaLimits): ValidationVerdict {
  if (bytes > limits.maxBytes) {
    return {
      ok: false,
      reason: 'file_too_large',
      message: `Файл ${humanSize(bytes)} превышает допустимые ${humanSize(limits.maxBytes)}`,
    }
  }
  return { ok: true }
}

export function validateDimensions(
  width: number | null,
  height: number | null,
  limits: MediaLimits,
): ValidationVerdict {
  if (width !== null && width > limits.maxWidth) {
    return { ok: false, reason: 'too_wide', message: `Ширина ${width} пикселей выше лимита ${limits.maxWidth}` }
  }
  if (height !== null && height > limits.maxHeight) {
    return { ok: false, reason: 'too_tall', message: `Высота ${height} пикселей выше лимита ${limits.maxHeight}` }
  }
  return { ok: true }
}

/**
 * Короткое видео почти всегда означает ошибку монтажа или битый файл.
 * Минимум осмыслен для рекламного ролика на экране магазина.
 */
export function validateDuration(durationMs: number | null, limits: MediaLimits): ValidationVerdict {
  if (durationMs === null) return { ok: true }

  if (durationMs > limits.maxDurationMs) {
    const minutes = Math.round(limits.maxDurationMs / 60_000)
    return { ok: false, reason: 'too_long', message: `Длительность превышает ${minutes} минут` }
  }
  if (durationMs < limits.minDurationMs) {
    return {
      ok: false,
      reason: 'too_short',
      message: `Длительность ${(durationMs / 1000).toFixed(1)} с короче минимума ${(limits.minDurationMs / 1000).toFixed(0)} с`,
    }
  }
  return { ok: true }
}

/** Метаданные, полученные от ffprobe. */
export type MediaProbe = {
  durationMs: number | null
  width: number | null
  height: number | null
  videoCodec: string | null
  audioCodec: string | null
  frameRate: number | null
  hasAudio: boolean
  pixFmt: string | null
  bitrate: number | null
  formatName: string | null
}

/** Профиль, под который мы приводим всё видео для сети экранов. */
export const TARGET_VIDEO_CODEC = 'h264'
export const TARGET_AUDIO_CODEC = 'aac'
export const TARGET_CONTAINER = 'mp4'

/**
 * Нужно ли перекодировать.
 *
 * Политика первой версии — единый профиль MP4/H.264/AAC для всей сети.
 * Подгонка под кодеки конкретного телевизора сознательно отложена: пока мы
 * не видели ни одного реального профиля устройства, любая подгонка была бы
 * гаданием, а список вариантов профилей — источником ошибок у пользователя.
 */
export function needsTranscode(probe: MediaProbe, sourceMime: string): boolean {
  if (sourceMime !== 'video/mp4') return true
  if (probe.videoCodec !== TARGET_VIDEO_CODEC) return true
  // Отсутствие аудиодорожки — не повод перекодировать.
  if (probe.hasAudio && probe.audioCodec !== TARGET_AUDIO_CODEC) return true
  return false
}

/**
 * Соотношение сторон. Экран в магазине обычно 16:9; сильное отклонение
 * не блокирует загрузку, но помечается, чтобы редактор увидел заранее.
 */
export function aspectRatio(width: number | null, height: number | null): number | null {
  if (!width || !height || height === 0) return null
  return width / height
}

export const TV_ASPECT_RATIO = 16 / 9

export function looksUnusualForTv(width: number | null, height: number | null): boolean {
  const ratio = aspectRatio(width, height)
  if (ratio === null) return false
  const deviation = Math.abs(ratio - TV_ASPECT_RATIO) / TV_ASPECT_RATIO
  return deviation > 0.25
}
