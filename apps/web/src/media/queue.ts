/**
 * Очередь обработки файлов.
 *
 * ffmpeg тяжёлый: при параллельной загрузке десяти роликов процесс один
 * и без ограничения он встанет колом. Очередь ограничена по числу задач.
 *
 * Важное отличие от «просто Promise.all»: задачи переживают перезапуск
 * сервера. У прерванной задачи остаётся ассет в состоянии `processing`,
 * который должен быть освобождён — это делает `reapStaleAssets`, иначе
 * после перезапуска файл навсегда остался бы «в обработке».
 */

import { serverConfig } from '@/config/server'

export type JobState = 'queued' | 'running' | 'done' | 'failed'
export type JobStats = {
  queued: number
  running: number
  done: number
  failed: number
}

type JobRunner = () => Promise<void>

type Entry = {
  id: string
  state: JobState
  run: JobRunner
  resolve: () => void
  reject: (error: unknown) => void
}

class MediaQueue {
  private readonly entries = new Map<string, Entry>()
  private readonly waiting: string[] = []
  private running = 0

  constructor(private readonly concurrency: number) {}

  /**
   * Ставит задачу в очередь. Возвращает промис, который завершается вместе
   * с задачей: вызывающий может дождаться результата, а может и не ждать —
   * очередь всё равно её выполнит.
   */
  submit(id: string, run: JobRunner): Promise<void> {
    const existing = this.entries.get(id)
    if (existing) return Promise.reject(new Error(`задача ${id} уже в очереди`))

    return new Promise<void>((resolve, reject) => {
      this.entries.set(id, { id, state: 'queued', run, resolve, reject })
      this.waiting.push(id)
      this.pump()
    })
  }

  private pump(): void {
    while (this.running < this.concurrency && this.waiting.length > 0) {
      const id = this.waiting.shift()
      if (!id) return

      const entry = this.entries.get(id)
      if (!entry) continue

      entry.state = 'running'
      this.running += 1

      void entry
        .run()
        .then(() => {
          entry.state = 'done'
          entry.resolve()
        })
        .catch((error: unknown) => {
          entry.state = 'failed'
          entry.reject(error)
        })
        .finally(() => {
          // Запись удаляется с задержкой, чтобы вызывающий мог посмотреть
          // состояние задачи сразу после завершения.
          setTimeout(() => this.entries.delete(id), 60_000)
          this.running -= 1
          this.pump()
        })
    }
  }

  stateOf(id: string): JobState | null {
    return this.entries.get(id)?.state ?? null
  }

  stats(): JobStats {
    let queued = 0
    let running = 0
    let done = 0
    let failed = 0

    for (const entry of this.entries.values()) {
      if (entry.state === 'queued') queued += 1
      else if (entry.state === 'running') running += 1
      else if (entry.state === 'done') done += 1
      else if (entry.state === 'failed') failed += 1
    }

    return { queued, running, done, failed }
  }

  /** Живой ли ещё процесс: после перезапуска очередь пуста. */
  isIdle(): boolean {
    return this.running === 0 && this.waiting.length === 0
  }
}

let instance: MediaQueue | null = null

export function getMediaQueue(): MediaQueue {
  instance ??= new MediaQueue(Math.max(1, serverConfig.media.transcodeConcurrency))
  return instance
}
