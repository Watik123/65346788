import type { CategoryRefDto, ShopRefDto } from './api'

/**
 * Порівняння цін того самого товару в різних магазинах. Працює вже з першого дня збору:
 * для нього не потрібна історія цін, лише сьогоднішні пропозиції.
 *
 * «Знижка на папері»: магазин показує закреслену ціну і знижку від PAPER_MIN_CLAIM %,
 * а інший магазин продає той самий товар за ту саму або нижчу ціну без жодної знижки.
 * Тобто закреслена ціна не відповідає ринку.
 */
export const PAPER_MIN_CLAIM = 10

export const COMPARE_SORTS = [
  { value: 'spread', label: 'Найбільша різниця цін' },
  { value: 'paper', label: 'Найбільша «знижка на папері»' },
  { value: 'shops', label: 'Найбільше магазинів' },
  { value: 'price', label: 'Спершу дешевші' },
] as const

export type CompareSort = (typeof COMPARE_SORTS)[number]['value']

/** Що потрібно знати про товар для порівняння; це підмножина сторінки товару */
export interface CompareSource {
  id: number
  name: string
  brand: string
  imageUrl: string | null
  rating: number | null
  reviewCount: number
  category: CategoryRefDto & { parent: CategoryRefDto | null }
  offers: { shop: ShopRefDto; price: number; inStock: boolean; oldPrice: number | null }[]
}

export interface ComparePriceDto {
  shop: ShopRefDto
  price: number
  /** Закреслена ціна магазину, якщо вона більша за поточну */
  oldPrice: number | null
}

export interface PaperDiscountDto {
  /** Магазин, що показує знижку */
  shop: ShopRefDto
  price: number
  oldPrice: number
  claimedPercent: number
  /** Магазин, що продає за ту саму або нижчу ціну без знижки */
  plainShop: ShopRefDto
  plainPrice: number
}

export interface CompareItemDto {
  id: number
  name: string
  brand: string
  imageUrl: string | null
  rating: number | null
  reviewCount: number
  category: CategoryRefDto & { parentSlug: string | null }
  /** Ціни в наявності, по одній на магазин, від найдешевшої */
  prices: ComparePriceDto[]
  minPrice: number
  maxPrice: number
  spreadAmount: number
  /** На скільки відсотків найдешевша ціна нижча за найдорожчу */
  spreadPercent: number
  paper: PaperDiscountDto | null
}

export interface CompareQueryParams {
  category?: string | undefined
  sort: CompareSort
  /** Лише товари зі «знижкою на папері» */
  paperOnly?: boolean | undefined
  page: number
  limit: number
}

export interface CompareResponse {
  items: CompareItemDto[]
  total: number
  page: number
  limit: number
  pages: number
  /** Підсумок по вибраній категорії (без урахування paperOnly) */
  summary: {
    products: number
    /** Ціна однакова в усіх магазинах */
    samePrice: number
    /** Є «знижка на папері» */
    paper: number
  }
}

const round1 = (x: number) => Math.round(x * 10) / 10
const byShopName = (a: { shop: ShopRefDto }, b: { shop: ShopRefDto }) => a.shop.name.localeCompare(b.shop.name, 'uk')

/** Товар у порівнянні або null, якщо він є в наявності менш ніж у двох магазинах */
export function toCompareItem(src: CompareSource): CompareItemDto | null {
  const prices: ComparePriceDto[] = src.offers
    .filter((o) => o.inStock && o.price > 0)
    .map((o) => ({ shop: { slug: o.shop.slug, name: o.shop.name }, price: o.price, oldPrice: o.oldPrice !== null && o.oldPrice > o.price ? o.oldPrice : null }))
    .sort((a, b) => a.price - b.price || byShopName(a, b))
  if (new Set(prices.map((p) => p.shop.slug)).size < 2) return null

  const minPrice = (prices[0] as ComparePriceDto).price
  const maxPrice = (prices[prices.length - 1] as ComparePriceDto).price

  let paper: PaperDiscountDto | null = null
  for (const p of prices) {
    if (p.oldPrice === null) continue
    const claimed = round1((1 - p.price / p.oldPrice) * 100)
    if (claimed < PAPER_MIN_CLAIM) continue
    // prices відсортовані від найдешевшої, тож перший підхожий — найдешевший «чесний» магазин
    const plain = prices.find((o) => o.shop.slug !== p.shop.slug && o.oldPrice === null && o.price <= p.price)
    if (!plain) continue
    if (!paper || claimed > paper.claimedPercent) {
      paper = { shop: p.shop, price: p.price, oldPrice: p.oldPrice, claimedPercent: claimed, plainShop: plain.shop, plainPrice: plain.price }
    }
  }

  return {
    id: src.id,
    name: src.name,
    brand: src.brand,
    imageUrl: src.imageUrl,
    rating: src.rating,
    reviewCount: src.reviewCount,
    category: { slug: src.category.slug, name: src.category.name, parentSlug: src.category.parent?.slug ?? null },
    prices,
    minPrice,
    maxPrice,
    spreadAmount: maxPrice - minPrice,
    spreadPercent: round1((1 - minPrice / maxPrice) * 100),
    paper,
  }
}

/** Фільтр, сортування й сторінки; однаково на сервері й у знімку */
export function queryCompare(all: CompareItemDto[], q: CompareQueryParams): CompareResponse {
  const inCategory = q.category === undefined ? all : all.filter((i) => i.category.slug === q.category || i.category.parentSlug === q.category)
  const items = q.paperOnly ? inCategory.filter((i) => i.paper !== null) : inCategory

  const cmp = (a: CompareItemDto, b: CompareItemDto): number => {
    switch (q.sort) {
      case 'spread':
        return b.spreadPercent - a.spreadPercent || b.prices.length - a.prices.length
      case 'paper':
        return (b.paper?.claimedPercent ?? -1) - (a.paper?.claimedPercent ?? -1) || b.spreadPercent - a.spreadPercent
      case 'shops':
        return b.prices.length - a.prices.length || b.spreadPercent - a.spreadPercent
      case 'price':
        return a.minPrice - b.minPrice
    }
  }
  const sorted = [...items].sort((a, b) => cmp(a, b) || a.id - b.id)
  const total = sorted.length
  const start = (q.page - 1) * q.limit
  return {
    items: sorted.slice(start, start + q.limit),
    total,
    page: q.page,
    limit: q.limit,
    pages: Math.max(1, Math.ceil(total / q.limit)),
    summary: {
      products: inCategory.length,
      samePrice: inCategory.filter((i) => i.spreadAmount === 0).length,
      paper: inCategory.filter((i) => i.paper !== null).length,
    },
  }
}
