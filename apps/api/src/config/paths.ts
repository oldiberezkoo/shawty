import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * Корень pnpm-workspace.
 *
 * Приложение запускается из своего каталога (`apps/web`, позже `apps/api`),
 * но данные — база, медиа, секрет — принадлежат всему проекту и лежат в
 * корневом `data/`. Поэтому путь ищется вверх по дереву до `pnpm-workspace.yaml`,
 * а не берётся от текущего каталога процесса: иначе `pnpm --filter ... dev`
 * создал бы вторую базу внутри приложения.
 */
export function workspaceRoot(start: string = process.cwd()): string {
  let dir = resolve(/* turbopackIgnore: true */ start)

  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir

    const parent = dirname(dir)
    if (parent === dir) return resolve(/* turbopackIgnore: true */ start)
    dir = parent
  }
}

/** Путь внутри корневого `data/`. */
export function dataPath(...segments: string[]): string {
  return join(workspaceRoot(), 'data', ...segments)
}
