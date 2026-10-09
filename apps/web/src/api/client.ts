import {
  snapshotCompare,
  snapshotFeed,
  snapshotProduct,
  type CompareQueryParams,
  type CompareResponse,
  type FeedQueryParams,
  type FeedResponse,
  type FiltersResponse,
  type ProductDetailResponse,
  type RejectedResponse,
} from '@znyzhky/shared'
import snapshot from '@snapshot'

/** Якщо у збірку вбудований знімок, сайт працює без сервера */
export const isSnapshotMode = snapshot !== null

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

export const api = {
  feed: async (q: FeedQueryParams): Promise<FeedResponse> => (snapshot ? snapshotFeed(snapshot, q) : getJson(feedPath(q))),

  filters: async (): Promise<FiltersResponse> => (snapshot ? snapshot.filters : getJson('/api/filters')),

  compare: async (q: CompareQueryParams): Promise<CompareResponse> => {
    if (snapshot) return snapshotCompare(snapshot, q)
    const sp = new URLSearchParams()
    if (q.category) sp.set('category', q.category)
    sp.set('sort', q.sort)
    if (q.paperOnly) sp.set('paper', '1')
    sp.set('page', String(q.page))
    sp.set('limit', String(q.limit))
    return getJson(`/api/compare?${sp}`)
  },

  rejected: async (): Promise<RejectedResponse> => (snapshot ? snapshot.rejected : getJson('/api/rejected?limit=60')),

  product: async (id: number): Promise<ProductDetailResponse> => {
    if (snapshot) {
      const p = snapshotProduct(snapshot, id)
      if (!p) throw new ApiRequestError(404, 'Товар не знайдено')
      return p
    }
    return getJson(`/api/products/${id}`)
  },
}
