# apps/api

Бэкенд SHAWTY: Hono + `ws` + Drizzle + SQLite.

## Что здесь

- `src/main.ts` — HTTP-сервер, WebSocket `/ws/device`, фоновые насосы.
- `src/app.ts` — сборка Hono, CORS/Origin, cookie-контекст и загрузка роутов.
- `src/routes/` — HTTP API (`/api/*`) и служебный `/health`.
- `src/server/` — HTTP-обвязка, сервисы, WebSocket-протокол и насосы.
- `src/db/` — схема и клиент SQLite.
- `src/media/` — приём, проверка, транскодирование и хранение файлов.
- `src/domain/` — чистые доменные правила без Next и HTTP.
- `scripts/` — миграции, сиды, резервные копии и сквозные проверки.
- `tests/` — unit- и интеграционные тесты на настоящей тестовой базе.

## Запуск

Из корня репозитория:

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm dev` поднимает API на `:4000` и веб на `:3000`.
Отдельно API запускается так:

```bash
pnpm --filter @shawty/api dev
```

Проверка:

```bash
pnpm --filter @shawty/api typecheck
pnpm --filter @shawty/api test
pnpm --filter @shawty/api check
```

Сквозные проверки требуют запущенного `pnpm dev`:

```bash
pnpm smoke:http
pnpm smoke:pairing
pnpm smoke:schedule
pnpm smoke:pages
pnpm smoke:pair-code
```

## Адреса

| Что | Адрес |
|---|---|
| HTTP API | `http://localhost:4000/api/*` |
| Health | `http://localhost:4000/health` |
| WebSocket устройств | `ws://localhost:4000/ws/device` |

Браузер обычно не обращается к `:4000` напрямую: веб проксирует `/api/*`
через Next rewrite, чтобы cookie сессии и CSRF оставались same-origin.
WebSocket плеера подключается к API напрямую.

## Данные и настройки

SQLite, медиа и секреты лежат в корне репозитория — `data/` (gitignored).
Путь вычисляется через `workspaceRoot()`, поэтому запуск из `apps/api`
и из корня работает одинаково.

Основные переменные:

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `PORT` | `4000` | Порт API |
| `PUBLIC_URL` | `http://localhost:3000` | Публичный адрес веба для QR и ссылок |
| `API_PUBLIC_URL` | `http://localhost:4000` | Публичный адрес API для WS |
| `SERVER_SECRET` | `data/.secret` | HMAC для кодов привязки и секретов устройств |
| `DATABASE_URL` | `data/shawty.db` | Путь к SQLite |

Полный список — в `src/config/server.ts`.

## Связь с вебом

API не импортирует код `apps/web`. Общие DTO, права и кадры WebSocket
приходят из `@shawty/contracts`. Веб получает данные только по HTTP;
серверные страницы передают cookie сессии в API.
