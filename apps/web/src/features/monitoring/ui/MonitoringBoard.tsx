'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchMonitoring } from '../api'
import { sortDevices } from '../format'
import type { MonitoringSnapshot } from '../model'
import { DeviceTable } from './DeviceTable'
import { DowntimeTable } from './DowntimeTable'
import { IncidentFeed } from './IncidentFeed'
import { MonitoringStats } from './MonitoringStats'
import { PlayerErrors } from './PlayerErrors'

const REFRESH_MS = 10_000

const EMPTY: MonitoringSnapshot = {
  totals: { screens: 0, online: 0, offline: 0, inactive: 0 },
  devices: [],
  silent: [],
  openDowntimes: [],
  feed: [],
  errors: [],
}

/**
 * Мониторинг: что лежит, что молчит и что было в ленте.
 *
 * Опрос сервера, а не пересчёт в браузере: инциденты открывает фоновый насос,
 * и панель показывает ровно то, что записано в базу. Считать «оффлайн» на
 * клиенте значило бы показать вторую версию правды рядом с первой.
 */
export function MonitoringBoard({ companyId }: { companyId: string }) {
  const [snapshot, setSnapshot] = useState<MonitoringSnapshot>(EMPTY)

  const load = useCallback(async () => {
    const next = await fetchMonitoring(companyId)
    if (!next) return

    setSnapshot({ ...next, devices: sortDevices(next.devices) })
  }, [companyId])

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      if (!stopped) await load()
      if (!stopped) timer = setTimeout(tick, REFRESH_MS)
    }

    void tick()

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [load])

  return (
    <div className="flex flex-col gap-6">
      <MonitoringStats
        totals={snapshot.totals}
        openCount={snapshot.openDowntimes.length}
        silentCount={snapshot.silent.length}
      />

      <DeviceTable devices={snapshot.devices} />
      <DowntimeTable rows={snapshot.openDowntimes} />
      <IncidentFeed items={snapshot.feed} />
      <PlayerErrors rows={snapshot.errors} />
    </div>
  )
}
