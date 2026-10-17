import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Интеграционные тесты работают с настоящим SQLite-файлом: транзакции
    // и блокировки строк проверяются только на реальном движке.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Файлы базы изолируем по потокам, чтобы тесты не мешали друг другу.
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: false },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
