/**
 * Транслитерация в слаг.
 *
 * Слаг компании попадает в ссылки и в журнал, поэтому он обязан читаться.
 * Просто выбросить кириллицу нельзя: «Кофейня» превратилась бы в пустую
 * строку и все компании получили бы один и тот же адрес.
 */
const CYRILLIC: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
}

export function slugifyCompanyName(value: string): string {
  let out = ''

  for (const char of value.trim().toLowerCase()) {
    if (char >= 'a' && char <= 'z') {
      out += char
    } else if (char >= '0' && char <= '9') {
      out += char
    } else if (char in CYRILLIC) {
      out += CYRILLIC[char]
    } else {
      out += '-'
    }
  }

  const slug = out
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

  return slug || 'company'
}
