import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import { parsePrice } from '../scraping/schema-org'
import type { ListingParse, ListingRef, ListingScraper, ParseOutcome } from '../scraping/types'
import { cleanUrl, intFrom, isNotNew, linkedPage, worthContinuing } from './listing-utils'
import { extractModelCode } from './model-code'

/**
 * MOYO (moyo.ua). Розвідка 9 жовтня 2026 р. показала:
 *  - розмітки schema.org для товарів немає, зате кожна картка в списку має атрибути з даними:
 *    data-id, data-name, data-brand, data-price, data-status-product («В наличии» / «Нет в наличии»);
 *  - закреслена ціна: div.product-card_price_oldprice; оцінка: зірочки й кількість відгуків;
 *  - по 24 товари на сторінку, наступна: <link rel="next" href="?page=2">; товари без наявності
 *    (data-price="0", клас not-available) стоять у кінці каталогу;
 *  - robots.txt дозволяє сторінки категорій і ?page=; чужих продавців немає.
 */
export const BASE = 'https://www.moyo.ua'

export const MOYO_CATEGORIES: { path: string; slug: string }[] = [
  { path: '/ua/foto_video/tv_audio/lcd_tv/', slug: 'televizory' },
  { path: '/ua/comp-and-periphery/notebooks/', slug: 'noutbuky' },
  { path: '/ua/telecommunication/smart/', slug: 'smartfony' },
  { path: '/ua/bt/kbt/stiralnie-mashiny/', slug: 'pralni-mashyny' },
  { path: '/ua/bt/kbt/holodilniky/', slug: 'kholodylnyky' },
  { path: '/ua/bt/mbt/pylesosy/', slug: 'pylososy' },
  { path: '/ua/bt/mbt/robot_pyle_i_chist/', slug: 'pylososy' },
]

const IN_STOCK = /^(в наличии|в наявності|є в наявності)$/i

/** Адреса фото: у src часто заглушка-завантажувач, справжня адреса закодована в data-srcset-hash */
function imageOf(card: cheerio.Cheerio<AnyNode>): string | null {
  const img = card.find('img.first-image').first()
  const src = img.attr('src')
  if (src && !/bx_loader|data:/.test(src)) return src
  const hash = img.attr('data-srcset-hash')
  if (hash) {
    try {
      const decoded = Buffer.from(hash, 'base64').toString('utf8').trim()
      if (/^https:\/\//.test(decoded)) return decoded
    } catch {
      // некоректний base64
    }
  }
  return card.attr('data-img') ?? null
}

function cardToOutcome(card: cheerio.Cheerio<AnyNode>, ref: ListingRef): ParseOutcome {
  const id = card.attr('data-id') ?? card.attr('data-product_id')
  const name = (card.attr('data-name') ?? card.find('.product-card_title span').first().text()).trim()
  const brand = (card.attr('data-brand') ?? '').trim()
  const url = cleanUrl(card.find('a.product-card_title').attr('href') ?? card.find('a.product-card_image').attr('href'), ref.url)
  if (!id || !name || !url) return { kind: 'skip', reason: 'missing_data', detail: !id ? 'немає коду' : !name ? 'немає назви' : 'немає адреси' }
  if (!brand) return { kind: 'skip', reason: 'missing_data', detail: 'немає бренду' }
  if (isNotNew(name)) return { kind: 'skip', reason: 'not_new' }

  const status = (card.attr('data-status-product') ?? '').trim()
  const inStock = IN_STOCK.test(status) && !card.hasClass('not-available')
  const price = parsePrice(card.attr('data-price') ?? '') ?? (inStock ? parsePrice(card.find('.product-card_price_current').first().text()) : null)
  if (price === null) return { kind: 'skip', reason: inStock ? 'no_price' : 'sold_out' }
  // Товар без наявності: ціна на картці буває старою, у порівняння її не беремо
  if (!inStock) return { kind: 'skip', reason: 'sold_out' }

  const old = parsePrice(card.find('.product-card_price_oldprice').first().text())
  const reviews = intFrom(card.find('.reviews-count .link').first().text()) ?? 0
  const stars = card.find('.reviews-rate .rate-star.active-start').length

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
      imageUrl: imageOf(card),
      price,
      oldPrice: old !== null && old > price ? old : null,
      inStock,
      rating: reviews > 0 && stars > 0 ? stars : null,
      reviewCount: reviews,
      raw: { id, name, brand, price, old, status, stars, reviews },
    },
  }
}

/** Читає сторінку категорії MOYO: картки товарів і наступну сторінку */
export function parseMoyoListing(html: string, ref: ListingRef): ListingParse {
  const $ = cheerio.load(html)
  const outcomes: ParseOutcome[] = []
  const seen = new Set<string>()
  // Лише основний список: на сторінці бувають ще блоки «рекомендовані», «переглянуті»
  $('.js-products-list .product-card, .catalog_products .product-card').each((_, el) => {
    const outcome = cardToOutcome($(el), ref)
    const key = outcome.kind === 'product' ? outcome.product.externalId : null
    if (key && seen.has(key)) return
    if (key) seen.add(key)
    outcomes.push(outcome)
  })

  // Одна й та сама кількість відгуків і зірок на всіх картках = заглушка в розмітці, а не справжні дані
  const products = outcomes.flatMap((o) => (o.kind === 'product' ? [o.product] : []))
  const withReviews = products.filter((p) => p.reviewCount > 0)
  if (withReviews.length >= 6 && new Set(withReviews.map((p) => `${p.reviewCount}/${p.rating}`)).size === 1) {
    for (const p of products) {
      p.rating = null
      p.reviewCount = 0
    }
  }

  let nextUrl: string | null = null
  if (worthContinuing(outcomes)) {
    const rel = $('link[rel="next"]').attr('href')
    const current = new URL(ref.url)
    const page = Number(current.searchParams.get('page') ?? '1') || 1
    const candidate = rel ?? `${current.pathname}?page=${page + 1}`
    const next = linkedPage($, ref.url, candidate)
    // Лише в межах тієї самої категорії
    if (next && new URL(next).pathname === current.pathname && next !== ref.url) nextUrl = next
  }
  return { outcomes, nextUrl }
}

export const moyo: ListingScraper = {
  kind: 'listing',
  slug: 'moyo',
  name: 'MOYO',
  baseUrl: BASE,
  maxPagesPerListing: 60,
  async *listings() {
    for (const c of MOYO_CATEGORIES) yield { url: `${BASE}${c.path}`, categorySlug: c.slug }
  },
  parseListing: parseMoyoListing,
}
