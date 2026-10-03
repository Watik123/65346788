import { SORT_OPTIONS, type FeedQueryParams, type SortKey, type SortOrder } from '@znyzhky/shared'

export const PAGE_SIZE = 12

/** Фільтри стрічки, як вони живуть у посиланні сторінки */
export interface FeedFilters {
  category?: string | undefined
  shops: string[]
  minDiscount?: number | undefined
  minPrice?: number | undefined
  maxPrice?: number | undefined
  minRating?: number | undefined
  sort: SortKey
  order?: SortOrder | undefined
  page: number
}

export const DEFAULT_FILTERS: FeedFilters = { shops: [], sort: 'score', page: 1 }

const sortKeys = new Set<string>(SORT_OPTIONS.map((o) => o.value))

function num(raw: string | null, opts: { int?: boolean; min: number; max: number }): number | undefined {
  if (raw === null || raw.trim() === '') return undefined
  const n = Number(raw)
  if (!Number.isFinite(n) || n < opts.min || n > opts.max) return undefined
  return opts.int ? Math.round(n) : n
}

/** Читає параметри з посилання. Некоректні значення мовчки відкидаються, сторінка не ламається. */
export function parseFeedSearch(sp: URLSearchParams): FeedFilters {
  const sort = sp.get('sort')
  const order = sp.get('order')
  const shops = (sp.get('shop') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return {
    category: sp.get('category') || undefined,
    shops: [...new Set(shops)],
    minDiscount: num(sp.get('minDiscount'), { min: 0, max: 100 }),
    minPrice: num(sp.get('minPrice'), { int: true, min: 0, max: 10_000_000 }),
    maxPrice: num(sp.get('maxPrice'), { int: true, min: 0, max: 10_000_000 }),
    minRating: num(sp.get('minRating'), { min: 0, max: 5 }),
    sort: sort && sortKeys.has(sort) ? (sort as SortKey) : 'score',
    order: order === 'asc' || order === 'desc' ? order : undefined,
    page: num(sp.get('page'), { int: true, min: 1, max: 10_000 }) ?? 1,
  }
}

/** Записує фільтри в посилання, пропускаючи значення за замовчуванням */
export function toSearchParams(f: FeedFilters): URLSearchParams {
  const sp = new URLSearchParams()
  if (f.category) sp.set('category', f.category)
  if (f.shops.length) sp.set('shop', f.shops.join(','))
  if (f.minDiscount) sp.set('minDiscount', String(f.minDiscount))
  if (f.minPrice !== undefined) sp.set('minPrice', String(f.minPrice))
  if (f.maxPrice !== undefined) sp.set('maxPrice', String(f.maxPrice))
  if (f.minRating) sp.set('minRating', String(f.minRating))
  if (f.sort !== 'score') sp.set('sort', f.sort)
  if (f.order) sp.set('order', f.order)
  if (f.page > 1) sp.set('page', String(f.page))
  return sp
}

export function toApiParams(f: FeedFilters): FeedQueryParams {
  const swap = f.minPrice !== undefined && f.maxPrice !== undefined && f.minPrice > f.maxPrice
  return {
    category: f.category,
    shop: f.shops.length ? f.shops : undefined,
    minDiscount: f.minDiscount,
    minPrice: swap ? f.maxPrice : f.minPrice,
    maxPrice: swap ? f.minPrice : f.maxPrice,
    minRating: f.minRating,
    sort: f.sort,
    order: f.order,
    page: f.page,
    limit: PAGE_SIZE,
  }
}

/** Скільки фільтрів увімкнено (сортування й сторінка не рахуються) */
export function activeFilterCount(f: FeedFilters): number {
  return (
    (f.category ? 1 : 0) +
    f.shops.length +
    (f.minDiscount ? 1 : 0) +
    (f.minPrice !== undefined || f.maxPrice !== undefined ? 1 : 0) +
    (f.minRating ? 1 : 0)
  )
}
