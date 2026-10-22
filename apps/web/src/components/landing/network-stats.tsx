'use client'

import { useEffect, useState } from 'react'

type NetworkStats = {
  screens: number
  online: number
  downlinkMbps: number | null
  measuredAt: string | null
  generatedAt: string
}

type StatsState = {
  data: NetworkStats | null
  error: boolean
}

const numberFormat = new Intl.NumberFormat('ru-RU')
const mbpsFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })
const timeFormat = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function isNetworkStats(value: unknown): value is NetworkStats {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.screens === 'number' &&
    typeof candidate.online === 'number' &&
    (candidate.downlinkMbps === null || typeof candidate.downlinkMbps === 'number') &&
    (candidate.measuredAt === null || typeof candidate.measuredAt === 'string') &&
    typeof candidate.generatedAt === 'string'
  )
}

/**
 * Живая сводка по сети.
 *
 * Значения приходят из публичного агрегата API. Если данных нет, показываем
 * прочерк — не подставляем демонстрационное число. Третий показатель — оценка
 * канала из heartbeat, а не биллинг переданных гигабайт.
 */
export function NetworkStats({ className = '' }: { className?: string }) {
  const [state, setState] = useState<StatsState>({ data: null, error: false })

  useEffect(() => {
    let cancelled = false
    let inFlight = false
    const controller = new AbortController()

    async function load() {
      if (inFlight) return
      inFlight = true

      try {
        const response = await fetch('/api/network-stats', {
          cache: 'no-store',
          signal: controller.signal,
        })

        if (!response.ok) throw new Error(`stats ${response.status}`)

        const payload: unknown = await response.json()
        if (!isNetworkStats(payload)) throw new Error('unexpected stats payload')

        if (!cancelled) setState({ data: payload, error: false })
      } catch (error) {
        if (!cancelled && (error as Error).name !== 'AbortError') {
          setState((current) => ({ data: current.data, error: true }))
        }
      } finally {
        inFlight = false
      }
    }

    void load()
    const interval = window.setInterval(load, 30_000)

    return () => {
      cancelled = true
      controller.abort()
      window.clearInterval(interval)
    }
  }, [])

  const data = state.data
  const onlinePercent =
    data && data.screens > 0 ? Math.min(100, Math.round((data.online / data.screens) * 100)) : 0
  const activeBars = Math.round((onlinePercent / 100) * 32)
  const channel =
    data?.downlinkMbps == null ? '—' : `${mbpsFormat.format(data.downlinkMbps)} Мбит/с`
  const updatedAt = data ? timeFormat.format(new Date(data.generatedAt)) : '—'

  const status = state.error
    ? data
      ? 'последние данные'
      : 'нет связи'
    : data
      ? 'live'
      : 'подключение'

  return (
    <div className={`landing-stats ${className}`.trim()}>
      <div className="landing-stats-head">
        <span
          className={`landing-stats-live${state.error ? ' is-error' : data ? ' is-live' : ''}`}
          aria-live="polite"
        >
          <i aria-hidden="true" />
          {status}
        </span>
        <span className="landing-stats-updated">обновлено / {updatedAt}</span>
      </div>

      <div className="landing-stats-grid">
        <div className="landing-stat">
          <span className="section-title">Экранов на обслуживании</span>
          <strong className="landing-stat-value">
            {data ? numberFormat.format(data.screens) : '—'}
          </strong>
          <span className="landing-stat-note">paired screens</span>
        </div>

        <div className="landing-stat">
          <span className="section-title">Сейчас на связи</span>
          <strong className="landing-stat-value">
            {data ? numberFormat.format(data.online) : '—'}
          </strong>
          <div
            className="landing-stat-meter"
            role="img"
            aria-label={`На связи ${data ? data.online : '—'} из ${data ? data.screens : '—'} экранов`}
          >
            <i style={{ width: `${onlinePercent}%` }} />
          </div>
          <span className="landing-stat-note">{data ? `${onlinePercent}% парка` : 'online / 90 sec'}</span>
        </div>

        <div className="landing-stat">
          <span className="section-title">Суммарный канал</span>
          <strong
            className={`landing-stat-value landing-stat-value--text${
              data?.downlinkMbps == null ? ' is-empty' : ''
            }`}
          >
            {channel}
          </strong>
          <span className="landing-stat-note">heartbeat / оценка</span>
        </div>
      </div>

      <div className="landing-stats-pulse" aria-hidden="true">
        {Array.from({ length: 32 }, (_, index) => (
          <i
            key={index}
            className={index < activeBars ? 'is-active' : undefined}
            style={{
              height: `${28 + ((index * 37) % 64)}%`,
              animationDelay: `${index * 55}ms`,
            }}
          />
        ))}
      </div>

      <div className="landing-stats-foot">
        <span>heartbeat · обновление 30 с</span>
        <span>
          {state.error
            ? data
              ? 'обновление не удалось'
              : 'API не ответил'
            : 'только реальные данные'}
        </span>
      </div>

      <p className="landing-stats-note">
        Третий показатель — оценка канала, которую устройства сообщают через
        Network Information API. Это не объём переданного трафика и не биллинг.
      </p>
    </div>
  )
}
