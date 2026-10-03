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

export function snapshotFeed(snap: Snapshot, q: FeedQueryParams): FeedResponse {
  let items = snap.feed

  if (q.category !== undefined) {
    const slugs = categoryTreeSlugs(snap.filters.categories, q.category)
    items = items.filter((i) => slugs?.has(i.category.slug) ?? false)
  }
  if (q.shop !== undefined) {
    const wanted = new Set(q.shop)
    const byId = new Map(snap.products.map((p) => [p.id, p]))
    items = items.filter((i) => byId.get(i.id)?.offers.some((o) => o.inStock && wanted.has(o.shop.slug)) ?? false)
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

export function snapshotProduct(snap: Snapshot, id: number): ProductDetailResponse | null {
  return snap.products.find((p) => p.id === id) ?? null
}
