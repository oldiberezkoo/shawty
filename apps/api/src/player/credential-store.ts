'use client'

import { randomBase64Url } from '@/lib/crypto-client'

/**
 * Хранилище учётных данных устройства.
 *
 * Требование продукта — «подключил телевизор и забыл на год». Значит данные
 * обязаны переживать перезагрузку страницы, рестарт браузера и обесточивание.
 *
 * Выбран IndexedDB, а не localStorage: localStorage на части телевизоров
 * очищается агрессивнее и делит квоту со всем остальным. Если IndexedDB
 * недоступен, откатываемся на localStorage и помечаем хранилище как ненадёжное,
 * чтобы экран предупредил: очистка данных потребует повторной привязки.
 */

const DB_NAME = 'shawty-player'
const DB_VERSION = 1
const STORE = 'credential'
const LOCAL_KEY = 'shawty:device-credential'

export type DeviceCredential = {
  deviceId: string
  deviceSecret: string
  credentialVersion: number
  screenId: string
  companyId: string
  issuedAt: string
}

export type StorageKind = 'indexeddb' | 'localstorage' | 'none'

let dbPromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB недоступна'))
    request.onblocked = () => reject(new Error('IndexedDB заблокирована другой вкладкой'))
  })

  return dbPromise
}

function idbTransaction(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const request = action(tx.objectStore(STORE))

        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('Ошибка IndexedDB'))

        tx.onabort = () => reject(tx.error ?? new Error('Транзакция прервана'))
      }),
  )
}

function readLocal(): DeviceCredential | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? (JSON.parse(raw) as DeviceCredential) : null
  } catch {
    return null
  }
}

export async function saveCredential(credential: DeviceCredential): Promise<StorageKind> {
  try {
    await idbTransaction('readwrite', (store) => store.put(credential, 'device'))
    return 'indexeddb'
  } catch {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(credential))
      return 'localstorage'
    } catch {
      return 'none'
    }
  }
}

export async function loadCredential(): Promise<{ credential: DeviceCredential | null; storage: StorageKind }> {
  try {
    const value = await idbTransaction('readonly', (store) => store.get('device'))
    if (value) {
      return { credential: value as DeviceCredential, storage: 'indexeddb' }
    }
  } catch {
    // Падаем на резервное хранилище.
  }

  const fallback = readLocal()
  return { credential: fallback, storage: fallback ? 'localstorage' : 'none' }
}

export async function clearCredential(): Promise<void> {
  try {
    await idbTransaction('readwrite', (store) => store.delete('device'))
  } catch {
    // Не критично: ниже чистим резервное хранилище в любом случае.
  }

  try {
    localStorage.removeItem(LOCAL_KEY)
  } catch {
    // Игнорируем: хранилища может не быть вовсе.
  }
}

/**
 * Локальный nonce привязки: 256 бит, которые телевизор не показывает никому.
 * Хранятся рядом с учётными данными, потому что нужны только на этапе привязки.
 */
export function newDeviceNonce(): string {
  return randomBase64Url(32)
}

let nonceMemory: string | null = null

const NONCE_KEY = 'shawty:pairing-nonce'

export async function getDeviceNonce(): Promise<string> {
  if (nonceMemory) return nonceMemory

  try {
    const stored = sessionStorage.getItem(NONCE_KEY)
    if (stored) {
      nonceMemory = stored
      return stored
    }
  } catch {
    // sessionStorage может быть недоступен.
  }

  const generated = newDeviceNonce()
  nonceMemory = generated

  try {
    sessionStorage.setItem(NONCE_KEY, generated)
  } catch {
    // Держим в памяти: этого хватает на время открытой сессии привязки.
  }

  return generated
}

export function forgetDeviceNonce(): void {
  nonceMemory = null
  try {
    sessionStorage.removeItem(NONCE_KEY)
  } catch {
    // Игнорируем.
  }
}
