'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mark } from '@/components/visual/mark'

const SCENES = [
  {
    kicker: 'осеннее меню',
    title: 'Тыква и специи',
    meta: 'до 30 ноября',
    schedule: '09:00 — 23:00',
    art: 'amber',
  },
  {
    kicker: 'вечерняя программа',
    title: 'Свет после шести',
    meta: 'каждый день',
    schedule: '18:00 — 23:00',
    art: 'night',
  },
  {
    kicker: 'новый сезон',
    title: 'Коллекция 2026',
    meta: 'уже в зале',
    schedule: '10:00 — 22:00',
    art: 'grid',
  },
] as const

const SCREEN_COUNT = 4

/**
 * Демонстрация синхронизации четырёх экранов.
 *
 * Это макет, а не данные работающей сети: подпись под ним говорит об этом
 * прямо. Автоматическая смена версии отключается при prefers-reduced-motion,
 * но кнопка остаётся рабочей — обновление можно запустить вручную.
 */
export function SyncWall({ className = '' }: { className?: string }) {
  const [sceneIndex, setSceneIndex] = useState(0)
  const [version, setVersion] = useState(42)
  const [updating, setUpdating] = useState(false)
  const timeoutRef = useRef<number | null>(null)
  const reducedMotionRef = useRef(false)

  const publish = useCallback(() => {
    if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current)

    setUpdating(true)
    setSceneIndex((current) => (current + 1) % SCENES.length)
    setVersion((current) => current + 1)

    timeoutRef.current = window.setTimeout(() => {
      setUpdating(false)
    }, 900)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const syncPreference = () => {
      reducedMotionRef.current = media.matches
    }

    syncPreference()
    media.addEventListener('change', syncPreference)

    return () => media.removeEventListener('change', syncPreference)
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!reducedMotionRef.current && document.visibilityState === 'visible') {
        publish()
      }
    }, 7000)

    return () => window.clearInterval(interval)
  }, [publish])

  useEffect(() => {
    return () => {
      if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current)
    }
  }, [])

  const scene = SCENES[sceneIndex] ?? SCENES[0]

  return (
    <div className={className}>
      <div
        className="sync-wall"
        role="group"
        aria-label="Демонстрация синхронизации четырёх экранов"
        aria-busy={updating}
      >
        <div className="sync-wall-bar">
          <span className="sync-wall-brand">
            <Mark size={9} className="text-primary" />
            <span translate="no">sync / demo</span>
          </span>
          <span className="sync-wall-live">
            <i aria-hidden="true" />
            пример
          </span>
        </div>

        <div className="sync-hub">
          <div className="sync-hub-copy">
            <span className="section-title">Публикация</span>
            <p className="sync-hub-status">
              {updating ? 'Передаём новую версию…' : `Версия ${version} на всех экранах`}
            </p>
          </div>

          <button type="button" className="sync-button" onClick={publish}>
            Обновить {SCREEN_COUNT} экрана
            <span aria-hidden="true">↗</span>
          </button>
        </div>

        <div className="sync-grid">
          {Array.from({ length: SCREEN_COUNT }, (_, index) => (
            <div
              key={index}
              className={`sync-tv${updating ? ' is-updating' : ''}`}
            >
              <div className="sync-tv-head">
                <span>экран / {String(index + 1).padStart(2, '0')}</span>
                <span className="sync-tv-state">
                  <i aria-hidden="true" />
                  {updating ? 'sync' : 'online'}
                </span>
              </div>

              <div className="sync-screen" aria-hidden="true">
                <div className={`sync-art sync-art--${scene.art}`} />
                <span className="sync-scan" />

                <div className="sync-poster">
                  <div className="sync-poster-top">
                    <span>{scene.kicker}</span>
                    <span>v{version}</span>
                  </div>

                  <div className="sync-poster-copy">
                    <span className="sync-poster-title">{scene.title}</span>
                    <span className="sync-poster-meta">{scene.meta}</span>
                  </div>

                  <div className="sync-poster-bottom">
                    <span>{scene.schedule}</span>
                    <span translate="no">SHAWTY</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="sync-wall-foot">
          <span className="sync-wall-status" aria-live="polite">
            <i aria-hidden="true" />
            {updating ? 'передаём версию' : 'принято 4 / 4'}
          </span>
          <span>связь / есть</span>
        </div>
      </div>

      <p className="sync-caption">
        Демонстрация: одна публикация меняет четыре экрана одновременно.
      </p>
    </div>
  )
}
