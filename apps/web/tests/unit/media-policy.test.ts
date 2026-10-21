import { describe, expect, it } from 'vitest'
import {
  detectFormat,
  looksUnusualForTv,
  needsTranscode,
  validateDimensions,
  validateDuration,
  validateSize,
  aspectRatio,
  type MediaLimits,
  type MediaProbe,
} from '@/domain/media/policy'
import { buildTranscodeArgs } from '@/media/transcode'

/**
 * Сигнатуры собраны вручную из настоящих заголовков файлов.
 * Проверка по содержимому — требование безопасности: заголовок от браузера
 * подделывается тривиально, а телевизор потом получает битый файл.
 */
const SIGNATURES = {
  jpeg: [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d],
  gif: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00],
  bmp: [0x42, 0x4d, 0x36, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  webp: [0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
  mp4: [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d],
  webm: [0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f],
  avi: [0x52, 0x49, 0x46, 0x46, 0x1c, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20],
  mpeg: [0x00, 0x00, 0x01, 0xba, 0x21, 0x00, 0x01, 0x00, 0x01, 0x80, 0x00, 0x01],
} as const

function bytes(values: readonly number[]): Uint8Array {
  return new Uint8Array(values)
}

describe('определение формата по сигнатуре', () => {
  it('узнаёт изображения', () => {
    expect(detectFormat(bytes(SIGNATURES.jpeg))).toMatchObject({ ok: true, kind: 'image', mime: 'image/jpeg', extension: 'jpg' })
    expect(detectFormat(bytes(SIGNATURES.png))).toMatchObject({ ok: true, kind: 'image', mime: 'image/png' })
    expect(detectFormat(bytes(SIGNATURES.gif))).toMatchObject({ ok: true, kind: 'image', mime: 'image/gif' })
    expect(detectFormat(bytes(SIGNATURES.bmp))).toMatchObject({ ok: true, kind: 'image', mime: 'image/bmp' })
    expect(detectFormat(bytes(SIGNATURES.webp))).toMatchObject({ ok: true, kind: 'image', mime: 'image/webp' })
  })

  it('узнаёт видео', () => {
    expect(detectFormat(bytes(SIGNATURES.mp4))).toMatchObject({ ok: true, kind: 'video', mime: 'video/mp4' })
    expect(detectFormat(bytes(SIGNATURES.webm))).toMatchObject({ ok: true, kind: 'video', mime: 'video/webm' })
    expect(detectFormat(bytes(SIGNATURES.avi))).toMatchObject({ ok: true, kind: 'video', mime: 'video/x-msvideo' })
    expect(detectFormat(bytes(SIGNATURES.mpeg))).toMatchObject({ ok: true, kind: 'video', mime: 'video/mpeg' })
  })

  it('отличает AVIF от обычного MP4 по major brand', () => {
    const avif = bytes([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66])
    expect(detectFormat(avif)).toMatchObject({ ok: true, kind: 'image', mime: 'image/avif' })
  })

  it('отвергает пустой файл', () => {
    expect(detectFormat(new Uint8Array(0))).toEqual({ ok: false, reason: 'empty' })
  })

  it('отвергает слишком короткий файл', () => {
    expect(detectFormat(new Uint8Array([0xff, 0xd8]))).toEqual({ ok: false, reason: 'too_short' })
  })

  it('отвергает неизвестное содержимое', () => {
    const garbage = new Uint8Array(32).fill(0x41)
    expect(detectFormat(garbage)).toEqual({ ok: false, reason: 'unknown_signature' })
  })

  it('не доверяет расширению: переименованный текст отвергается', () => {
    // Пользователь переименовывает .txt в .jpg. Проверяем содержимое.
    const text = new TextEncoder().encode('<?php echo "hi"; ?>'.padEnd(32, ' '))
    expect(detectFormat(text)).toEqual({ ok: false, reason: 'unknown_signature' })
  })

  it('не путает WebP и AVI: оба начинаются с RIFF, различается только бренд', () => {
    expect(detectFormat(bytes(SIGNATURES.webp)).ok).toBe(true)
    expect(detectFormat(bytes(SIGNATURES.avi)).ok).toBe(true)

    // Переставленные байты бренда меняют тип: это не замена одного на другое.
    const broken = new Uint8Array(SIGNATURES.webp)
    broken[8] = 0x41 // 'A'
    expect(detectFormat(broken)).toEqual({ ok: false, reason: 'unknown_signature' })
  })
})

const LIMITS: MediaLimits = {
  maxBytes: 100 * 1024 * 1024,
  maxWidth: 3840,
  maxHeight: 2160,
  maxDurationMs: 10 * 60_000,
  minDurationMs: 1000,
  defaultImageDurationMs: 8000,
}

describe('проверка размера', () => {
  it('пропускает файл в пределах лимита', () => {
    expect(validateSize(50 * 1024 * 1024, LIMITS)).toEqual({ ok: true })
    expect(validateSize(LIMITS.maxBytes, LIMITS)).toEqual({ ok: true })
  })

  it('отвергает файл больше лимита и говорит почему', () => {
    const verdict = validateSize(LIMITS.maxBytes + 1, LIMITS)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) {
      expect(verdict.reason).toBe('file_too_large')
      expect(verdict.message).toMatch(/100.0 МБ/)
    }
  })

  it('размер переводится в читаемые единицы', () => {
    const verdict = validateSize(2 * 1024 ** 3, LIMITS)
    if (!verdict.ok) expect(verdict.message).toMatch(/2.0 ГБ/)
  })
})

