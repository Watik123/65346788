import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import { parseAvailability, parsePrice } from '../scraping/schema-org'
import type { ListingParse, ListingRef, ListingScraper, ParseOutcome } from '../scraping/types'
import { cleanUrl, intFrom, isNotNew, linkedPage, worthContinuing } from './listing-utils'
import { extractModelCode } from './model-code'

/**
 * Vencon (vencon.ua), побутова техніка. Розвідка 9 жовтня 2026 р. показала:
 *  - картки li.product-catalog-card з атрибутом data-layer-params
 *    («id:309218;name:Holmer HTF-050;price:4199;brand:Holmer;variant:В наличии;…») і мікророзміткою
 *    schema.org Offer у картці (ціна, наявність); закреслена ціна: .product-price .old-price;
 *  - по 47 товарів на сторінку, наступна: <link rel="next" href="?page=2">; є українська версія /ua/.
 */
export const BASE = 'https://vencon.ua'

export const VENCON_CATEGORIES: { path: string; slug: string }[] = [
  { path: '/ua/catalog/stiralnye-mashiny', slug: 'pralni-mashyny' },
  { path: '/ua/catalog/holodilniki', slug: 'kholodylnyky' },
  { path: '/ua/catalog/pylesosy', slug: 'pylososy' },
]

/** «a:1;b:2» → { a: '1', b: '2' }; значення можуть містити двокрапку */
function layerParams(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (raw ?? '').split(';')) {
    const i = part.indexOf(':')
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return out
}

function cardToOutcome(card: cheerio.Cheerio<AnyNode>, ref: ListingRef): ParseOutcome {
  const params = layerParams(card.attr('data-layer-params'))
  const id = card.attr('data-id')?.trim() || params['id']
  const titleLink = card.find('a.product-title').first()
  const name = titleLink.text().replace(/\s+/g, ' ').trim() || params['name'] || ''
  const brand = (params['brand'] ?? '').trim()
  const url = cleanUrl(titleLink.attr('href') ?? card.find('a.img').first().attr('href'), ref.url)
  if (!id || !name || !url) return { kind: 'skip', reason: 'missing_data', detail: !id ? 'немає коду' : !name ? 'немає назви' : 'немає адреси' }
  if (!brand) return { kind: 'skip', reason: 'missing_data', detail: 'немає бренду' }
  if (isNotNew(name)) return { kind: 'skip', reason: 'not_new' }

  const offer = card.find('[itemprop="offers"]').first()
  const availability = parseAvailability(offer.find('meta[itemprop="availability"]').attr('content'))
  const label = card.find('.availability-label').first().text().replace(/\s+/g, ' ').trim()
  const inStock = availability === 'in_stock' || (availability === 'unknown' && /в наявності|в наличии/i.test(label))
  const price = parsePrice(offer.find('meta[itemprop="price"]').attr('content')) ?? parsePrice(params['price']) ?? parsePrice(card.find('.product-price .actual').first().text())
  if (price === null) return { kind: 'skip', reason: inStock ? 'no_price' : 'sold_out' }
  if (!inStock) return { kind: 'skip', reason: 'sold_out', detail: label || undefined }

  const old = parsePrice(card.find('.product-price .old-price').first().text())
  const img = card.find('.img-container img').first()
  const imageSrc = img.attr('src') && !/loading\.svg/.test(img.attr('src') ?? '') ? img.attr('src') : img.attr('data-srcset')?.split(/\s+/)[0]
  const reviews = intFrom(card.find('.review-link').first().text()) ?? 0

  return {
    kind: 'product',
    product: {
      externalId: id,
      url,
      name,
      brand,
      modelCode: extractModelCode(name),
      ean: null,
      categorySlug: ref.categorySlug,
      imageUrl: imageSrc ? cleanUrl(imageSrc, ref.url) : null,
      price,
      oldPrice: old !== null && old > price ? old : null,
      inStock,
      rating: null,
      reviewCount: reviews,
      raw: { id, code: params['id'], name, brand, price, old, label },
    },
  }
}

/** Читає сторінку категорії Vencon: картки товарів і наступну сторінку */
export function parseVenconListing(html: string, ref: ListingRef): ListingParse {
  const $ = cheerio.load(html)
  const outcomes: ParseOutcome[] = []
  const seen = new Set<string>()
  $('li.product-catalog-card').each((_, el) => {
    const outcome = cardToOutcome($(el), ref)
    const key = outcome.kind === 'product' ? outcome.product.externalId : null
    if (key && seen.has(key)) return
    if (key) seen.add(key)
    outcomes.push(outcome)
  })

  let nextUrl: string | null = null
  if (worthContinuing(outcomes)) {
    const current = new URL(ref.url)
    const rel = $('link[rel="next"]').attr('href')
    const page = Number(current.searchParams.get('page') ?? '1') || 1
    const next = linkedPage($, ref.url, rel ?? `${current.pathname}?page=${page + 1}`)
    if (next && new URL(next).pathname === current.pathname && next !== ref.url) nextUrl = next
  }
  return { outcomes, nextUrl }
}

export const vencon: ListingScraper = {
  kind: 'listing',
  slug: 'vencon',
  name: 'Vencon',
  baseUrl: BASE,
  maxPagesPerListing: 40,
  async *listings() {
    for (const c of VENCON_CATEGORIES) yield { url: `${BASE}${c.path}`, categorySlug: c.slug }
  },
  parseListing: parseVenconListing,
}
