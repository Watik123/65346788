import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import { parsePrice } from '../scraping/schema-org'
import type { ListingParse, ListingRef, ListingScraper, ParseOutcome } from '../scraping/types'
import { cleanUrl, isNotNew, linkedPage, worthContinuing } from './listing-utils'

/**
 * iSpace (ispace.ua), техніка Apple. Розвідка 9 жовтня 2026 р. показала:
 *  - сітка .products-grid_grid > .carousel-product: назва a.entity-card_name[data-title], ціна
 *    .carousel-product_price-value, стара ціна .carousel-product_action-price;
 *  - наявність за кнопкою: «У кошик» (data-test=carousel-product-add-to-cart-button) — є,
 *    «Передзамовлення» чи «Повідомити мене» — немає; такі стоять у кінці списку;
 *  - артикул Apple лише в адресі товару: /product/iphone-15-256-gb-rozovyi-mtp73rx-a → MTP73RX/A;
 *  - по 21 товару на сторінку, наступні: ?page=2.
 */
export const BASE = 'https://ispace.ua'

export const ISPACE_CATEGORIES: { path: string; slug: string }[] = [
  { path: '/category/iphone', slug: 'smartfony' },
  { path: '/category/macbook-air', slug: 'noutbuky' },
  { path: '/category/macbook-pro', slug: 'noutbuky' },
  { path: '/category/macbook-neo', slug: 'noutbuky' },
]

/** «…-mtp73rx-a» у кінці адреси → «MTP73RX/A» */
export function partNumberFromSlug(slug: string): string | null {
  const m = slug.match(/-([a-z][a-z0-9]{4,6})-a$/i)
  return m ? `${(m[1] as string).toUpperCase()}/A` : null
}

function cardToOutcome(card: cheerio.Cheerio<AnyNode>, ref: ListingRef): ParseOutcome {
  const title = card.find('a.entity-card_name').first()
  const name = (title.attr('data-title') ?? title.text()).replace(/\s+/g, ' ').trim()
  const url = cleanUrl(title.attr('href') ?? card.find('a.entity-card_image-wrapper').first().attr('href'), ref.url)
  const slug = url ? new URL(url).pathname.replace(/\/$/, '').split('/').pop() : undefined
  if (!slug || !name || !url) return { kind: 'skip', reason: 'missing_data', detail: !name ? 'немає назви' : 'немає адреси' }
  if (isNotNew(name)) return { kind: 'skip', reason: 'not_new' }

  const button = card.find('[data-test^="carousel-product-"]').first().attr('data-test') ?? ''
  const inStock = button === 'carousel-product-add-to-cart-button'
  const price = parsePrice(card.find('.carousel-product_price-value').first().text())
  if (price === null) return { kind: 'skip', reason: inStock ? 'no_price' : 'sold_out' }
  if (!inStock) return { kind: 'skip', reason: 'sold_out', detail: button.replace('carousel-product-', '') || undefined }

  const old = parsePrice(card.find('.carousel-product_action-price').first().text())

  return {
    kind: 'product',
    product: {
      externalId: slug,
      url,
      name,
      brand: 'Apple',
      modelCode: partNumberFromSlug(slug),
      ean: null,
      categorySlug: ref.categorySlug,
      imageUrl: card.find('img.entity-card_image').first().attr('src') ?? null,
      price,
      oldPrice: old !== null && old > price ? old : null,
      inStock,
      rating: null,
      reviewCount: 0,
      raw: { name, price, old, button },
    },
  }
}

/** Читає сторінку категорії iSpace: картки товарів і наступну сторінку */
export function parseIspaceListing(html: string, ref: ListingRef): ListingParse {
  const $ = cheerio.load(html)
  const outcomes: ParseOutcome[] = []
  const seen = new Set<string>()
  $('.products-grid_grid > .carousel-product').each((_, el) => {
    const outcome = cardToOutcome($(el), ref)
    const key = outcome.kind === 'product' ? outcome.product.externalId : null
    if (key && seen.has(key)) return
    if (key) seen.add(key)
    outcomes.push(outcome)
  })

  let nextUrl: string | null = null
  if (worthContinuing(outcomes)) {
    const current = new URL(ref.url)
    const page = Number(current.searchParams.get('page') ?? '1') || 1
    nextUrl = linkedPage($, ref.url, `${current.pathname}?page=${page + 1}`)
  }
  return { outcomes, nextUrl }
}

export const ispace: ListingScraper = {
  kind: 'listing',
  slug: 'ispace',
  name: 'iSpace',
  baseUrl: BASE,
  maxPagesPerListing: 20,
  async *listings() {
    for (const c of ISPACE_CATEGORIES) yield { url: `${BASE}${c.path}`, categorySlug: c.slug }
  },
  parseListing: parseIspaceListing,
}
