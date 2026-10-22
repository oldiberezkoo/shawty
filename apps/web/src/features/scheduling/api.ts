import type { Preview, ScreenSchedule } from './model'

/** Список экранов с текущей программой. Фоновый опрос: ошибки молча пропускаем. */
export async function fetchSchedule(companyId: string): Promise<ScreenSchedule[] | null> {
  try {
    const response = await fetch('/api/dashboard/schedule', {
      headers: { 'x-company-id': companyId },
      cache: 'no-store',
    })

    if (!response.ok) return null

    const data = (await response.json()) as { screens: ScreenSchedule[] }
    return data.screens
  } catch {
    return null
  }
}

/** Календарь экрана на неделю. Маршрут отвечает `{ preview }`. */
export async function fetchSchedulePreview(companyId: string, screenId: string): Promise<Preview | null> {
  try {
    const response = await fetch(`/api/dashboard/schedule?screenId=${encodeURIComponent(screenId)}&days=7`, {
      headers: { 'x-company-id': companyId },
      cache: 'no-store',
    })

    if (!response.ok) return null

    const data = (await response.json()) as { preview: Preview }
    return data.preview
  } catch {
    return null
  }
}
