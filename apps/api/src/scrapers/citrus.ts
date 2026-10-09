import * as cheerio from 'cheerio'
import { parsePrice } from '../scraping/schema-org'
import type { ListingParse, ListingRef, ListingScraper, ParseOutcome } from '../scraping/types'
import { cleanUrl, isNotNew, linkedPage, worthContinuing } from './listing-utils'
import { extractModelCode } from './model-code'

/**
 * Цитрус (citrus.ua). Розвідка 9 жовтня 2026 р. показала:
 *  - сайт на Next.js: товари сторінки категорії лежать у вбудованому JSON (script#__NEXT_DATA__,
 *    props.pageProps.data.products): код, назва, бренд, ціна й закреслена ціна (prices.price/old),
 *    наявність (status.type = CAN_BUY), оцінка й кількість відгуків, ознака вітринного зразка;
 *  - є й розмітка ItemList, але без наявності та закресленої ціни, тому беремо JSON;
 *  - по 47 товарів на сторінку, наступні: /smartfony/page_2/ (без rel=next);
 *  - вживані товари мають окремі розділи (/b-u-smartfony/ тощо), ми їх не беремо.
 */
export const BASE = 'https://citrus.ua'

export const CITRUS_CATEGORIES: { path: string; slug: string }[] = [
  { path: '/televizory/', slug: 'televizory' },
  { path: '/noutbuki-i-ultrabuki/', slug: 'noutbuky' },
  { path: '/smartfony/', slug: 'smartfony' },
  { path: '/stiralnye-mashiny/', slug: 'pralni-mashyny' },
  { path: '/holodilniki/', slug: 'kholodylnyky' },
  { path: '/pylesosy/', slug: 'pylososy' },
  { path: '/ruchnye-pylesosy/', slug: 'pylososy' },
  { path: '/roboty-uborshhiki/', slug: 'pylososy' },
]

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' ? v.trim() || null : typeof v === 'number' ? String(v) : null)
const at = (v: unknown, ...path: string[]): unknown => path.reduce<unknown>((cur, k) => (isObj(cur) ? cur[k] : undefined), v)

/** Фото: сайт віддає адресу через свій проксі /_next/image/?url=..., беремо справжню */
function imageOf(item: Json, base: string): string | null {
  const preview = Array.isArray(item['preview']) ? item['preview'][0] : undefined
  const raw = str(item['image']) ?? (isObj(preview) ? str(preview['src']) : null)
  if (!raw) return null
  try {
    const u = new URL(raw, base)
    const inner = u.pathname.startsWith('/_next/image') ? u.searchParams.get('url') : null
    return inner && /^https:\/\//.test(inner) ? inner : u.toString()
  } catch {
    return null
  }
}

function itemToOutcome(item: Json, ref: ListingRef): ParseOutcome {
  const id = str(item['id'])
  const name = (str(item['name']) ?? str(item['title']) ?? '').replace(/\s+/g, ' ').trim()
  const url = cleanUrl(str(item['url']) ?? str(item['href']), ref.url)
  const brand = str(at(item, 'brand', 'name'))
  if (!id || !name || !url) return { kind: 'skip', reason: 'missing_data', detail: !id ? 'немає коду' : !name ? 'немає назви' : 'немає адреси' }
  if (!brand) return { kind: 'skip', reason: 'missing_data', detail: 'немає бренду' }
  if (item['isVitrina'] === true || isNotNew(name)) return { kind: 'skip', reason: 'not_new' }

  const status = str(at(item, 'status', 'type')) ?? ''
  const inStock = status === 'CAN_BUY'
  const price = parsePrice(at(item, 'prices', 'price')) ?? parsePrice(at(item, 'price', 'current'))
  if (price === null) return { kind: 'skip', reason: inStock ? 'no_price' : 'sold_out' }
  if (!inStock) return { kind: 'skip', reason: 'sold_out', detail: status || undefined }

  const old = parsePrice(at(item, 'prices', 'old')) ?? parsePrice(at(item, 'price', 'old'))
  const ratingValue = Number(at(item, 'reviews', 'rating'))
  const reviews = Math.max(0, Math.round(Number(at(item, 'reviews', 'commentsCount')) || 0))

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
      imageUrl: imageOf(item, ref.url),
      price,
      oldPrice: old !== null && old > price ? old : null,
      inStock,
      rating: reviews > 0 && ratingValue > 0 && ratingValue <= 5 ? ratingValue : null,
      reviewCount: reviews,
      raw: { id, name, brand, prices: item['prices'], status, reviews: item['reviews'] },
    },
  }
}

/** Читає сторінку категорії Цитрусу: товари з вбудованого JSON і наступну сторінку */
export function parseCitrusListing(html: string, ref: ListingRef): ListingParse {
  const $ = cheerio.load(html)
  let data: unknown
  try {
    data = JSON.parse($('script#__NEXT_DATA__').first().text() || 'null')
  } catch {
    data = null
  }
  const items = at(data, 'props', 'pageProps', 'data', 'products')
  const outcomes: ParseOutcome[] = []
  const seen = new Set<string>()
  for (const item of Array.isArray(items) ? items.filter(isObj) : []) {
    const outcome = itemToOutcome(item, ref)
    const key = outcome.kind === 'product' ? outcome.product.externalId : null
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    outcomes.push(outcome)
  }

  let nextUrl: string | null = null
  if (worthContinuing(outcomes)) {
    const current = new URL(ref.url)
    const m = current.pathname.match(/^(.*\/)page_(\d+)\/?$/)
    const basePath = m ? (m[1] as string) : current.pathname.endsWith('/') ? current.pathname : `${current.pathname}/`
    const page = m ? Number(m[2]) : 1
    nextUrl = linkedPage($, ref.url, `${basePath}page_${page + 1}/`)
  }
  return { outcomes, nextUrl }
}

export const citrus: ListingScraper = {
  kind: 'listing',
  slug: 'citrus',
  name: 'Цитрус',
  baseUrl: BASE,
  maxPagesPerListing: 40,
  async *listings() {
    for (const c of CITRUS_CATEGORIES) yield { url: `${BASE}${c.path}`, categorySlug: c.slug }
  },
  parseListing: parseCitrusListing,
}
