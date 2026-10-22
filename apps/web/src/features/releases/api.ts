import type { DeliverySnapshot } from './model'

/**
 * Живые числа доставки.
 *
 * Молча переживаем обрыв: следующий тик попробует снова. Показывать ошибку
 * опроса было бы шумом — числа просто останутся прежними.
 */
export async function fetchDeliverySnapshot(companyId: string): Promise<DeliverySnapshot | null> {
  try {
    const response = await fetch('/api/dashboard/releases', {
      headers: { 'x-company-id': companyId },
      cache: 'no-store',
    })

    if (!response.ok) return null

    return (await response.json()) as DeliverySnapshot
  } catch {
    return null
  }
}
