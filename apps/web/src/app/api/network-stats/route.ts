const apiInternalUrl = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/+$/, '')

/**
 * Прокси к публичной сводке API.
 *
 * Браузер не должен знать внутренний адрес API, а лендинг — ходить в него
 * напрямую: этот route остаётся единственной точкой для клиентского счётчика.
 */
export async function GET() {
  try {
    const response = await fetch(`${apiInternalUrl}/api/public/network-stats`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      return Response.json(
        { error: { code: 'stats_unavailable', message: 'Сводка временно недоступна' } },
        { status: 502, headers: { 'cache-control': 'no-store' } },
      )
    }

    return new Response(await response.text(), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  } catch {
    return Response.json(
      { error: { code: 'stats_unavailable', message: 'Сводка временно недоступна' } },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    )
  }
}
