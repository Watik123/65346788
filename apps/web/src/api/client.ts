import {
  decodeProduct,
  productBucket,
  staticCompare,
  staticFeed,
  type CompactProduct,
  type CompareQueryParams,
  type CompareResponse,
  type FeedQueryParams,
  type FeedResponse,
  type FiltersResponse,
  type ProductDetailResponse,
  type RejectedResponse,
  type StaticIndex,
} from '@znyzhky/shared'

/**
 * Збірка для сайту без сервера (npm run site:build): дані лежать файлами поруч зі сторінкою
 * (data/index.json і data/p/<кошик>.json), сайт їх довантажує. Звичайна збірка ходить в API.
 */
export const isStaticMode = import.meta.env.VITE_STATIC === '1'

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    let message = 'Не вдалося завантажити дані'
    try {
      message = ((await res.json()) as { error?: { message?: string } }).error?.message ?? message
    } catch {
      // тіло не JSON: лишаємо загальне повідомлення
    }
    throw new ApiRequestError(res.status, message)
  }
  return (await res.json()) as T
}

function feedPath(q: FeedQueryParams): string {
  const sp = new URLSearchParams()
  if (q.category) sp.set('category', q.category)
  if (q.shop?.length) sp.set('shop', q.shop.join(','))
  if (q.minDiscount !== undefined) sp.set('minDiscount', String(q.minDiscount))
  if (q.minPrice !== undefined) sp.set('minPrice', String(q.minPrice))
  if (q.maxPrice !== undefined) sp.set('maxPrice', String(q.maxPrice))
  if (q.minRating !== undefined) sp.set('minRating', String(q.minRating))
  sp.set('sort', q.sort)
  if (q.order) sp.set('order', q.order)
  sp.set('page', String(q.page))
  sp.set('limit', String(q.limit))
  return `/api/feed?${sp}`
}

/** Файл завантажуємо один раз; після помилки наступна спроба завантажить його знову */
const cache = new Map<string, Promise<unknown>>()
function loadOnce<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined
  if (!p) {
    p = getJson<T>(path)
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return p
}
const loadIndex = () => loadOnce<StaticIndex>('data/index.json')

export const api = {
  feed: async (q: FeedQueryParams): Promise<FeedResponse> => (isStaticMode ? staticFeed(await loadIndex(), q) : getJson(feedPath(q))),

  filters: async (): Promise<FiltersResponse> => (isStaticMode ? (await loadIndex()).filters : getJson('/api/filters')),

  compare: async (q: CompareQueryParams): Promise<CompareResponse> => {
    if (isStaticMode) return staticCompare(await loadIndex(), q)
    const sp = new URLSearchParams()
    if (q.category) sp.set('category', q.category)
    sp.set('sort', q.sort)
    if (q.paperOnly) sp.set('paper', '1')
    sp.set('page', String(q.page))
    sp.set('limit', String(q.limit))
    return getJson(`/api/compare?${sp}`)
  },

  rejected: async (): Promise<RejectedResponse> => (isStaticMode ? (await loadIndex()).rejected : getJson('/api/rejected?limit=60')),

  product: async (id: number): Promise<ProductDetailResponse> => {
    if (isStaticMode) {
      const bucket = await loadOnce<Record<string, CompactProduct>>(`data/p/${productBucket(id)}.json`)
      const p = bucket[String(id)]
      if (!p) throw new ApiRequestError(404, 'Товар не знайдено')
      return decodeProduct(p)
    }
    return getJson(`/api/products/${id}`)
  },
}
