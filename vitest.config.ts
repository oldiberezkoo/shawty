import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Интеграционные тесты работают с настоящим SQLite-файлом: транзакции
    // и блокировки строк проверяются только на реальном движке.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    globalSetup: ['tests/setup/migrate-test-db.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
