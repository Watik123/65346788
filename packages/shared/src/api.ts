import type { DealStatus, Reason } from './deal'

/** Типи відповідей API. Дати передаються рядками: «РРРР-ММ-ДД» для діб, ISO для моментів. */

export const SORT_OPTIONS = [
  { value: 'score', label: 'За скором', defaultOrder: 'desc' },
  { value: 'discount', label: 'За розміром знижки', defaultOrder: 'desc' },
  { value: 'price', label: 'За ціною', defaultOrder: 'asc' },
  { value: 'popularity', label: 'За популярністю', defaultOrder: 'desc' },
] as const

export type SortKey = (typeof SORT_OPTIONS)[number]['value']
export type SortOrder = 'asc' | 'desc'

/** Скільки значень у міні-графіку на картці стрічки (діб) */
export const SPARKLINE_DAYS = 30
/** Скільки діб історії віддає сторінка товару */
export const HISTORY_DAYS = 90

export interface ShopRefDto {
  slug: string
  name: string
}

export interface CategoryRefDto {
  slug: string
  name: string
}

/** Розібрані параметри стрічки; їх приймає і сервер, і режим «знімка» на сайті */
export interface FeedQueryParams {
  category?: string | undefined
  shop?: string[] | undefined
  minDiscount?: number | undefined
  minPrice?: number | undefined
  maxPrice?: number | undefined
  minRating?: number | undefined
  sort: SortKey
  order?: SortOrder | undefined
  page: number
  limit: number
}

export interface FeedItemDto {
  id: number
  name: string
  brand: string
  imageUrl: string | null
  category: CategoryRefDto
  bestPrice: number
  bestShop: ShopRefDto
  /** Типова ціна ринку, з якою порівнювали */
  basePrice: number
  discountPercent: number
  discountAmount: number
  rating: number | null
  reviewCount: number
  shopsCount: number
  score: number
  /** Найкраща ціна ринку за останні SPARKLINE_DAYS діб, від старих до нових */
  sparkline: number[]
}

/** Знижка, яку магазин показує, але ми не підтвердили */
export interface RejectedItemDto {
  id: number
  name: string
  brand: string
  category: CategoryRefDto
  bestPrice: number
  bestShop: ShopRefDto
  basePrice: number | null
  /** Знижка від типової ціни (реальна) */
  discountPercent: number
  /** Знижка, яку обіцяє магазин */
  claimedPercent: number | null
  reasons: Reason[]
  sparkline: number[]
}

export interface RejectedResponse {
  items: RejectedItemDto[]
  total: number
}

export interface FeedResponse {
  items: FeedItemDto[]
  total: number
  page: number
  limit: number
  pages: number
}

export interface CategoryNodeDto {
  slug: string
  name: string
  /** Кількість справжніх знижок у категорії (з урахуванням підкатегорій) */
  dealCount: number
  children: CategoryNodeDto[]
}

export interface ShopFilterDto extends ShopRefDto {
  /** Скільки справжніх знижок стосується товарів, що є в наявності в цьому магазині */
  dealCount: number
}

export interface FiltersResponse {
  /** Тестові дані (вигадані магазини й ціни), а не зібрані з сайтів магазинів */
  demo: boolean
  categories: CategoryNodeDto[]
  shops: ShopFilterDto[]
  priceRange: { min: number; max: number } | null
  maxDiscountPercent: number
  sortOptions: typeof SORT_OPTIONS
}

export interface OfferDto {
  shop: ShopRefDto & { rating: number | null }
  price: number
  inStock: boolean
  url: string
  /** Закреслена ціна, яку показує магазин */
  oldPrice: number | null
  isBest: boolean
  /** Коли парсер востаннє бачив пропозицію, ISO */
  lastSeenAt: string
}

export interface DealDto {
  status: DealStatus
  bestPrice: number
  bestShop: ShopRefDto
  basePrice: number | null
  min30: number | null
  min60: number | null
  discountPercent: number
  discountAmount: number
  /** Знижка, яку обіцяє сам магазин */
  claimedPercent: number | null
  score: number
  shopsCount: number
  reasons: Reason[]
  computedAt: string
}

export interface PricePointDto {
  date: string
  price: number
}

export interface ShopHistoryDto extends ShopRefDto {
  points: PricePointDto[]
}

export interface ProductDetailResponse {
  id: number
  name: string
  brand: string
  modelCode: string | null
  ean: string | null
  imageUrl: string | null
  rating: number | null
  reviewCount: number
  category: CategoryRefDto & { parent: CategoryRefDto | null }
  /** Null, якщо зараз немає жодної пропозиції в наявності */
  deal: DealDto | null
  /** Від найдешевшої; пропозиції не в наявності в кінці */
  offers: OfferDto[]
  history: {
    /** Найкраща ціна ринку по добах (лише товари в наявності) */
    market: PricePointDto[]
    /** Ціни окремих магазинів */
    shops: ShopHistoryDto[]
  }
}

export interface ApiErrorResponse {
  error: { code: string; message: string; details?: unknown }
}
