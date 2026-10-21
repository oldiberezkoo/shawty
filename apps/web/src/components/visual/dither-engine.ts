/**
 * Дизеринг-сцены.
 *
 * Канвас заполняется одним пикселем на ячейку, а CSS растягивает его с
 * `image-rendering: pixelated`. Поэтому размер буфера — это сетка, а не экран:
 * 350×200 точек вместо 1400×800. Тона переводятся в три цвета (фон, смесь
 * акцента, акцент) упорядоченным дизерингом по матрице Bayer 4×4.
 *
 * Сцены детерминированы: при повторном монтировании кристаллы стоят там же,
 * где стояли, и картинка не «прыгает» при каждом resize.
 */

export type SceneName = 'crystals' | 'flow'

export type Rgb = readonly [number, number, number]

export type Palette = {
  bg: Rgb
  mid: Rgb
  fg: Rgb
}

type Crystal = {
  x: number
  half: number
  height: number
  seed: number
}

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Ровный шум для «породы» под кристаллами. */
function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value)
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = smoothstep(x - ix)
  const fy = smoothstep(y - iy)

  const a = hash2(ix, iy)
  const b = hash2(ix + 1, iy)
  const c = hash2(ix, iy + 1)
  const d = hash2(ix + 1, iy + 1)

  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
}

function fbm(x: number, y: number, octaves: number): number {
  let sum = 0
  let amplitude = 0.5
  let frequency = 1

  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise(x * frequency, y * frequency) * amplitude
    frequency *= 2
    amplitude *= 0.5
  }

  return sum
}

/**
 * Кластер кристаллов: «постель» вдоль нижнего края и более высокий кластер
 * вокруг фокуса. Высота падает к краям, самый высокий — в фокусе.
 */
export function makeCrystals(width: number, height: number, focus: number): Crystal[] {
  const rng = mulberry32(0x51a7)
  const crystals: Crystal[] = []
  const count = clamp(Math.round(width / 20), 7, 22)
  const focusX = clamp(focus, 0.08, 0.92) * width

  for (let i = 0; i < count; i += 1) {
    const inCluster = i < Math.round(count * 0.7)
    const spread = inCluster ? width * 0.3 : width * 0.5
    const center = inCluster ? focusX : rng() * width
    const x = Math.round(clamp(center + (rng() * 2 - 1) * spread, 2, width - 3))
    const distance = Math.abs(x - focusX) / Math.max(1, width * 0.4)
    const tall = inCluster ? 0.34 + (1 - clamp(distance, 0, 1)) * 0.3 : 0.14 + rng() * 0.22
    const heightPx = Math.max(3, Math.round((tall + rng() * 0.08) * height))
    const half = Math.max(1, Math.round(heightPx * (0.17 + rng() * 0.09)))

    crystals.push({ x, half, height: heightPx, seed: rng() })
  }

  // Высокие — дальше, низкие — ближе: рисуем от дальних к передним.
  return crystals.sort((a, b) => b.height - a.height)
}

/**
 * Тона сцены 0..1. Буфер пересоздаётся на каждый кадр — 70k чисел дешевле,
 * чем хранение и сброс между кадрами.
 */
