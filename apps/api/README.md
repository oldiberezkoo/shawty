# apps/api

`API` · `HONO` · `WS` · `SQLITE`

Бэкенд SHAWTY: HTTP API, канал устройств и фоновые насосы. Отдаёт данные
и кадры протокола; внешний вид рисует веб.

---

## `[01]` Что здесь

`HTTP` · `WEBSOCKET` · `НАСОСЫ`

| `ПУТЬ` | `ЧТО ВНУТРИ` |
|---|---|
| `src/main.ts` | HTTP-сервер, WebSocket `/ws/device`, фоновые насосы |
| `src/app.ts` | Сборка Hono, CORS/Origin, cookie-контекст и загрузка роутов |
| `src/routes/` | HTTP API (`/api/*`) и служебный `/health` |
| `src/server/` | HTTP-обвязка, сервисы, WebSocket-протокол и насосы |
| `src/db/` | Схема и клиент SQLite |
| `src/media/` | Приём, проверка, транскодирование и хранение файлов |
| `src/domain/` | Чистые доменные правила без Next и HTTP |
| `scripts/` | Миграции, сиды, резервные копии и сквозные проверки |
| `tests/` | Unit- и интеграционные тесты на настоящей тестовой базе |

---

## `[02]` Запуск

`PNPM` · `:4000` · `TSX`

Из корня репозитория:

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm dev` поднимает API на `:4000` и веб на `:3000`. Отдельно API:

```bash
pnpm --filter @shawty/api dev
```

---

## `[03]` Проверки

`TYPES` · `TESTS` · `SMOKE`

| `КОМАНДА` | `ЧТО ПРОВЕРЯЕТ` |
|---|---|
| `pnpm --filter @shawty/api typecheck` | Типы API |
| `pnpm --filter @shawty/api test` | Unit- и интеграционные тесты |
| `pnpm --filter @shawty/api check` | Типы и тесты |
| `pnpm smoke:http` | Вход, сессия и данные дашборда |
| `pnpm smoke:pairing` | Привязка: HTTP + WebSocket + база |
| `pnpm smoke:schedule` | Кампании и расписание |
| `pnpm smoke:pages` | Страницы дашборда с живыми данными |
| `pnpm smoke:pair-code` | Привязка без сканирования QR |

Сквозные проверки требуют запущенного `pnpm dev`.

---

## `[04]` Адреса

`LOCAL` · `PROXY` · `WS`

| `ЧТО` | `АДРЕС` |
|---|---|
| HTTP API | `http://localhost:4000/api/*` |
| Health | `http://localhost:4000/health` |
| WebSocket устройств | `ws://localhost:4000/ws/device` |

Браузер обычно не обращается к `:4000` напрямую: веб проксирует `/api/*`
через Next rewrite, чтобы cookie сессии и CSRF оставались same-origin.
WebSocket плеера подключается к API напрямую.

---

## `[05]` Данные и настройки

`DATA/` · `ENV` · `WAL`

SQLite, медиа и секреты лежат в корне репозитория — `data/` (gitignored).
Путь вычисляется через `workspaceRoot()`, поэтому запуск из `apps/api`
и из корня работает одинаково.

| `ПЕРЕМЕННАЯ` | `ПО УМОЛЧАНИЮ` | `НАЗНАЧЕНИЕ` |
|---|---|---|
| `PORT` | `4000` | Порт API |
| `PUBLIC_URL` | `http://localhost:3000` | Публичный адрес веба для QR и ссылок |
| `API_PUBLIC_URL` | `http://localhost:4000` | Публичный адрес API для WS |
| `SERVER_SECRET` | `data/.secret` | HMAC для кодов привязки и секретов устройств |
| `DATABASE_URL` | `data/shawty.db` | Путь к SQLite |

Полный список — в `src/config/server.ts`.

---

## `[06]` Визуальная часть

`БЕЗ UI` · `ФАКТЫ` · `КОНТРАКТ`

API не отдаёт интерфейс и не хранит дизайн: ни шрифтов, ни иконок, ни цветов.
Экран плеера, панель и лендинг рисует `apps/web`; API поставляет данные и кадры
WebSocket из `@shawty/contracts`.

| `ПРАВИЛО` | `ПОЧЕМУ` |
|---|---|
| **Состояние — факт, а не оттенок** | API отдаёт `online`, `syncing`, `offline` и производные. Палитру, форму маркера и подпись выбирает веб: статус не должен зависеть от того, умеет ли клиент различать цвета. |
| **Те же имена, что в интерфейсе** | В выгрузках колонка называется `started_plays`, а не `views`: показ подтверждён, внимание — нет. |
| **Короткие и конкретные ошибки** | Сообщение должно читаться человеком без переписывания: «Нет доступа к экранам», а не `FORBIDDEN_403`. |
| **Публичная сводка отдельно** | `/api/public/network-stats` кэшируется на 15 секунд. Веб проксирует её через свой route, поэтому внутренний адрес API в браузер не попадает. |

Дизайн-система — в [`apps/web/README.md`](../web/README.md#дизайн-система) и
[`apps/web/design.md`](../web/design.md).

---

## `[07]` Связь с вебом

`CONTRACTS` · `COOKIE` · `ONE-WAY`

API не импортирует код `apps/web`. Общие DTO, права и кадры WebSocket
приходят из `@shawty/contracts`. Веб получает данные только по HTTP;
серверные страницы передают cookie сессии в API и не читают базу.

---

`SHAWTY` · `API` · `ДАННЫЕ БЕЗ ИНТЕРФЕЙСА`
