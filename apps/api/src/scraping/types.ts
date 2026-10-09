import type { Fetcher } from './fetcher'

export interface Logger {
  info(msg: string): void
  warn(msg: string): void
  error(msg: string): void
}

export const consoleLogger: Logger = {
  info: (m) => console.log(m),
  warn: (m) => console.warn(`⚠ ${m}`),
  error: (m) => console.error(`✗ ${m}`),
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} }

/** Сторінка товару, знайдена під час обходу */
export interface ProductRef {
  url: string
  /** Slug нашої категорії (televizory, noutbuky…): її визначає модуль магазину за розділом сайту */
  categorySlug: string
}

/** Товар у вигляді, готовому до запису в базу. Ціни в цілих гривнях. */
export interface ParsedProduct {
  /** Ідентифікатор у магазині: артикул або частина адреси; незмінний між запусками */
  externalId: string
  url: string
  name: string
  brand: string
  modelCode: string | null
  ean: string | null
  categorySlug: string
  imageUrl: string | null
  price: number
  /** Закреслена ціна магазину, якщо є; у знижку не рахується, лише для порівняння */
  oldPrice: number | null
  inStock: boolean
  rating: number | null
  reviewCount: number
  /** Сирі дані зі сторінки для налагодження */
  raw: unknown
}

export type SkipReason = 'third_party_seller' | 'not_a_product' | 'wrong_currency' | 'no_price' | 'missing_data'

export type ParseOutcome = { kind: 'product'; product: ParsedProduct } | { kind: 'skip'; reason: SkipReason; detail?: string }

export interface ScrapeContext {
  fetcher: Fetcher
  log: Logger
  /** Ліміт товарів за запуск (для перевірок); undefined = без ліміту */
  maxProducts: number | undefined
}

/** Сторінка-список (категорія), з якої береться одразу багато товарів */
export interface ListingRef {
  url: string
  categorySlug: string
}

export interface ListingParse {
  outcomes: ParseOutcome[]
  /** Наступна сторінка списку або null, якщо це остання */
  nextUrl: string | null
}

interface ScraperMeta {
  readonly slug: string
  readonly name: string
  readonly baseUrl: string
}

/** Спосіб 1: кожна сторінка товару окремо (знайти адреси → завантажити й прочитати кожну) */
export interface PageScraper extends ScraperMeta {
  readonly kind?: 'pages'
  /** Знаходить сторінки товарів: зі sitemap або зі сторінок категорій */
  discover(ctx: ScrapeContext): AsyncIterable<ProductRef>
  /** Читає сторінку товару. Чужих продавців маркетплейсу слід повертати як skip. */
  parse(html: string, ref: ProductRef): ParseOutcome
}

/**
 * Спосіб 2: сторінки категорій, де вже є ціни багатьох товарів. Набагато ввічливіше:
 * один запит на десятки товарів замість запиту на кожен.
 */
export interface ListingScraper extends ScraperMeta {
  readonly kind: 'listing'
  /** Перші сторінки категорій; наступні каркас знайде сам через nextUrl */
  listings(ctx: ScrapeContext): AsyncIterable<ListingRef>
  parseListing(html: string, ref: ListingRef): ListingParse
  /** Запобіжник: не більше стількох сторінок в одній категорії */
  readonly maxPagesPerListing?: number
}

/**
 * Модуль магазину. Новий магазин це один файл у src/scrapers/, що реалізує один із двох способів.
 * Усе інше (паузи, повтори, кеш, журнал, запис) робить каркас.
 */
export type ShopScraper = PageScraper | ListingScraper
