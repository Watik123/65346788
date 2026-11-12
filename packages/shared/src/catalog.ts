import type { CategoryRefDto } from './api'
import type { DealStatus } from './deal'

/**
 * Каталог: усі товари, а не лише ті, що зі знижкою. Пошук за назвою, категорії, сортування.
 * Логіка спільна для сервера й сайту без сервера (як queryFeed і queryCompare).
 */
export const CATALOG_SORTS = [
  { value: 'popular', label: 'Спершу в багатьох магазинах' },
  { value: 'price_asc', label: 'Спершу дешевші' },
  { value: 'price_desc', label: 'Спершу дорожчі' },
  { value: 'discount', label: 'Найбільша знижка' },
  { value: 'drop', label: 'Подешевшали за добу' },
] as const

export type CatalogSort = (typeof CATALOG_SORTS)[number]['value']

export interface CatalogItemDto {
  id: number
  name: string
  brand: string
  imageUrl: string | null
  category: CategoryRefDto & { parentSlug: string | null }
  /** Найкраща ціна серед магазинів, де товар є; null — зараз ніде немає */
  bestPrice: number | null
  /** У скількох магазинах товар зараз у наявності */
  shopsCount: number
  status: DealStatus | null
  /** Знижка від типової ціни, %; має сенс лише для status = 'real' */
  discountPercent: number
  /**
   * На скільки відсотків найкраща ціна змінилась порівняно з попередньою добою: від'ємне — подешевшав.
   * 0, якщо ціна та сама або попередньої доби немає
   */
  dayChangePercent: number
}

export interface CatalogQueryParams {
  category?: string | undefined
  /** Пошук за назвою і брендом: усі слова запиту мають бути в назві */
  q?: string | undefined
  sort: CatalogSort
  page: number
  limit: number
}

export interface CatalogResponse {
  items: CatalogItemDto[]
  total: number
  page: number
  limit: number
  pages: number
}

/** Що потрібно знати про товар для каталогу; це підмножина сторінки товару */
export interface CatalogSource {
  id: number
  name: string
  brand: string
  imageUrl: string | null
  category: CategoryRefDto & { parent: CategoryRefDto | null }
  deal: { status: DealStatus; bestPrice: number; shopsCount: number; discountPercent: number; bestShop?: { slug: string } } | null
  /** Ціни по добах (як на графіку товару) і остання доба з даними: для зміни за добу */
  history?: { market: { date: string; price: number }[]; shops?: { slug: string; points: { date: string; price: number }[] }[] } | undefined
  dataDay?: string | null | undefined
}

/**
 * Зміна найкращої ціни за останню добу, %: лише якщо є ціна і за останню добу з даними, і за попередню.
 * bestShopPoints — ціни магазину, що дає найкращу ціну: якщо вчора він товар не продавав, то це не
 * «подешевшав», а повернувся дешевший продавець, і зміни не показуємо.
 */
