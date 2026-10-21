import type { NextConfig } from 'next'

const apiInternalUrl = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/+$/, '')

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Контракты лежат в workspace и экспортируют TypeScript-исходники.
  // Next транспилирует их вместе с приложением, отдельная сборка не нужна.
  transpilePackages: ['@shawty/contracts'],

  // Браузер видит только веб-оригин. Запросы к /api/* проксируются в API,
  // поэтому cookie сессии и CSRF остаются same-origin, как и раньше.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiInternalUrl}/api/:path*`,
      },
    ]
  },

  // Плеер живёт на телевизорах — не хотим тянуть туда лишние полифилы и dev-обвязку.
  productionBrowserSourceMaps: false,

  experimental: {
    optimizePackageImports: ['@base-ui/react'],
  },
}

export default nextConfig
