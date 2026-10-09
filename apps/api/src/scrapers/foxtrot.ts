import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import { parsePrice } from '../scraping/schema-org'
import type { ListingParse, ListingRef, ListingScraper, ParseOutcome } from '../scraping/types'
import { cleanUrl, intFrom, isNotNew, linkedPage, worthContinuing } from './listing-utils'
import { extractModelCode } from './model-code'

/**
 * Foxtrot (foxtrot.com.ua). Розвідка 9 жовтня 2026 р. показала:
 *  - на сторінках категорій немає розмітки товарів schema.org, але кожна картка має атрибути:
 *    data-code (код товару, «Код: 7251312»), data-title, data-brand, data-price, data-variant (InStock);
 *  - закреслена ціна: .price--old; оцінка: число в .product-rate, відгуки: .product-reviews-text;
 *  - по 42 товари на сторінку, наступні: ?page=2, ?page=3 (без rel=next);
 *  - robots.txt дозволяє каталог і ?page=.
 */
export const BASE = 'https://www.foxtrot.com.ua'

export const FOXTROT_CATEGORIES: { path: string; slug: string }[] = [
  { path: '/uk/shop/led_televizory.html', slug: 'televizory' },
  { path: '/uk/shop/noutbuki.html', slug: 'noutbuky' },
  { path: '/uk/shop/mobilnye_telefony_smartfony.html', slug: 'smartfony' },
  { path: '/uk/shop/stiralki.html', slug: 'pralni-mashyny' },
  { path: '/uk/shop/holodilniki.html', slug: 'kholodylnyky' },
  { path: '/uk/shop/pylesosy.html', slug: 'pylososy' },
  { path: '/uk/shop/roboti_pilesosi.html', slug: 'pylososy' },
]

function cardToOutcome(card: cheerio.Cheerio<AnyNode>, ref: ListingRef): ParseOutcome {
  const code = card.attr('data-code')?.trim()
  const name = (card.attr('data-title') ?? card.find('.product-card__title').first().text()).replace(/\s+/g, ' ').trim()
  const brand = (card.attr('data-brand') ?? '').trim()
  const url = cleanUrl(card.find('.info a[href]').first().attr('href') ?? card.find('a.images[href]').first().attr('href'), ref.url)
  if (!code || !name || !url) return { kind: 'skip', reason: 'missing_data', detail: !code ? 'немає коду' : !name ? 'немає назви' : 'немає адреси' }
  if ((card.attr('data-type') ?? 'Product') !== 'Product') return { kind: 'skip', reason: 'not_a_product', detail: card.attr('data-type') }
  if (!brand) return { kind: 'skip', reason: 'missing_data', detail: 'немає бренду' }
  if (isNotNew(name)) return { kind: 'skip', reason: 'not_new' }

  const variant = (card.attr('data-variant') ?? '').trim()
  const inStock = variant === 'InStock'
  const price = parsePrice(card.attr('data-price') ?? '') ?? parsePrice(card.find('.price--current').first().text())
  if (price === null) return { kind: 'skip', reason: inStock ? 'no_price' : 'sold_out' }
  if (!inStock) return { kind: 'skip', reason: 'sold_out', detail: variant || undefined }

  const old = parsePrice(card.find('.price--old').first().text())
  const ratingValue = Number((card.find('.product-rate span').first().text() || '').replace(',', '.'))
  const reviews = intFrom(card.find('.product-reviews-text').first().text()) ?? 0
  const image = card.find('.product-card__img img').first().attr('src') ?? card.find('meta[itemprop="thumbnailUrl"]').attr('content') ?? null

  return {
    kind: 'product',
    product: {
      externalId: code,
      url,
      name,
      brand,
      modelCode: extractModelCode(name),
      ean: null,
      categorySlug: ref.categorySlug,
      imageUrl: image,
      price,
      oldPrice: old !== null && old > price ? old : null,
      inStock,
      rating: reviews > 0 && ratingValue > 0 && ratingValue <= 5 ? ratingValue : null,
      reviewCount: reviews,
      raw: { code, id: card.attr('data-id'), name, brand, price, old, variant, rating: ratingValue || null, reviews },
    },
  }
}

/** Читає сторінку категорії Foxtrot: картки товарів і наступну сторінку */
export function parseFoxtrotListing(html: string, ref: ListingRef): ListingParse {
  const $ = cheerio.load(html)
  const outcomes: ParseOutcome[] = []
  const seen = new Set<string>()
  $('.product-card[data-code]').each((_, el) => {
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
    // Сайт посилається на наступну сторінку так: /uk/shop/stiralki.html?page=2
    nextUrl = linkedPage($, ref.url, `${current.pathname}?page=${page + 1}`)
  }
  return { outcomes, nextUrl }
}

export const foxtrot: ListingScraper = {
  kind: 'listing',
  slug: 'foxtrot',
  name: 'Foxtrot',
  baseUrl: BASE,
  maxPagesPerListing: 40,
  async *listings() {
    for (const c of FOXTROT_CATEGORIES) yield { url: `${BASE}${c.path}`, categorySlug: c.slug }
  },
  parseListing: parseFoxtrotListing,
}