export function dayChange(market: { date: string; price: number }[] | undefined, dataDay: string | null | undefined, bestShopPoints?: { date: string; price: number }[]): number {
  if (!market || market.length < 2 || !dataDay) return 0
  const last = market[market.length - 1] as { date: string; price: number }
  const prev = market[market.length - 2] as { date: string; price: number }
  const dayBefore = new Date(Date.parse(`${dataDay}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  if (last.date !== dataDay || prev.date !== dayBefore || prev.price <= 0) return 0
  if (bestShopPoints && !bestShopPoints.some((p) => p.date === dayBefore)) return 0
  return Math.round((last.price / prev.price - 1) * 1000) / 10
}

export function toCatalogItem(p: CatalogSource): CatalogItemDto {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    imageUrl: p.imageUrl,
    category: { slug: p.category.slug, name: p.category.name, parentSlug: p.category.parent?.slug ?? null },
    bestPrice: p.deal?.bestPrice ?? null,
    shopsCount: p.deal?.shopsCount ?? 0,
    status: p.deal?.status ?? null,
    discountPercent: p.deal?.status === 'real' ? p.deal.discountPercent : 0,
    dayChangePercent: p.deal ? dayChange(p.history?.market, p.dataDay, p.history?.shops?.find((s) => s.slug === p.deal?.bestShop?.slug)?.points) : 0,
  }
}

/** Для пошуку: нижній регістр, без розділових знаків; «ё», апострофи й подібне не заважають */
export function searchKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’'`ʼ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Фільтр, пошук, сортування й сторінки каталогу */
export function queryCatalog(all: CatalogItemDto[], q: CatalogQueryParams): CatalogResponse {
  let items = q.category === undefined ? all : all.filter((i) => i.category.slug === q.category || i.category.parentSlug === q.category)
  const words = searchKey(q.q ?? '').split(' ').filter(Boolean)
  if (words.length > 0) {
    items = items.filter((i) => {
      const hay = searchKey(`${i.brand} ${i.name}`)
      return words.every((w) => hay.includes(w))
    })
  }

  // Товари, яких зараз ніде немає, завжди наприкінці
  const stock = (i: CatalogItemDto) => (i.bestPrice === null ? 1 : 0)
  const cmp = (a: CatalogItemDto, b: CatalogItemDto): number => {
    switch (q.sort) {
      case 'popular':
        return b.shopsCount - a.shopsCount || b.discountPercent - a.discountPercent
      case 'price_asc':
        return (a.bestPrice ?? 0) - (b.bestPrice ?? 0)
      case 'price_desc':
        return (b.bestPrice ?? 0) - (a.bestPrice ?? 0)
      case 'discount':
        return b.discountPercent - a.discountPercent || b.shopsCount - a.shopsCount
      case 'drop':
        return a.dayChangePercent - b.dayChangePercent || b.shopsCount - a.shopsCount
    }
  }
  const sorted = [...items].sort((a, b) => stock(a) - stock(b) || cmp(a, b) || a.id - b.id)
  const total = sorted.length
  const start = (q.page - 1) * q.limit
  return { items: sorted.slice(start, start + q.limit), total, page: q.page, limit: q.limit, pages: Math.max(1, Math.ceil(total / q.limit)) }
}

/**
 * Каталог у стислому вигляді для сайту без сервера: один файл без фото (data/catalog.json),
 * фото окремо по категоріях (data/img/<категорія>.json), бо потрібні лише для видимої сторінки.
 */
export interface CompactCatalog {
  categories: { slug: string; name: string; parentSlug: string | null }[]
  /** [id, назва, бренд, № категорії, ціна (0 — немає), магазинів, статус, знижка %, зміна за добу %] */
  rows: [number, string, string, number, number, number, number, number, number][]
}

const STATUS_CODES: (DealStatus | null)[] = [null, 'real', 'fake', 'insufficient_data', 'none']

export function encodeCatalog(items: CatalogItemDto[]): { catalog: CompactCatalog; images: Map<string, Record<string, string>> } {
  const categories: CompactCatalog['categories'] = []
  const index = new Map<string, number>()
  const images = new Map<string, Record<string, string>>()
  const rows: CompactCatalog['rows'] = items.map((i) => {
    let c = index.get(i.category.slug)
    if (c === undefined) {
      c = categories.push({ slug: i.category.slug, name: i.category.name, parentSlug: i.category.parentSlug }) - 1
      index.set(i.category.slug, c)
    }
    if (i.imageUrl) {
      const file = images.get(i.category.slug) ?? {}
      file[String(i.id)] = i.imageUrl
      images.set(i.category.slug, file)
    }
    return [i.id, i.name, i.brand, c, i.bestPrice ?? 0, i.shopsCount, STATUS_CODES.indexOf(i.status), i.discountPercent, i.dayChangePercent]
  })
  return { catalog: { categories, rows }, images }
}

export function decodeCatalog(c: CompactCatalog): CatalogItemDto[] {
  return c.rows.map(([id, name, brand, cat, price, shops, status, discount, change]) => ({
    id,
    name,
    brand,
    imageUrl: null,
    category: c.categories[cat] as CompactCatalog['categories'][number],
    bestPrice: price > 0 ? price : null,
    shopsCount: shops,
    status: STATUS_CODES[status] ?? null,
    discountPercent: discount,
    dayChangePercent: change ?? 0,
  }))
}
