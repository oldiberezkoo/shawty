'use client'

import { useEffect, useRef, useState } from 'react'
import { PlayerStateScreen } from '@/features/player-display/PlayerStateScreen'
import { useDeviceChannel } from '@/features/player-display/use-device-channel'
import { useDevicePower } from '@/features/player-display/use-device-power'
import { usePlayerAuth } from '@/features/player-display/use-player-auth'
import { usePlayerPlayback } from '@/features/player-display/use-player-playback'
import { useServerClock } from '@/features/player-display/use-server-clock'
import type { PlayerPhase } from '@/features/player-display/config'

/**
 * Экран воспроизведения.
 *
 * Требование продукта — «подключил телевизор и забыл на год». Отсюда решения:
 *
 * - Показ не останавливается никогда. Ошибка сети, файла или сервера не должна
 *   оставлять экран чёрным: худшее, что случится, — экран ошибки.
 * - После перезагрузки страницы показ продолжается с того же места, а не
 *   начинается заново: часы на телевизоре для этого ненадёжны, поэтому позиция
 *   считается от времени начала публикации.
 * - Короткоживущий токен обновляется сам. Постоянный секрет в браузере живёт
 *   годами, а токен — минуты.
 * - Таймеры не дают экрану уснуть: без этого телевизор гасит картинку через
 *   несколько минут простоя, и оператор увидит «экран сломан».
 *
 * Компонент только собирает части: учётные данные, серверные часы, показ,
 * канал и питание живут в отдельных хуках.
 */
export function PlayerDisplay() {
  const [phase, setPhase] = useState<PlayerPhase>('authenticating')
  const [message, setMessage] = useState<string | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  /**
   * Задержка последнего запроса состояния. Канал дополняет её ping-ом:
   * канал может быть быстрым, а сервер — занят.
   */
  const stateLatencyMsRef = useRef<number | null>(null)

  const clock = useServerClock()
  const auth = usePlayerAuth({ setPhase, setMessage })
  const playback = usePlayerPlayback({
    phase,
    setPhase,
    serverNow: clock.serverNow,
    clockRevision: clock.revision,
    ensureToken: auth.ensureToken,
    invalidateToken: auth.invalidateToken,
    socketRef,
    stateLatencyMsRef,
  })

  useDeviceChannel({
    phase,
    socketRef,
    manifestRef: playback.manifestRef,
    stateLatencyMsRef,
    accessTokenRef: auth.accessTokenRef,
    ensureToken: auth.ensureToken,
    invalidateToken: auth.invalidateToken,
    loadState: playback.loadState,
    applyManifest: playback.applyManifest,
    resetFailures: playback.resetFailures,
    clearAndReturnToPairing: auth.clearAndReturnToPairing,
    resetBestRtt: clock.resetBestRtt,
    applyClockSample: clock.applySample,
  })

  useDevicePower()

  useEffect(() => {
    let cancelled = false

    async function start() {
      const credential = await auth.loadCredentialOrRedirect()
      if (!credential) return

      const token = await auth.ensureToken()
      if (!token || cancelled) return

      await playback.loadState()
    }

    void start()

    return () => {
      cancelled = true
    }
    // Один раз на всё время жизни экрана: дальше состояние ведёт себя само.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (phase !== 'ready' || !playback.item) {
    return <PlayerStateScreen phase={phase} message={message} />
  }

  return (
    <main className="fixed inset-0 size-full overflow-hidden bg-black">
      {playback.item.kind === 'video' ? (
        <video
          key={`${playback.item.id}:${playback.playbackNonce}`}
          ref={playback.videoRef}
          src={playback.item.url}
          autoPlay
          preload="auto"
          muted={playback.item.audio === 'mute'}
          playsInline
          onLoadedMetadata={(event) => playback.alignVideo(event.currentTarget)}
          onEnded={playback.onVideoEnded}
          onError={playback.onItemError}
          className="player-media-in size-full object-contain"
        />
      ) : (
        // Изображение вписывается целиком: обрезка рекламы недопустима.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${playback.item.id}:${playback.playbackNonce}`}
          src={playback.item.url}
          alt=""
          onError={playback.onItemError}
          className="player-media-in size-full bg-black object-contain"
        />
      )}
    </main>
  )
}
