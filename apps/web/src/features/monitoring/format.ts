import type { DeviceRow } from './model'

/** Порядок в таблице: сначала то, что требует внимания. */
const DEVICE_STATE_ORDER: Record<DeviceRow['onlineState'], number> = {
  offline: 0,
  error: 0,
  syncing: 1,
  unpaired: 2,
  disabled: 3,
  revoked: 3,
  online: 4,
}

export function sortDevices(devices: DeviceRow[]): DeviceRow[] {
  return [...devices].sort(
    (left, right) =>
      DEVICE_STATE_ORDER[left.onlineState] - DEVICE_STATE_ORDER[right.onlineState] ||
      left.name.localeCompare(right.name, 'ru'),
  )
}

export const INCIDENT_LABEL: Record<string, string> = {
  offline: 'нет связи',
  reconnected: 'вернулся на связь',
  version_mismatch: 'устаревший плеер',
  storage_low: 'мало памяти',
  unpaired: 'потерял привязку',
  revoked: 'отозван доступ',
}

export const INCIDENT_TONE: Record<string, string> = {
  offline: 'text-warn',
  reconnected: 'text-success',
  version_mismatch: 'text-danger',
  storage_low: 'text-warn',
  unpaired: 'text-danger',
  revoked: 'text-text-subtle',
}

/** Длительность простоя/молчания в человеческих единицах. */
export function formatSilence(seconds: number): string {
  if (seconds < 60) return `${seconds} с`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} мин`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч`
  return `${Math.floor(hours / 24)} дн`
}

export function formatTime(value: string): string {
  return new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function formatMbps(kbps: number | null): string {
  if (kbps === null) return '—'
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Мбит/с` : `${Math.round(kbps)} кбит/с`
}

export function deviceHint(device: DeviceRow): string {
  const parts = [
    device.playerVersion ? `плеер ${device.playerVersion}` : null,
    device.screenWidth && device.screenHeight ? `${device.screenWidth}×${device.screenHeight}` : null,
    device.deviceMemoryGb ? `${device.deviceMemoryGb} ГБ ОЗУ` : null,
  ].filter((part): part is string => Boolean(part))

  return parts.length > 0 ? parts.join(' · ') : 'данных об устройстве пока нет'
}
