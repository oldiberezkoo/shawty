import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { dataPath } from '@/config/paths'

const MEDIA_ROOT = dataPath('media')

/**
 * Хранилище файлов, адресуемое по содержимому.
 *
 * Путь выводится из sha256, поэтому одинаковое содержимое физически хранится
 * один раз независимо от имён и компаний. Это делает дедупликацию бесплатной
 * и переживает переименование файла.
 *
 * За интерфейсом стоит намеренно простая файловая система: переезд на S3
 * затронет только этот файл.
 */

/**
 * Двухуровневое разбиение по первым четырём символам хеша: в каталоге
 * оказываются десятки тысяч файлов вместо миллионов в одной папке. На NTFS
 * и ext4 разница в скорости листинга заметна уже после ~50 тыс. файлов.
 */
export function blobPath(sha256: string, extension: string): string {
  const folder = sha256.slice(0, 2)
  const subfolder = sha256.slice(2, 4)
  return join(/* turbopackIgnore: true */ MEDIA_ROOT, folder, subfolder, `${sha256}.${extension}`)
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
}

/**
 * Хеш и размер файла без чтения в память.
 *
 * Обязательно: ролик на 500 МБ, прочитанный целиком в буфер, упирается
 * в кучу процесса, который у нас один на всю систему.
 */
export async function hashAndSize(path: string): Promise<{ sha256: string; bytes: number }> {
  const hash = createHash('sha256')
  let bytes = 0

  for await (const chunk of createReadStream(path)) {
    const buffer = chunk as Buffer
    bytes += buffer.length
    hash.update(buffer)
  }

  return { sha256: hash.digest('hex'), bytes }
}

export async function fileSize(path: string): Promise<number> {
  return (await stat(path)).size
}

/**
 * Приём загруженного потока во временный файл.
 *
 * Пишем сразу на диск, а не собираем в памяти: поток может идти с телефона
 * или с ТВ по сети, и буферизовать сотни мегабайт в процессе нельзя.
 */
export async function receiveToTempFile(source: Readable, tempRoot: string): Promise<string> {
  await mkdir(tempRoot, { recursive: true })
  const temporary = join(tempRoot, `upload-${Date.now()}-${Math.floor(Math.random() * 1e9)}.part`)

  await pipeline(source, createWriteStream(temporary))
  return temporary
}

/**
 * Проверка сигнатуры без чтения целиком.
 *
 * Достаточно первых 64 КБ: все поддерживаемые сигнатуры находятся в начале.
 */
export async function readHead(path: string, length = 64 * 1024): Promise<Uint8Array> {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

/**
 * Атомарное перемещение в хранилище.
 *
 * Файл сначала появляется под временным именем и только потом занимает
 * окончательное: иначе прерванная обработка оставила бы «половинчатый»
 * файл, который плеер потом отдаст как рабочий.
 */
export async function commitBlob(sourcePath: string, sha256: string, extension: string): Promise<string> {
  const target = blobPath(sha256, extension)
  await ensureDir(target)

  const temporary = `${target}.${process.pid}.${Date.now()}.part`

  try {
    await rename(sourcePath, temporary)
  } catch {
    // rename между разными томами не работает: копируем явно.
    await copyFile(sourcePath, temporary)
  }

  try {
    await rename(temporary, target)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }

  return target
}

async function copyFile(from: string, to: string): Promise<void> {
  const { copyFile } = await import('node:fs/promises')
  await copyFile(from, to)
}

export async function blobExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export function openBlob(path: string) {
  return createReadStream(path)
}

/**
 * Поток с поддержкой Range.
 *
 * Без Range телевизор не сможет перематывать видео и корректно продолжит
 * проигрывание после паузы: многие медиаплееры требуют ответ 206.
 */
export function openBlobRange(path: string, range: { start: number; end: number } | null) {
  if (!range) return createReadStream(path)
  return createReadStream(path, { start: range.start, end: range.end })
}

export async function removeBlob(path: string): Promise<void> {
  await rm(path, { force: true })
}

/**
 * Удаляет счётчик использования файла на диске.
 *
 * Возвращает освобождённые байты: вызывающий пересчитывает квоту по факту,
 * а не по заявленному размеру ассета, потому что после транскодирования
 * размер меняется.
 */
export async function removeBlobAndReport(path: string): Promise<number> {
  let size = 0
  try {
    size = (await stat(path)).size
  } catch {
    return 0
  }
  await rm(path, { force: true })
  return size
}

export async function mediaRootSize(): Promise<number> {
  let total = 0

  async function walk(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
        continue
      }
      try {
        total += (await stat(full)).size
      } catch {
        // Файл мог исчезнуть между чтением каталога и запросом размера.
      }
    }
  }

  await walk(MEDIA_ROOT)
  return total
}
