import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { MediaProbe } from '@/domain/media/policy'

// Тип описан в доменном слое, но переиспользуется всеми, кто работает
// с результатом ffprobe. Реэкспорт избавляет от догадок, где он объявлен.
export type { MediaProbe }

const exec = promisify(execFile)

export class MediaProcessingError extends Error {
  readonly stage: 'probe' | 'transcode' | 'poster'
  readonly code: string

  constructor(stage: 'probe' | 'transcode' | 'poster', code: string, message: string) {
    super(message)
    this.name = 'MediaProcessingError'
    this.stage = stage
    this.code = code
  }
}

/** ffprobe не выходит с кодом 0 на битом файле, а ошибку пишет в stderr. */
function parseFraction(value: string | undefined): number | null {
  if (!value) return null
  const [numerator = '', denominator] = value.split('/')
  const top = Number.parseFloat(numerator)
  const bottom = denominator === undefined ? 1 : Number.parseFloat(denominator)
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom === 0) return null
  return top / bottom
}

function toMilliseconds(seconds: string | number | undefined): number | null {
  if (seconds === undefined) return null
  const value = typeof seconds === 'number' ? seconds : Number.parseFloat(seconds)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value * 1000)
}

type FfprobeStream = {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  r_frame_rate?: string
  duration?: string
  channels?: number
  pix_fmt?: string
}

type FfprobeOutput = {
  format?: {
    duration?: string
    size?: string
    bit_rate?: string
    format_name?: string
  }
  streams?: FfprobeStream[]
}

/**
 * Извлечение метаданных.
 *
 * Длительность берётся из контейнера, но если её там нет (бывает у MPEG-потоков)
 * — из первой видеодорожки: иначе файл прошёл бы проверку длительности
 * с нулевым значением и молча показывался бы на экране.
 */
export async function probeMedia(path: string): Promise<MediaProbe> {
  let raw: string

  try {
    const { stdout } = await exec(
      'ffprobe',
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path],
      { maxBuffer: 8 * 1024 * 1024, windowsHide: true },
    )
    raw = stdout
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? ''
    throw new MediaProcessingError(
      'probe',
      'probe_failed',
      `Не удалось прочитать файл: ${stderr.trim().split('\n').slice(-1)[0] ?? 'неизвестная ошибка'}`,
    )
  }

  let parsed: FfprobeOutput
  try {
    parsed = JSON.parse(raw) as FfprobeOutput
  } catch {
    throw new MediaProcessingError('probe', 'probe_unparsable', 'ffprobe вернул нечитаемый ответ')
  }

  const streams = parsed.streams ?? []
  const video = streams.find((stream) => stream.codec_type === 'video')
  const audio = streams.find((stream) => stream.codec_type === 'audio')

  const durationMs =
    toMilliseconds(parsed.format?.duration) ?? toMilliseconds(video?.duration) ?? toMilliseconds(audio?.duration)

  const bitrate = parsed.format?.bit_rate ? Number.parseInt(parsed.format.bit_rate, 10) : null

  return {
    durationMs,
    width: video?.width ?? null,
    height: video?.height ?? null,
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    frameRate: video ? parseFraction(video.r_frame_rate) : null,
    hasAudio: Boolean(audio),
    pixFmt: video?.pix_fmt ?? null,
    bitrate: Number.isFinite(bitrate) ? bitrate : null,
    formatName: parsed.format?.format_name ?? null,
  }
}
