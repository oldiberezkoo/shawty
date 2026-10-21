import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Кастомный сервер (server/index.ts) поднимает Next и WebSocket на одном порту.
  // Режим standalone с кастомным сервером несовместим — вывод собираем обычный.
  output: undefined,

  // Нативные модули не бандлим: better-sqlite3 должен остаться внешним.
  serverExternalPackages: ['better-sqlite3'],

  // Плеер живёт на телевизорах — не хотим тянуть туда лишние полифилы и dev-обвязку.
  productionBrowserSourceMaps: false,

  experimental: {
    optimizePackageImports: ['@base-ui-components/react'],
  },
}

export default nextConfig
