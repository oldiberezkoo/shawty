import type { MonitoringSnapshot } from './model'

/**
 * Снимок мониторинга.
 *
 * Фоновый опрос молча переживает обрыв: следующий тик попробует снова.
 * Мигающая ошибка в панели мониторинга сама была бы симптомом.
 */
export async function fetchMonitoring(companyId: string): Promise<MonitoringSnapshot | null> {
  try {
    const response = await fetch('/api/dashboard/monitoring', {
      headers: { 'x-company-id': companyId },
      cache: 'no-store',
    })

    if (!response.ok) return null

    return (await response.json()) as MonitoringSnapshot
  } catch {
    return null
  }
}
