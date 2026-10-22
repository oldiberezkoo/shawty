/**
 * Выбор формы существительного по числу.
 *
 * Русские правила: 1 файл, 2 файла, 5 файлов, но 11 файлов и 21 файл.
 * Формы передаются вызывающим кодом, потому что род и контекст («экран»,
 * «сотрудник») не выводятся из числа.
 */
export function plural(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10
  const mod100 = value % 100

  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few

  return many
}
