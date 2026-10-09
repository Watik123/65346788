import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import { parsePrice } from '../scraping/schema-org'
import type { ListingParse, ListingRef, ListingScraper, ParseOutcome } from '../scraping/types'
import { cleanUrl, intFrom, isNotNew, worthContinuing } from './listing-utils'
import { extractModelCode } from './model-code'

/**
 * TTT (ttt.ua). Розвідка 9 жовтня 2026 р. показала:
 *  - картки article.product-cut з атрибутами data-gtm-id, data-gtm-name, data-gtm-price, data-gtm-brand;
 *  - блок ціни [data-product-price-section]: прихований (hidden) у товарів без продажу, наявність —
 *    [data-product-available="available"], ціна — [data-product-price--main], закреслена — [data-product-price--origin];
 *  - по 24 товари на сторінку, наступні: ?per_page=24, ?per_page=48 (зсув, а не номер сторінки);
 *    є українська версія /ua/.
 */
export const BASE = 'https://www.ttt.ua'

export const TTT_CATEGORIES: { path: string; slug: string }[] = [
  { path: '/ua/shop/category/foto-video-audio-i-tv/televizory', slug: 'televizory' },
  { path: '/ua/shop/category/noutbuki-pk-i-orgtehnika/noutbuki', slug: 'noutbuky' },
  { path: '/ua/shop/category/telefony-mp3-gps/mobilnye-telefony/smartfony', slug: 'smartfony' },
  { path: '/ua/shop/category/bytovaia-tehnika/tovary-po-uhodu-za-domom-i-odezhdoy/pylesosy', slug: 'pylososy' },
]

const positive = (n: number | null) => (n !== null && n > 0 ? n : null)

function cardToOutcome(card: cheerio.Cheerio<AnyNode>, ref: ListingRef): ParseOutcome {
  const id = card.attr('data-gtm-id')?.trim()
  const titleLink = card.find('a.product-cut__title').first()
  const name = (titleLink.text() || card.attr('data-gtm-name') || '').replace(/\s+/g, ' ').trim()
  const brand = (card.attr('data-gtm-brand') ?? '').trim()
  const url = cleanUrl(titleLink.attr('href') ?? card.find('[data-product-photo-href]').first().attr('data-product-photo-href'), ref.url)
  if (!id || !name || !url) return { kind: 'skip', reason: 'missing_data', detail: !id ? 'немає коду' : !name ? 'немає назви' : 'немає адреси' }
  if (!brand) return { kind: 'skip', reason: 'missing_data', detail: 'немає бренду' }
  if (isNotNew(name)) return { kind: 'skip', reason: 'not_new' }

  const section = card.find('[data-product-price-section]').first()
  const inStock = section.length > 0 && !section.hasClass('hidden') && section.find('[data-product-available="available"]').length > 0
  const price = positive(parsePrice(section.find('[data-product-price--main]').first().text())) ?? positive(parsePrice(card.attr('data-gtm-price') ?? ''))
  if (price === null) return { kind: 'skip', reason: inStock ? 'no_price' : 'sold_out' }
  if (!inStock) return { kind: 'skip', reason: 'sold_out', detail: section.find('[class*="__text"]').first().text().trim() || undefined }

  const old = positive(parsePrice(section.find('[data-product-price--origin]').first().text()))
  const reviews = intFrom(card.find('.star-rating__link').first().text()) ?? 0
  // Кожна зірка має підказку «4 з 5 зірок» з оцінкою товару
  const stars = Number((card.find('.star-rating__star').first().attr('title') ?? '').match(/^\s*([\d.,]+)/)?.[1]?.replace(',', '.'))
  const img = card.find('img.product-photo__img').first()
  const imageSrc = img.attr('data-original') ?? (img.attr('src')?.startsWith('data:') ? undefined : img.attr('src'))

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
      rating: reviews > 0 && stars > 0 && stars <= 5 ? stars : null,
      reviewCount: reviews,
      raw: { id, name, brand, price, old, reviews, stars: stars || null },
    },
  }
}

/**
 * Наступна сторінка TTT: найменший зсув ?per_page, більший за поточний, серед посилань сторінки
 * на той самий розділ. Розмір сторінки не вгадуємо, беремо з посилань сайту.
 */
function nextPage($: cheerio.CheerioAPI, currentUrl: string): string | null {
  const current = new URL(currentUrl)
  const offset = Number(current.searchParams.get('per_page') ?? '0') || 0
  let best: number | null = null
  $('a[href*="per_page="]').each((_, el) => {
    try {
      const u = new URL($(el).attr('href') ?? '', currentUrl)
      if (u.origin !== current.origin || u.pathname !== current.pathname) return
      const n = Number(u.searchParams.get('per_page'))
      if (Number.isInteger(n) && n > offset && (best === null || n < best)) best = n
    } catch {
      // зіпсоване посилання
    }
  })
  return best === null ? null : `${current.origin}${current.pathname}?per_page=${best}`
}

/** Читає сторінку категорії TTT: картки товарів і наступну сторінку */
export function parseTttListing(html: string, ref: ListingRef): ListingParse {
  const $ = cheerio.load(html)
  const outcomes: ParseOutcome[] = []
  const seen = new Set<string>()
  $('article.product-cut[data-gtm-id]').each((_, el) => {
    const outcome = cardToOutcome($(el), ref)
    const key = outcome.kind === 'product' ? outcome.product.externalId : null
    if (key && seen.has(key)) return
    if (key) seen.add(key)
    outcomes.push(outcome)
  })
  return { outcomes, nextUrl: worthContinuing(outcomes) ? nextPage($, ref.url) : null }
}

export const ttt: ListingScraper = {
  kind: 'listing',
  slug: 'ttt',
  name: 'TTT',
  baseUrl: BASE,
  maxPagesPerListing: 50,
  async *listings() {
    for (const c of TTT_CATEGORIES) yield { url: `${BASE}${c.path}`, categorySlug: c.slug }
  },
  parseListing: parseTttListing,
}
