import type { CompareItemDto, CompareQueryParams, CompareResponse } from './compare'
import { queryCompare, toCompareItem } from './compare'
import type { FeedItemDto, FeedQueryParams, FeedResponse, FiltersResponse, PricePointDto, ProductDetailResponse, RejectedResponse } from './api'
import { inStockShopSlugs, queryFeed, type Snapshot } from './snapshot'

/**
 * Сайт без сервера, що читає дані з окремих файлів поруч зі сторінкою:
 *  - data/index.json — фільтри, стрічка, відсіяні, порівняння цін (усе для списків);
 *  - data/p/<кошик>.json — сторінки товарів, розкладені по PRODUCT_BUCKETS файлах за id.
 * Так сторінка не росте з історією цін: сторінку товару браузер довантажує, коли її відкривають.
 * Логіка запитів та сама, що й на сервері (queryFeed, queryCompare); тест у apps/api це перевіряє.
 */
export const PRODUCT_BUCKETS = 64

export const productBucket = (id: number) => id % PRODUCT_BUCKETS

export interface StaticIndex {
  generatedAt: string
  filters: FiltersResponse
  feed: FeedItemDto[]
  /** id товару зі стрічки → магазини, де він у наявності (для фільтра за магазином) */
  feedShops: Record<string, string[]>
  rejected: RejectedResponse
  compare: CompareItemDto[]
}

/** Ціни по днях від start; null — того дня ціни не було */
export interface CompactSeries {
  start: string
  prices: (number | null)[]
}

/** Сторінка товару з історією цін у стислому вигляді (у 5–6 разів менше за масив об'єктів) */
export interface CompactProduct extends Omit<ProductDetailResponse, 'history'> {
  history: { market: CompactSeries | null; shops: { slug: string; name: string; series: CompactSeries }[] }
}

const DAY = 86_400_000
const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY)
const dayStr = (n: number) => new Date(n * DAY).toISOString().slice(0, 10)

function encodeSeries(points: PricePointDto[]): CompactSeries | null {
  if (points.length === 0) return null
  const first = dayNum((points[0] as PricePointDto).date)
  const last = dayNum((points[points.length - 1] as PricePointDto).date)
  const prices: (number | null)[] = Array.from({ length: last - first + 1 }, () => null)
  for (const p of points) prices[dayNum(p.date) - first] = p.price
  return { start: (points[0] as PricePointDto).date, prices }
}

function decodeSeries(s: CompactSeries | null): PricePointDto[] {
  if (!s) return []
  const first = dayNum(s.start)
  return s.prices.flatMap((price, i) => (price === null ? [] : [{ date: dayStr(first + i), price }]))
}

export function encodeProduct(p: ProductDetailResponse): CompactProduct {
  return {
    ...p,
    history: {
      market: encodeSeries(p.history.market),
      shops: p.history.shops.map((s) => ({ slug: s.slug, name: s.name, series: encodeSeries(s.points) as CompactSeries })),
    },
  }
}

export function decodeProduct(c: CompactProduct): ProductDetailResponse {
  return {
    ...c,
    history: {
      market: decodeSeries(c.history.market),
      shops: c.history.shops.map((s) => ({ slug: s.slug, name: s.name, points: decodeSeries(s.series) })),
    },
  }
}

/** Розкладає сторінки товарів по файлах-кошиках: номер кошика → { id: товар } */
export function splitProducts(products: ProductDetailResponse[]): Map<number, Record<string, CompactProduct>> {
  const out = new Map<number, Record<string, CompactProduct>>()
  for (const p of products) {
    const bucket = productBucket(p.id)
    const file = out.get(bucket) ?? {}
    file[String(p.id)] = encodeProduct(p)
    out.set(bucket, file)
  }
  return out
}

export function buildStaticIndex(snap: Snapshot): StaticIndex {
  const byId = new Map(snap.products.map((p) => [p.id, p]))
  const feedShops: Record<string, string[]> = {}
  for (const item of snap.feed) {
    const p = byId.get(item.id)
    feedShops[String(item.id)] = p ? inStockShopSlugs(p) : []
  }
  return {
    generatedAt: snap.generatedAt,
    filters: snap.filters,
    feed: snap.feed,
    feedShops,
    rejected: snap.rejected,
    compare: snap.products.map(toCompareItem).filter((i): i is CompareItemDto => i !== null),
  }
}

export const staticFeed = (index: StaticIndex, q: FeedQueryParams): FeedResponse =>
  queryFeed(index.feed, index.filters.categories, q, (id) => index.feedShops[String(id)] ?? [])

export const staticCompare = (index: StaticIndex, q: CompareQueryParams): CompareResponse => queryCompare(index.compare, q)
