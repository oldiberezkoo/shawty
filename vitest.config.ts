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

    // Файлы тестов не идут параллельно: все интеграционные тесты бьют в одну
    // и ту же `data/test.db`, и каждый начинает с полной очистки таблиц.
    // В параллельных воркерах очистка одного файла стирала фикстуры другого —
    // тесты падали взаимно, причём только при полном прогоне.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
