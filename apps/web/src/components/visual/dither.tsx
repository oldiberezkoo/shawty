'use client'

import { useEffect, useRef } from 'react'
import {
  makeCrystals,
  paletteFor,
  parseHex,
  parseRgbTriplet,
  renderTones,
  sceneTones,
  type Palette,
  type SceneName,
} from './dither-engine'

/** 12 кадров в секунду: выше — «пиксели» перестают читаться как пиксели. */
const FRAME_MS = 1000 / 12

/**
 * Дизеринг-сцена.
 *
 * SSR-разметка — пустой канвас; если JS нет, остаётся фон страницы. Сцена не
 * обязательна для чтения интерфейса, поэтому aria-hidden и никакого текста
 * внутри: всё смысловое стоит рядом, обычным слоем.
 */
export function Dither({
  scene = 'crystals',
  focus = 0.5,
  cell = 2,
  className = '',
}: {
  scene?: SceneName
  focus?: number
  cell?: number
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const startedAt = performance.now()

    let width = 0
    let height = 0
    let crystals = makeCrystals(1, 1, focus)
    let palette: Palette | null = null
    let image: ImageData | null = null
    let running = false
    let frame = 0
    let last = 0

    function readPalette() {
      const styles = getComputedStyle(canvas as HTMLCanvasElement)
      const bg = parseHex(styles.getPropertyValue('--bg')) ?? ([10, 10, 10] as const)
      const accent =
        parseRgbTriplet(styles.getPropertyValue('--accent-rgb')) ?? ([255, 79, 123] as const)
      palette = paletteFor(bg, accent)
    }

    function draw(seconds: number) {
      if (!width || !height || !image || !palette) return
      const tones = sceneTones(scene, width, height, seconds, focus, crystals)
      renderTones(tones, width, height, palette, image.data)
      context!.putImageData(image, 0, 0)
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect()
      width = Math.max(1, Math.round(rect.width / cell))
      height = Math.max(1, Math.round(rect.height / cell))
      canvas!.width = width
      canvas!.height = height
      context!.imageSmoothingEnabled = false
      image = context!.createImageData(width, height)
      crystals = makeCrystals(width, height, focus)
      readPalette()
      draw(reduced ? 9 : (performance.now() - startedAt) / 1000)
    }

    function tick(now: number) {
      frame = requestAnimationFrame(tick)
      if (reduced || !running) return
      if (now - last < FRAME_MS) return
      last = now
      draw((now - startedAt) / 1000)
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        running = Boolean(entries[0]?.isIntersecting)
        if (running && !reduced) draw((performance.now() - startedAt) / 1000)
      },
      { rootMargin: '200px' },
    )
    intersectionObserver.observe(canvas)

    // Переключение темы меняет палитру: пересчитываем цвета без перезагрузки.
    const themeObserver = new MutationObserver(() => {
      readPalette()
      draw(reduced ? 9 : (performance.now() - startedAt) / 1000)
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    resize()
    if (!reduced) frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      themeObserver.disconnect()
    }
  }, [scene, focus, cell])

  return <canvas ref={ref} className={`dither ${className}`} aria-hidden="true" />
}
