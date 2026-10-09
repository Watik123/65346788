import type {
  FeedItemDto,
  FeedQueryParams,
  FeedResponse,
  FiltersResponse,
  ProductDetailResponse,
  RejectedResponse,
  CategoryNodeDto,
} from './api'
import { SORT_OPTIONS } from './api'
import { queryCompare, toCompareItem, type CompareItemDto, type CompareQueryParams, type CompareResponse } from './compare'

/**
 * Знімок усіх даних, який сайт може показати без сервера. Логіка нижче повторює
 * запити API до бази; тест у apps/api порівнює обидві реалізації на тих самих параметрах.
 */
export interface Snapshot {
  generatedAt: string
  filters: FiltersResponse
  /** Усі справжні знижки, від найвищого скору */
  feed: FeedItemDto[]
  rejected: RejectedResponse
  products: ProductDetailResponse[]
}

function categoryTreeSlugs(nodes: CategoryNodeDto[], slug: string): Set<string> | null {
  for (const node of nodes) {
    if (node.slug === slug) {
      const out = new Set<string>()
      const walk = (n: CategoryNodeDto) => {
        out.add(n.slug)
        n.children.forEach(walk)
      }
      walk(node)
      return out
    }
    const inner = categoryTreeSlugs(node.children, slug)
    if (inner) return inner
  }
  return null
}

/**
 * Фільтри, сортування й сторінки стрічки поверх готового списку знижок. inStockShops каже,
 * в яких магазинах товар зараз у наявності (для фільтра за магазином).
 */
export function queryFeed(feed: FeedItemDto[], categories: CategoryNodeDto[], q: FeedQueryParams, inStockShops: (id: number) => readonly string[]): FeedResponse {
  let items = feed

  if (q.category !== undefined) {
    const slugs = categoryTreeSlugs(categories, q.category)
    items = items.filter((i) => slugs?.has(i.category.slug) ?? false)
  }
  if (q.shop !== undefined) {
    const wanted = new Set(q.shop)
    items = items.filter((i) => inStockShops(i.id).some((s) => wanted.has(s)))
  }
  if (q.minDiscount !== undefined) items = items.filter((i) => i.discountPercent >= (q.minDiscount as number))
  if (q.minPrice !== undefined) items = items.filter((i) => i.bestPrice >= (q.minPrice as number))
  if (q.maxPrice !== undefined) items = items.filter((i) => i.bestPrice <= (q.maxPrice as number))
  if (q.minRating !== undefined) items = items.filter((i) => i.rating !== null && i.rating >= (q.minRating as number))

  const defaultOrder = SORT_OPTIONS.find((o) => o.value === q.sort)?.defaultOrder ?? 'desc'
  const sign = (q.order ?? defaultOrder) === 'asc' ? 1 : -1
  const byKey = (a: FeedItemDto, b: FeedItemDto): number => {
    switch (q.sort) {
      case 'discount':
        return sign * (a.discountPercent - b.discountPercent) || b.score - a.score
      case 'price':
        return sign * (a.bestPrice - b.bestPrice)
      case 'popularity':
        return sign * (a.shopsCount - b.shopsCount) || b.score - a.score
      case 'score':
        return sign * (a.score - b.score)
    }
  }
  const sorted = [...items].sort((a, b) => byKey(a, b) || a.id - b.id)

  const total = sorted.length
  const start = (q.page - 1) * q.limit
  return {
    items: sorted.slice(start, start + q.limit),
    total,
    page: q.page,
    limit: q.limit,
    pages: Math.max(1, Math.ceil(total / q.limit)),
  }
}

/** Магазини, де товар зараз у наявності */
export const inStockShopSlugs = (p: ProductDetailResponse): string[] => p.offers.filter((o) => o.inStock).map((o) => o.shop.slug)

export function snapshotFeed(snap: Snapshot, q: FeedQueryParams): FeedResponse {
  const byId = new Map(snap.products.map((p) => [p.id, p]))
  return queryFeed(snap.feed, snap.filters.categories, q, (id) => {
    const p = byId.get(id)
    return p ? inStockShopSlugs(p) : []
  })
}

export function snapshotProduct(snap: Snapshot, id: number): ProductDetailResponse | null {
  return snap.products.find((p) => p.id === id) ?? null
}

const compareCache = new WeakMap<Snapshot, CompareItemDto[]>()

/** Порівняння цін зі знімка: ті самі правила, що й на сервері (див. compare.ts) */
export function snapshotCompare(snap: Snapshot, q: CompareQueryParams): CompareResponse {
  let items = compareCache.get(snap)
  if (!items) {
    items = snap.products.map(toCompareItem).filter((i): i is CompareItemDto => i !== null)
    compareCache.set(snap, items)
  }
  return queryCompare(items, q)
}
