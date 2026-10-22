/**
 * Размер файла в медиатеке и плейлисте.
 *
 * Один знак после запятой у мегабайт: оператору важно отличить 1,4 МБ от
 * 1,8 МБ, а байты в этом масштабе ничего не добавляют.
 */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} МБ`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${bytes} Б`
}

/**
 * Занятая квота тарифа.
 *
 * Другое правило, чем у размера файла: квота измеряется сотнями мегабайт и
 * гигабайтами, поэтому мегабайты округляются до целого, а гигабайты
 * показываются с десятой долей.
 */
export function formatStorageSize(bytes: number): string {
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} МБ`
  return `${(bytes / 1024 ** 3).toFixed(1)} ГБ`
}
