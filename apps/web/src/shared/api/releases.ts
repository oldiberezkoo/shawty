/**
 * Запросы раздела публикаций.
 *
 * Один и тот же путь и тела запросов используют три места: парк экранов,
 * карточка экрана и расписание. Строка пути и имена полей, набранные в каждом
 * компоненте отдельно, — это несколько шансов разойтись молча.
 */
export const RELEASES_PATH = '/api/dashboard/releases'

/** Назначить плейлист конкретным экранами. */
export function assignScreensRequest(screenIds: string[], playlistVersionId: string): RequestInit {
  return { method: 'PUT', body: JSON.stringify({ screenIds, playlistVersionId }) }
}

/** Снять назначения с конкретных экранов. */
export function unassignScreensRequest(screenIds: string[]): RequestInit {
  return { method: 'DELETE', body: JSON.stringify({ screenIds }) }
}

/** Обновить программу на конкретных экранах. */
export function publishScreensRequest(screenIds: string[]): RequestInit {
  return { method: 'POST', body: JSON.stringify({ screenIds }) }
}
