'use client'

import { useEffect, useRef } from 'react'

/**
 * Экран не должен гаснуть и обязан занимать весь экран телевизора.
 *
 * Wake Lock удерживает картинку: без него система гасит экран через несколько
 * минут простоя, и оператор решает, что устройство сломалось. Полный экран
 * включается при старте и по клавише `f`.
 */
export function useDevicePower() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    let released = false

    async function acquire() {
      try {
        if (!('wakeLock' in navigator)) return
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      } catch {
        // Запрос может быть отклонён без видимой пользователю причины —
        // например, на экране, который система считает активным.
      }
    }

    void acquire()

    const onVisibility = async () => {
      if (document.visibilityState === 'visible' && !released) void acquire()
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisibility)
      void wakeLockRef.current?.release().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const enter = async () => {
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen()
        }
      } catch {
        // Полный экран может быть запрещён политикой браузера на ТВ.
      }
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'f') void enter()
    }

    void enter()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
