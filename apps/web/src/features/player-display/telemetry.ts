/**
 * Профиль возможностей устройства.
 *
 * Требуется различать подтверждённое и неизвестное: браузер не всегда умеет
 * сообщить о кодеке, и выдумывать это нельзя.
 */
export function collectCapabilities(): Record<string, unknown> {
  const video = typeof document !== 'undefined' ? document.createElement('video') : null

  return {
    codecs: video
      ? {
          h264: video.canPlayType('video/mp4; codecs="avc1.42E01E"'),
          aac: video.canPlayType('audio/mp4; codecs="mp4a.40.2"'),
          vp9: video.canPlayType('video/webm; codecs="vp9"'),
          // unknown, а не false: браузер мог просто не ответить.
          h265: video.canPlayType('video/mp4; codecs="hvc1"') || 'unknown',
        }
      : 'unknown',
    screen: {
      width: window.screen?.width ?? null,
      height: window.screen?.height ?? null,
      devicePixelRatio: window.devicePixelRatio ?? null,
    },
    fullscreen: typeof document !== 'undefined' && Boolean(document.fullscreenEnabled),
    wakeLock: typeof navigator !== 'undefined' && 'wakeLock' in navigator,
    indexedDb: typeof indexedDB !== 'undefined',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    // Явная метка: часть полей мы не смогли определить.
    probe: 'partial',
  }
}

/**
 * Замер связи и площадки.
 *
 * Network Information API есть не во всех браузерах (в Firefox её нет вовсе),
 * поэтому каждое поле необязательное. Лучше показать прочерк, чем ноль:
 * ноль выглядел бы как идеальная сеть, а на самом деле это «неизвестно».
 */
export function collectTelemetry(pingMs: number | null, stateLatencyMs: number | null) {
  const navigatorExtra = navigator as Navigator & {
    connection?: { downlink?: number; rtt?: number; effectiveType?: string }
    deviceMemory?: number
    // userAgentData есть только в Chromium: в Safari и Firefox поля нет.
    userAgentData?: { platform?: string }
  }

  const connection = navigatorExtra.connection

  return {
    platform: navigatorExtra.userAgentData?.platform || navigator.platform || undefined,
    pingMs: pingMs ?? undefined,
    stateLatencyMs: stateLatencyMs ?? undefined,
    downlinkKbps:
      typeof connection?.downlink === 'number' ? Math.round(connection.downlink * 1000) : undefined,
    networkRttMs: typeof connection?.rtt === 'number' ? Math.round(connection.rtt) : undefined,
    effectiveType: connection?.effectiveType,
    deviceMemoryGb: navigatorExtra.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency || undefined,
    viewport: { width: window.innerWidth, height: window.innerHeight },
  }
}
