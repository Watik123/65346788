import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import { parsePrice } from '../scraping/schema-org'
import type { ListingParse, ListingRef, ListingScraper, ParseOutcome } from '../scraping/types'
import { cleanUrl, isNotNew, linkedPage, worthContinuing } from './listing-utils'
import { extractModelCode } from './model-code'

/**
 * Artline (artline.ua). Розвідка 9 жовтня 2026 р. показала:
 *  - картки .goods-card з атрибутами data-id, data-name, data-price, data-brand;
 *  - закреслена ціна: .goods-card__old-price del; відгуки: .goods-card__rating[data-rev],
 *    оцінка — у стилі зірок (--percent: calc(4.5/5*100%));
 *  - кнопка кошика з позначкою передзамовлення (data-pre-order) чи недоступності (btn-disabled);
 *  - по 36 товарів на сторінку, наступні: /uk/catalog/smartfony/page=2; є українська версія /uk/.
 */
export const BASE = 'https://artline.ua'

export const ARTLINE_CATEGORIES: { path: string; slug: string }[] = [
  { path: '/uk/catalog/noutbuki', slug: 'noutbuky' },
  { path: '/uk/catalog/smartfony', slug: 'smartfony' },
]

function cardToOutcome(card: cheerio.Cheerio<AnyNode>, ref: ListingRef): ParseOutcome {
  const id = card.attr('data-id')?.trim()
  const titleLink = card.find('a.goods-card__title').first()
  const name = (card.attr('data-name') ?? titleLink.text()).replace(/\s+/g, ' ').trim()
  const brand = (card.attr('data-brand') ?? '').trim()
  const url = cleanUrl(titleLink.attr('href') ?? card.find('a.goods-card__img').first().attr('href'), ref.url)
  if (!id || !name || !url) return { kind: 'skip', reason: 'missing_data', detail: !id ? 'немає коду' : !name ? 'немає назви' : 'немає адреси' }
  if (!brand) return { kind: 'skip', reason: 'missing_data', detail: 'немає бренду' }
  if (isNotNew(name)) return { kind: 'skip', reason: 'not_new' }

  const basket = card.find('.goods-card__price-basket').first()
  const preOrder = basket.attr('data-pre-order') === '1'
  const disabled = /'btn-disabled':\s*(1|true)/.test(basket.attr(':class') ?? '') || basket.hasClass('btn-disabled')
  const inStock = basket.length > 0 && !preOrder && !disabled
  const price = parsePrice(card.attr('data-price') ?? '') ?? parsePrice(card.find('.price-regular').first().text())
  if (price === null) return { kind: 'skip', reason: inStock ? 'no_price' : 'sold_out' }
  if (!inStock) return { kind: 'skip', reason: 'sold_out', detail: preOrder ? 'передзамовлення' : undefined }

  const old = parsePrice(card.find('.goods-card__old-price del').first().text())
  const reviews = Math.max(0, Math.round(Number(card.find('.goods-card__rating').first().attr('data-rev')) || 0))
  const stars = Number((card.find('.rating-stars').first().attr('style') ?? '').match(/calc\(\s*([\d.]+)\s*\/\s*5/)?.[1])
  const img = card.find('img.goods-card__image').first()

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
      imageUrl: img.attr('src') ?? img.attr('data-src') ?? null,
      price,
      oldPrice: old !== null && old > price ? old : null,
      inStock,
      rating: reviews > 0 && stars > 0 && stars <= 5 ? stars : null,
      reviewCount: reviews,
      raw: { id, name, brand, price, old, reviews, stars: stars || null },
    },
  }
}

/** Читає сторінку категорії Artline: картки товарів і наступну сторінку */
export function parseArtlineListing(html: string, ref: ListingRef): ListingParse {
  const $ = cheerio.load(html)
  const outcomes: ParseOutcome[] = []
  const seen = new Set<string>()
  $('.goods-card[data-id]').each((_, el) => {
    const outcome = cardToOutcome($(el), ref)
    const key = outcome.kind === 'product' ? outcome.product.externalId : null
    if (key && seen.has(key)) return
    if (key) seen.add(key)
    outcomes.push(outcome)
  })

  let nextUrl: string | null = null
  if (worthContinuing(outcomes)) {
    const current = new URL(ref.url)
    const m = current.pathname.match(/^(.*)\/page=(\d+)\/?$/)
    const base = m ? (m[1] as string) : current.pathname.replace(/\/$/, '')
    const page = m ? Number(m[2]) : 1
    nextUrl = linkedPage($, ref.url, `${base}/page=${page + 1}`)
  }
  return { outcomes, nextUrl }
}

export const artline: ListingScraper = {
  kind: 'listing',
  slug: 'artline',
  name: 'Artline',
  baseUrl: BASE,
  maxPagesPerListing: 40,
  async *listings() {
    for (const c of ARTLINE_CATEGORIES) yield { url: `${BASE}${c.path}`, categorySlug: c.slug }
  },
  parseListing: parseArtlineListing,
}