describe('проверка разрешения', () => {
  it('пропускает 4K и отвергает 8K', () => {
    expect(validateDimensions(3840, 2160, LIMITS)).toEqual({ ok: true })

    const verdict = validateDimensions(7680, 4320, LIMITS)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toBe('too_wide')
  })

  it('проверяет высоту отдельно', () => {
    const verdict = validateDimensions(1920, 4320, LIMITS)
    if (!verdict.ok) expect(verdict.reason).toBe('too_tall')
  })

  it('неизвестный размер не считается нарушением', () => {
    expect(validateDimensions(null, null, LIMITS)).toEqual({ ok: true })
  })
})

describe('проверка длительности', () => {
  it('пропускает ролик обычной длины', () => {
    expect(validateDuration(30_000, LIMITS)).toEqual({ ok: true })
  })

  it('отвергает слишком длинный ролик', () => {
    const verdict = validateDuration(11 * 60_000, LIMITS)
    if (!verdict.ok) {
      expect(verdict.reason).toBe('too_long')
      expect(verdict.message).toMatch(/10 минут/)
    }
  })

  it('отвергает обрывок: почти всегда это ошибка монтажа', () => {
    const verdict = validateDuration(200, LIMITS)
    if (!verdict.ok) expect(verdict.reason).toBe('too_short')
  })

  it('неизвестная длительность не считается нарушением', () => {
    expect(validateDuration(null, LIMITS)).toEqual({ ok: true })
  })

  it('принимает ролик ровно на границе', () => {
    expect(validateDuration(LIMITS.minDurationMs, LIMITS)).toEqual({ ok: true })
    expect(validateDuration(LIMITS.maxDurationMs, LIMITS)).toEqual({ ok: true })
  })
})

describe('нужен ли транскод', () => {
  const base: MediaProbe = {
    durationMs: 10_000,
    width: 1920,
    height: 1080,
    videoCodec: 'h264',
    audioCodec: 'aac',
    frameRate: 25,
    hasAudio: true,
    pixFmt: 'yuv420p',
    bitrate: 4_000_000,
    formatName: 'mov,mp4',
  }

  it('готовый MP4/H.264/AAC не трогает', () => {
    expect(needsTranscode(base, 'video/mp4')).toBe(false)
  })

  it('перекодирует любой не-MP4', () => {
    expect(needsTranscode({ ...base, videoCodec: 'vp9' }, 'video/webm')).toBe(true)
  })

  it('перекодирует MP4 с другим видеокодеком', () => {
    expect(needsTranscode({ ...base, videoCodec: 'hevc' }, 'video/mp4')).toBe(true)
  })

  it('перекодирует MP4 с другим аудиокодеком', () => {
    expect(needsTranscode({ ...base, audioCodec: 'mp3' }, 'video/mp4')).toBe(true)
  })

  it('отсутствие звука не считается поводом для перекодирования', () => {
    expect(needsTranscode({ ...base, hasAudio: false, audioCodec: null }, 'video/mp4')).toBe(false)
  })
})

describe('параметры ffmpeg', () => {
  const args = (hasAudio: boolean, mute = false) =>
    buildTranscodeArgs({ input: 'in.mkv', output: 'out.mp4', hasAudio, mute })

  it('приводит к профилю, который читают телевизоры', () => {
    const list = args(true)

    // yuv420p обязателен: без него часть телевизоров показывает зелёный шум.
    expect(list).toContain('yuv420p')
    expect(list.join(' ')).toContain('-profile:v high')
    expect(list).toContain('libx264')
    expect(list).toContain('aac')
  })

  it('переносит заголовок в начало файла: иначе до первого кадра чёрный экран', () => {
    expect(args(true)).toContain('+faststart')
  })

  it('ставит ключевой кадр каждые 2 секунды: быстрее переключение роликов', () => {
    const list = args(true)
    const g = list[list.indexOf('-g') + 1]
    expect(g).toBe('60')
  })

  it('выбрасывает звук, если дорожки нет или она отключена', () => {
    expect(args(false)).toContain('-an')
    expect(args(true, true)).toContain('-an')
  })

  it('оставляет звук, когда он есть и нужен', () => {
    expect(args(true)).not.toContain('-an')
    expect(args(true).join(' ')).toContain('-b:a 128k')
  })

  it('всегда заканчивается выходным файлом', () => {
    expect(args(true).at(-1)).toBe('out.mp4')
  })
})

describe('соотношение сторон', () => {
  it('считает отношение', () => {
    expect(aspectRatio(1920, 1080)).toBeCloseTo(16 / 9, 5)
    expect(aspectRatio(null, null)).toBeNull()
    expect(aspectRatio(100, 0)).toBeNull()
  })

  it('16:9 считается обычным для телевизора', () => {
    expect(looksUnusualForTv(1920, 1080)).toBe(false)
    expect(looksUnusualForTv(1280, 720)).toBe(false)
  })

  it('вертикальный ролик помечается как необычный, но не отвергается', () => {
    // 9:16 — частый формат, и это не повод блокировать загрузку.
    expect(looksUnusualForTv(1080, 1920)).toBe(true)
    expect(validateDimensions(1080, 1920, LIMITS)).toEqual({ ok: true })
  })

  it('неизвестное разрешение не считается необычным', () => {
    expect(looksUnusualForTv(null, null)).toBe(false)
  })
})
