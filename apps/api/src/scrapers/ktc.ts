import * as cheerio from 'cheerio'
import { parseAvailability, parsePrice } from '../scraping/schema-org'
import type { ListingParse, ListingRef, ListingScraper, ParseOutcome } from '../scraping/types'
import { extractModelCode } from './model-code'

/**
 * KTC (ktc.ua). Розвідка (npm run probe) показала:
 *  - сторінки категорій містять розмітку ItemList: по 48 товарів з ціною, наявністю, оцінкою,
 *    брендом, артикулом і закресленою ціною магазину (priceSpecification з priceType ListPrice);
 *  - наступна сторінка: <link rel="next" href="/tv/?page=2">;
 *  - чужих продавців немає (не маркетплейс);
 *  - robots.txt дозволяє каталог і ?page=, забороняє кошик, кабінет, пошук і рекламні мітки.
 * Тому збираємо лише сторінки категорій: один запит на 48 товарів.
 */
export const BASE = 'https://ktc.ua'

export const KTC_CATEGORIES: { path: string; slug: string }[] = [
  { path: '/tv/', slug: 'televizory' },
  { path: '/notebook/', slug: 'noutbuky' },
  { path: '/smartphone/', slug: 'smartfony' },
  { path: '/robotic_vacuums/', slug: 'pylososy' },
  { path: '/cordless_vacuums/', slug: 'pylososy' },
]

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const asArray = (v: unknown): unknown[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v])
const str = (v: unknown): string | null => (typeof v === 'string' ? v.trim() || null : typeof v === 'number' ? String(v) : null)
const typeOf = (n: Json) => asArray(n['@type']).filter((t): t is string => typeof t === 'string')

/** Адреса товару без #якоря і параметрів: стабільна між днями */
function cleanUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href, base)
    u.hash = ''
    u.search = ''
    return u.toString()
  } catch {
    return null
  }
}

function listPrice(offer: Json): number | null {
  for (const spec of asArray(offer['priceSpecification']).filter(isObj)) {
    const type = str(spec['priceType']) ?? ''
    if (/ListPrice|StrikethroughPrice/i.test(type)) return parsePrice(spec['price'])
  }
  return null
}

function itemToOutcome(item: Json, ref: ListingRef): ParseOutcome {
  const name = str(item['name'])
  const url = cleanUrl(str(item['url']) ?? '', ref.url)
  const sku = str(item['sku'])
  const brand = isObj(item['brand']) ? str(item['brand']['name']) : str(item['brand'])
  if (!name || !url || !sku) return { kind: 'skip', reason: 'missing_data', detail: !name ? 'немає назви' : !url ? 'немає адреси' : 'немає артикулу' }
  if (!brand) return { kind: 'skip', reason: 'missing_data', detail: 'немає бренду' }

  const offer = asArray(item['offers']).filter(isObj)[0]
  if (!offer) return { kind: 'skip', reason: 'no_price' }
  const price = parsePrice(offer['price'])
  // «Товар продано»: архівна модель без ціни й без наявності, KTC тримає її в кінці каталогу
  if (price === null) return { kind: 'skip', reason: parseAvailability(offer['availability']) === 'out_of_stock' ? 'sold_out' : 'no_price' }
  const currency = str(offer['priceCurrency']) ?? 'UAH'
  if (currency.toUpperCase() !== 'UAH') return { kind: 'skip', reason: 'wrong_currency', detail: currency }

  const old = listPrice(offer)
  const rating = isObj(item['aggregateRating']) ? item['aggregateRating'] : null
  const ratingValue = rating ? Number(rating['ratingValue']) : NaN
  const reviewCount = rating ? Math.max(0, Math.round(Number(rating['reviewCount'] ?? rating['ratingCount']) || 0)) : 0

  return {
    kind: 'product',
    product: {
      externalId: sku,
      url,
      name,
      brand,
      modelCode: str(item['mpn']) ?? extractModelCode(name),
      ean: null,
      categorySlug: ref.categorySlug,
      imageUrl: str(item['image']) ?? (isObj(item['image']) ? str(item['image']['url']) : null),
      price,
      oldPrice: old !== null && old > price ? old : null,
      inStock: parseAvailability(offer['availability']) === 'in_stock',
      rating: Number.isFinite(ratingValue) && ratingValue > 0 && ratingValue <= 5 ? ratingValue : null,
      reviewCount,
      raw: item,
    },
  }
}

/** Читає сторінку категорії KTC: товари з розмітки ItemList і посилання на наступну сторінку */
export function parseKtcListing(html: string, ref: ListingRef): ListingParse {
  const $ = cheerio.load(html)
  const outcomes: ParseOutcome[] = []
  const seen = new Set<string>()

  $('script[type="application/ld+json"]').each((_, el) => {
    let data: unknown
    try {
      data = JSON.parse($(el).text())
    } catch {
      return
    }
    for (const node of asArray(data).flatMap((n) => (isObj(n) && n['@graph'] ? asArray(n['@graph']) : [n])).filter(isObj)) {
      if (!typeOf(node).includes('ItemList')) continue
      for (const li of asArray(node['itemListElement']).filter(isObj)) {
        const item = isObj(li['item']) ? li['item'] : li
        if (!typeOf(item).includes('Product')) continue
        const outcome = itemToOutcome(item, ref)
        // Той самий товар двічі на сторінці (напр. у блоці «популярне») рахуємо один раз
        const key = outcome.kind === 'product' ? outcome.product.externalId : null
        if (key && seen.has(key)) continue
        if (key) seen.add(key)
        outcomes.push(outcome)
      }
    }
  })

  // Продані товари KTC показує після всіх, що продаються. Якщо на сторінці лишились тільки
  // вони, далі в цій категорії нічого з ціною немає: не робимо зайвих запитів до сайту.
  const onlySold = outcomes.length > 0 && outcomes.every((o) => o.kind === 'skip' && o.reason === 'sold_out')

  // Наступна сторінка: лише в межах тієї самої категорії, щоб не забрести в інший розділ
  const nextHref = $('link[rel="next"]').attr('href') ?? $('a[rel="next"]').attr('href')
  let nextUrl: string | null = null
  if (nextHref && outcomes.length > 0 && !onlySold) {
    try {
      const next = new URL(nextHref, ref.url)
      const current = new URL(ref.url)
      if (next.origin === current.origin && next.pathname === current.pathname && next.toString() !== current.toString()) nextUrl = next.toString()
    } catch {
      nextUrl = null
    }
  }
  return { outcomes, nextUrl }
}

export const ktc: ListingScraper = {
  kind: 'listing',
  slug: 'ktc',
  name: 'KTC',
  baseUrl: BASE,
  maxPagesPerListing: 60,
  async *listings() {
    for (const c of KTC_CATEGORIES) yield { url: `${BASE}${c.path}`, categorySlug: c.slug }
  },
  parseListing: parseKtcListing,
}