export function sceneTones(
  scene: SceneName,
  width: number,
  height: number,
  time: number,
  focus: number,
  crystals: Crystal[],
): Float32Array {
  const tones = new Float32Array(width * height)

  if (scene === 'flow') {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const nx = x * 0.018
        const ny = y * 0.036
        const turbulence = fbm(nx + time * 0.035, ny - time * 0.02, 3)
        const band = Math.sin((nx * 1.6 + ny * 0.35 + turbulence * 2.2 + time * 0.06) * Math.PI * 2)
        const crest = Math.pow((band + 1) / 2, 2.1)

        // Потолок яркости низкий: полосы остаются тёмно-малиновыми, а акцент
        // появляется только на редких гребнях.
        let tone = 0.03 + crest * (0.12 + turbulence * 0.32)
        if (crest > 0.965) tone = 0.92

        tones[y * width + x] = tone
      }
    }

    return tones
  }

  // Фон: мелкий шум «породы», у нижнего края плотнее.
  for (let y = 0; y < height; y += 1) {
    const depth = y / Math.max(1, height - 1)
    for (let x = 0; x < width; x += 1) {
      const grain = valueNoise(x * 0.18, y * 0.18)
      const rock = smoothstep(clamp((depth - 0.6) / 0.4, 0, 1))
      tones[y * width + x] = 0.015 + grain * 0.04 + rock * grain * 0.07
    }
  }

  const pulsePhase = (time * 0.16) % 1
  const shimmerPhase = (time * 0.055) % 1
  const span = width + height * 0.55

  for (const crystal of crystals) {
    const top = height - 1 - crystal.height
    const pulseRow = Math.round(((pulsePhase + crystal.seed) % 1) * crystal.height)

    for (let row = 0; row < crystal.height; row += 1) {
      const v = row / Math.max(1, crystal.height - 1)
      const half = Math.max(1, Math.round(crystal.half * (1 - 0.52 * v)))
      const y = height - 1 - row
      if (y < 0) continue

      // Тёмный зазор вокруг силуэта: кристаллы не слипаются в одно пятно.
      for (let gap = -half - 1; gap <= half + 1; gap += 1) {
        const gx = crystal.x + gap
        if (gx < 0 || gx >= width) continue
        const index = y * width + gx
        const current = tones[index] ?? 0
        if (current > 0.02) tones[index] = 0.02
      }

      for (let dx = -half; dx <= half; dx += 1) {
        const px = crystal.x + dx
        if (px < 0 || px >= width) continue

        const face = dx < 0 ? 0.86 : dx > 0 ? 0.58 : 0.5
        const fade = 1 - 0.42 * (1 - v)
        let tone = face * fade

        // Верхняя кромка ступени — самая светлая точка.
        if (row === crystal.height - 1) tone = 1

        // Импульс бежит снизу вверх по каждому кристаллу.
        if (Math.abs(row - pulseRow) <= 1) tone = 1

        const index = y * width + px
        if ((tones[index] ?? 0) < tone) tones[index] = tone
      }
    }
  }

  // Диагональный блик по всей сцене.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distance = (x + (height - y) * 0.55) / span
      const delta = Math.abs(distance - shimmerPhase)
      if (delta < 0.008) {
        const index = y * width + x
        const base = tones[index] ?? 0
        tones[index] = clamp(base + (base > 0.1 ? 0.32 : 0.04), 0, 1)
      }
    }
  }

  return tones
}

/** Перевод тона в один из трёх цветов по матрице Bayer. */
export function renderTones(
  tones: Float32Array,
  width: number,
  height: number,
  palette: Palette,
  data: Uint8ClampedArray,
): void {
  for (let y = 0; y < height; y += 1) {
    const matrixRow = BAYER[y & 3]

    for (let x = 0; x < width; x += 1) {
      const tone = clamp(tones[y * width + x] ?? 0, 0, 1) * 2
      const base = Math.floor(tone)
      const fraction = tone - base
      const threshold = ((matrixRow?.[x & 3] ?? 0) + 0.5) / 16
      const level = Math.min(2, base + (fraction > threshold ? 1 : 0))
      const color = level === 2 ? palette.fg : level === 1 ? palette.mid : palette.bg
      const offset = (y * width + x) * 4

      data[offset] = color[0]
      data[offset + 1] = color[1]
      data[offset + 2] = color[2]
      data[offset + 3] = 255
    }
  }
}

export function parseHex(value: string): Rgb | null {
  const hex = value.trim()
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)
  if (!match) return null

  const body = match[1] ?? ''
  if (body.length === 3) {
    return [
      parseInt(body.charAt(0) + body.charAt(0), 16),
      parseInt(body.charAt(1) + body.charAt(1), 16),
      parseInt(body.charAt(2) + body.charAt(2), 16),
    ]
  }

  return [
    parseInt(body.slice(0, 2), 16),
    parseInt(body.slice(2, 4), 16),
    parseInt(body.slice(4, 6), 16),
  ]
}

export function parseRgbTriplet(value: string): Rgb | null {
  const parts = value.trim().split(/[\s,]+/).map(Number)
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

export function paletteFor(bg: Rgb, accent: Rgb): Palette {
  const mix = 0.3
  return {
    bg,
    mid: [
      Math.round(bg[0] + (accent[0] - bg[0]) * mix),
      Math.round(bg[1] + (accent[1] - bg[1]) * mix),
      Math.round(bg[2] + (accent[2] - bg[2]) * mix),
    ],
    fg: accent,
  }
}
