import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { rm } from 'node:fs/promises'
import { serverConfig } from '@/config/server'
import { MediaProcessingError } from './probe'

const exec = promisify(execFile)

/**
 * Параметры ffmpeg для целевого профиля.
 *
 * Почему именно так — решения, а не магия:
 *
 * - `yuv420p` обязателен: без него H.264 High profile не воспроизводится
 *   частью телевизоров, и картинка уезжает в зелёный шум.
 * - `-profile:v high` + `-level 4.1`: верхняя граница того, что надёжно
 *   декодируют телевизоры седьмого поколения и новее.
 * - `-movflags +faststart`: переносит заголовок в начало файла. Без этого
 *   телевизор смотрит в конец до первого кадра — на слабой сети это
 *   ощутимые секунды пустого чёрного экрана.
 * - `-pix_fmt yuv420p` и `-profile:v high` вместо `main` — баланс качества
 *   и размера для 4K-исходников.
 * - `-crf 21`: глазом незаметно, файл заметно меньше исходника.
 */
export function buildTranscodeArgs(params: {
  input: string
  output: string
  hasAudio: boolean
  /** Пропускаем звук, если ассет используется как фоновая картинка. */
  mute?: boolean
  maxBitrateBps?: number
}): string[] {
  const maxBitrate = params.maxBitrateBps ?? serverConfig.media.transcodeMaxBitrateBps

  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', params.input,
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-level', '4.1',
    '-preset', 'slow',
    '-crf', '21',
    '-pix_fmt', 'yuv420p',
    '-maxrate', String(maxBitrate),
    '-bufsize', String(maxBitrate * 2),
    '-g', '60',
    // Ключевой кадр раз в 2 секунды: быстрее переключение между роликами
    // и короче буфер при плохой сети.
    '-keyint_min', '60',
    '-sc_threshold', '0',
    '-movflags', '+faststart',
  ]

  if (params.mute || !params.hasAudio) {
    args.push('-an')
  } else {
    args.push(
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', '2',
      '-ar', '48000',
    )
  }

  args.push('-map_metadata', '-1', params.output)
  return args
}

export async function transcodeToMp4(params: {
  input: string
  output: string
  hasAudio: boolean
  mute?: boolean
}): Promise<void> {
  const args = buildTranscodeArgs(params)

  try {
    await exec('ffmpeg', args, { maxBuffer: 16 * 1024 * 1024, windowsHide: true })
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? ''
    await rm(params.output, { force: true })
    throw new MediaProcessingError(
      'transcode',
      'transcode_failed',
      `Обработка не удалась: ${stderr.trim().split('\n').slice(-1)[0] ?? 'неизвестная ошибка'}`,
    )
  }
}

/**
 * Кадр для превью.
 *
 * Берём не первый кадр: обычно это чёрный или логотип, и превью в медиатеке
 * выглядит как «пустое место». Надёжнее брать кадр ближе к началу, но с
 * отступом, и если он чёрный — следующий.
 */
export async function extractPoster(params: {
  input: string
  output: string
  durationMs: number | null
  width: number
}): Promise<void> {
  const fraction = serverConfig.media.posterAtFraction
  const durationSec = (params.durationMs ?? 0) / 1000
  const candidates = [
    Math.max(0.1, durationSec * fraction),
    Math.max(0.5, durationSec * 0.3),
    0,
  ]

  for (const at of candidates) {
    try {
      await exec(
        'ffmpeg',
        [
          '-y',
          '-hide_banner',
          '-loglevel', 'error',
          // seek до входа быстрее для коротких роликов
          '-ss', at.toFixed(2),
          '-i', params.input,
          '-frames:v', '1',
          // Превью не должно быть тяжёлым: на сетке медиатеки это сотни превью.
          '-vf', `scale=${params.width}:-2:flags=lanczos`,
          '-q:v', '4',
          params.output,
        ],
        { maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      )
      return
    } catch {
      // Пробуем следующую точку.
    }
  }

  await rm(params.output, { force: true })
  throw new MediaProcessingError('poster', 'poster_failed', 'Не удалось получить кадр для превью')
}

export async function extractImagePoster(params: { input: string; output: string; width: number }): Promise<void> {
  try {
    await exec(
      'ffmpeg',
      [
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        '-i', params.input,
        '-frames:v', '1',
        '-vf', `scale=${params.width}:-2:flags=lanczos`,
        '-q:v', '4',
        params.output,
      ],
      { maxBuffer: 8 * 1024 * 1024, windowsHide: true },
    )
  } catch (error) {
    await rm(params.output, { force: true })
    throw new MediaProcessingError('poster', 'poster_failed', 'Не удалось получить кадр для превью')
  }
}
