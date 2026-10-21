<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Monorepo layout

- `apps/web` — Next.js. Документация Next: `apps/web/node_modules/next/dist/docs/`.
- `apps/api` — Hono + ws + Drizzle + SQLite; HTTP и WebSocket на `:4000`.
- `packages/contracts` — общие схемы, DTO и кадры WS; единственный импорт между приложениями.
- `data/` — SQLite, медиа и секреты в корне (gitignored).
- `apps/web` — Next.js на `:3000`, без доступа к базе и сервисам API.
- Команды запускать из корня: `pnpm dev` (оба приложения), `pnpm check`, `pnpm test`.
