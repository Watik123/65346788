import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import { parsePrice } from '../scraping/schema-org'
import type { ListingParse, ListingRef, ListingScraper, ParseOutcome } from '../scraping/types'
import { cleanUrl, intFrom, isNotNew, linkedPage, worthContinuing } from './listing-utils'
import { extractModelCode } from './model-code'

/**
 * Ябко (jabko.ua). Розвідка 9 жовтня 2026 р. показала:
 *  - картки .catalog-product-item; посилання-назва має атрибути data-id, data-name, data-brand, data-price;
 *  - ціни в гривнях: .catalog-product-item--set.has-price → span.current і закреслена span.old
 *    (поруч є прихований блок з цінами в доларах, його не беремо);
 *  - товар без наявності: блок .no-price з кнопкою «Немає в наявності»; такі й вживані (б/у) стоять у кінці;
 *  - по 24–27 товарів на сторінку, наступна: <link rel="next" href="?page=2">; robots.txt дозволяє каталог.
 */
export const BASE = 'https://jabko.ua'

export const JABKO_CATEGORIES: { path: string; slug: string }[] = [
  { path: '/televizory/', slug: 'televizory' },
  { path: '/noutbuki/', slug: 'noutbuky' },
  { path: '/smartfony/', slug: 'smartfony' },
  { path: '/pylososy/', slug: 'pylososy' },
  { path: '/roboti-pilesosi/', slug: 'pylososy' },
  { path: '/akkumuljatornie-pilesosi/', slug: 'pylososy' },
]

function cardToOutcome(card: cheerio.Cheerio<AnyNode>, ref: ListingRef): ParseOutcome {
  const title = card.find('a.catalog-product-item--title').first()
  const id = title.attr('data-id')?.trim()
  const name = (title.attr('data-name') ?? title.text()).replace(/\s+/g, ' ').trim()
  const brand = (title.attr('data-brand') ?? '').trim()
  const url = cleanUrl(title.attr('href'), ref.url)
  if (!id || !name || !url) return { kind: 'skip', reason: 'missing_data', detail: !id ? 'немає коду' : !name ? 'немає назви' : 'немає адреси' }
  if (!brand) return { kind: 'skip', reason: 'missing_data', detail: 'немає бренду' }
  if (isNotNew(name)) return { kind: 'skip', reason: 'not_new' }

  const priced = card.find('.catalog-product-item--set.has-price').first()
  const inStock = priced.length > 0 && priced.find('button.add-to-cart:not([disabled])').length > 0
  const price = parsePrice(priced.find('.catalog-product-item--price .current').first().text()) ?? parsePrice(title.attr('data-price') ?? '')
  if (price === null) return { kind: 'skip', reason: inStock ? 'no_price' : 'sold_out' }
  if (!inStock) return { kind: 'skip', reason: 'sold_out' }

  const old = parsePrice(priced.find('.catalog-product-item--price .old').first().text())
  const reviews = intFrom(card.find('.catalog-product-item--count').first().text()) ?? 0

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
      imageUrl: card.find('.catalog-product-item--img-wrap img').first().attr('src') ?? null,
      price,
      oldPrice: old !== null && old > price ? old : null,
      inStock,
      // Зірки на картці малюються без числа, тож оцінку не беремо; кількість відгуків є
      rating: null,
      reviewCount: reviews,
      raw: { id, name, brand, price, old, reviews },
    },
  }
}

/** Читає сторінку категорії Ябка: картки товарів і наступну сторінку */
export function parseJabkoListing(html: string, ref: ListingRef): ListingParse {
  const $ = cheerio.load(html)
  const outcomes: ParseOutcome[] = []
  const seen = new Set<string>()
  $('.catalog-product-item').each((_, el) => {
    const outcome = cardToOutcome($(el), ref)
    const key = outcome.kind === 'product' ? outcome.product.externalId : null
    if (key && seen.has(key)) return
    if (key) seen.add(key)
    outcomes.push(outcome)
  })

  let nextUrl: string | null = null
  // У кінці каталогу лише продані й вживані: далі товарів у продажу немає
  if (worthContinuing(outcomes, ['sold_out', 'not_new'])) {
    const current = new URL(ref.url)
    const rel = $('link[rel="next"]').attr('href')
    const page = Number(current.searchParams.get('page') ?? '1') || 1
    const next = linkedPage($, ref.url, rel ?? `${current.pathname}?page=${page + 1}`)
    if (next && new URL(next).pathname === current.pathname && next !== ref.url) nextUrl = next
  }
  return { outcomes, nextUrl }
}

export const jabko: ListingScraper = {
  kind: 'listing',
  slug: 'jabko',
  name: 'Ябко',
  baseUrl: BASE,
  maxPagesPerListing: 60,
  async *listings() {
    for (const c of JABKO_CATEGORIES) yield { url: `${BASE}${c.path}`, categorySlug: c.slug }
  },
  parseListing: parseJabkoListing,
}
