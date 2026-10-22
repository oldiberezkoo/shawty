'use client'

import { useCallback, useRef, useState } from 'react'
import { CLOCK_STALE_MS } from './config'
import { measureClock, shouldAcceptClockSample, type ClockSample } from './clock-sync'

/**
 * Серверная шкала времени.
 *
 * Показ синхронизируется по серверу: два телевизора с одним плейлистом
 * обязаны переключать материал в одну и ту же миллисекунду. Локальные часы
 * для этого не годятся — они расходятся на секунды.
 *
 * `revision` увеличивается после каждого принятого замера: эффекты,
 * зависящие от часов, пересчитывают позицию, когда смещение уточнилось.
 */
export function useServerClock() {
  const offsetRef = useRef(0)
  const bestRttRef = useRef(Number.POSITIVE_INFINITY)
  const syncedAtRef = useRef(0)
  const [revision, setRevision] = useState(0)

  const serverNow = useCallback(() => Date.now() + offsetRef.current, [])

  /** Новый канал — новый лучший замер: старый мог быть снят на плохой сети. */
  const resetBestRtt = useCallback(() => {
    bestRttRef.current = Number.POSITIVE_INFINITY
  }, [])

  const applySample = useCallback((clientAt: number, serverAt: number, receivedAt: number) => {
    const sample: ClockSample = measureClock(clientAt, serverAt, receivedAt)
    const accepted = shouldAcceptClockSample(
      sample,
      bestRttRef.current,
      syncedAtRef.current,
      receivedAt,
      CLOCK_STALE_MS,
    )

    if (!accepted) return false

    offsetRef.current = sample.offsetMs
    bestRttRef.current = sample.rttMs
    syncedAtRef.current = receivedAt
    setRevision((value) => value + 1)
    return true
  }, [])

  return { serverNow, revision, resetBestRtt, applySample }
}
