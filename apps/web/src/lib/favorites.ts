import { useCallback, useSyncExternalStore } from 'react'

/**
 * Обране: товари, які людина позначила, щоб стежити за ціною. Зберігається лише в її браузері
 * (облікових записів на сайті немає): номер товару, ціна на момент додавання і дата.
 */
export interface Favorite {
  /** Найкраща ціна, коли товар додали; null — його тоді ніде не було */
  price: number | null
  /** Доба додавання, «РРРР-ММ-ДД» */
  at: string
}

type Store = Record<string, Favorite>

const KEY = 'favorites'
const listeners = new Set<() => void>()
let cache: Store | null = null

function read(): Store {
  if (cache) return cache
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    cache = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Store) : {}
  } catch {
    // сховище недоступне або зіпсоване: обране працюватиме до закриття сторінки
    cache = {}
  }
  return cache
}

function write(next: Store): void {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // сховище недоступне: лишається в пам'яті
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  // Зміни з іншої вкладки
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return
    cache = null
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useFavorites(): { items: Store; ids: number[]; has: (id: number) => boolean; toggle: (id: number, price: number | null) => void } {
  const items = useSyncExternalStore(subscribe, read, read)
  const toggle = useCallback((id: number, price: number | null) => {
    const cur = read()
    const key = String(id)
    if (cur[key]) {
      const { [key]: _removed, ...rest } = cur
      write(rest)
    } else {
      write({ ...cur, [key]: { price, at: new Date().toISOString().slice(0, 10) } })
    }
  }, [])
  return { items, ids: Object.keys(items).map(Number), has: (id) => String(id) in items, toggle }
}

/** Лише для тестів: забути збережене */
export function resetFavoritesForTests(): void {
  cache = null
}
