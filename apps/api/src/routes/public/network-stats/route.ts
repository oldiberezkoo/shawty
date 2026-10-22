import { jsonResponse, route } from '@/server/http/request'
import { getPublicNetworkStats } from '@/server/services/public-network-service'

/**
 * Публичная сводка по сети для лендинга.
 *
 * Отдаёт только агрегаты и кэшируется на короткий срок, чтобы главная
 * страница могла обновлять цифры, не создавая лишнюю нагрузку на API.
 */
export const GET = route(async () => {
  return jsonResponse(getPublicNetworkStats(), {
    headers: {
      'cache-control': 'public, max-age=15, stale-while-revalidate=30',
    },
  })
})
