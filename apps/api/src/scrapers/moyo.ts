import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import { parsePrice } from '../scraping/schema-org'
import type { ListingParse, ListingRef, ListingScraper, ParseOutcome } from '../scraping/types'
import { cleanUrl, intFrom, isNotNew, linkedPage, worthContinuing } from './listing-utils'
import { extractModelCode } from './model-code'

/**
 * MOYO (moyo.ua). Розвідка 9 жовтня 2026 р. показала:
 *  - розмітки schema.org для товарів немає, зате кожна картка в списку має атрибути з даними:
 *    data-id, data-name, data-brand, data-price, data-status-product («В наличии», «Заканчивается»,
 *    «Нет в наличии»; перші два можна купити);
 *  - закреслена ціна: div.product-card_price_oldprice; оцінка: зірочки й кількість відгуків;
 *  - по 24 товари на сторінку, наступна: <link rel="next" href="?page=2">; товари без наявності
 *    (data-price="0", клас not-available) стоять у кінці каталогу;
 *  - robots.txt дозволяє сторінки категорій і ?page=; чужих продавців немає.
 */
export const BASE = 'https://www.moyo.ua'

export const MOYO_CATEGORIES: { path: string; slug: string }[] = [
  { path: '/ua/telecommunication/smart/', slug: 'smartfony' },
  { path: '/ua/tablet_el_knigi/tablet/', slug: 'planshety' },
  { path: '/ua/foto_video/tv_audio/lcd_tv/', slug: 'televizory' },
  { path: '/ua/comp-and-periphery/noutebook_pc/monitors/', slug: 'monitory' },
  { path: '/ua/acsessor/ipod_headphones/', slug: 'navushnyky' },
  { path: '/ua/gadgets/smart_chasy/', slug: 'smart-hodynnyky' },
  { path: '/ua/gadgets/fit_trekery_i_brasl/', slug: 'smart-hodynnyky' },
  { path: '/ua/foto_video/audio/portativnaj_akystika/', slug: 'portatyvna-akustyka' },
  { path: '/ua/foto_video/audio/home_cinema/', slug: 'saundbary' },
  { path: '/ua/game_zone/game_console/', slug: 'ihrovi-konsoli' },
  { path: '/ua/foto_video/photo_video/cameras/', slug: 'fotoaparaty' },
  { path: '/ua/comp-and-periphery/network_equip/routers/', slug: 'routery' },
  { path: '/ua/acsessor/acum/accu_univers/', slug: 'powerbanky' },
  { path: '/ua/tovary_dlya_doma/alternativnaya_energ/port_elektstan/', slug: 'zaryadni-stantsii' },
  { path: '/ua/instrument/stacionarnoe_oborudo/generatoryi/', slug: 'heneratory' },
  { path: '/ua/bt/kbt/stiralnie-mashiny/', slug: 'pralni-mashyny' },
  { path: '/ua/bt/kbt/sushilnie-mashini/', slug: 'sushylni-mashyny' },
  { path: '/ua/bt/kbt/holodilniky/', slug: 'kholodylnyky' },
  { path: '/ua/bt/kbt/morozilniki/', slug: 'morozylni-kamery' },
  { path: '/ua/bt/kbt/posudomoechnie-mashi/', slug: 'posudomyini-mashyny' },
  { path: '/ua/bt/kbt/plity/', slug: 'plyty' },
  { path: '/ua/bt/vstraivaemaya-tekh/vstr-duhovki/', slug: 'dukhovky' },
  { path: '/ua/bt/vstraivaemaya-tekh/poverhnosti/', slug: 'varylni-poverkhni' },
  { path: '/ua/bt/vstraivaemaya-tekh/vytyajki/', slug: 'vytyazhky' },
  { path: '/ua/bt/klimaticheskaya-tekh/vodonagrevately/', slug: 'boilery' },
  { path: '/ua/bt/tekhnika-dlya-kuhni/microvolnovie-pechi/', slug: 'mikrokhvylovi-pechi' },
  { path: '/ua/bt/tekhnika-dlya-kuhni/kofevarki/', slug: 'kavovarky' },
  { path: '/ua/bt/tekhnika-dlya-kuhni/electrochayniki/', slug: 'elektrochainyky' },
  { path: '/ua/bt/tekhnika-dlya-kuhni/blendery/', slug: 'blendery' },
  { path: '/ua/bt/tekhnika-dlya-kuhni/miksery/', slug: 'miksery' },
  { path: '/ua/bt/tekhnika-dlya-kuhni/kuhonnye-kombayni/', slug: 'kukhonni-kombainy' },
  { path: '/ua/bt/tekhnika-dlya-kuhni/multypechi/', slug: 'aerohryli' },
  { path: '/ua/bt/tekhnika-dlya-kuhni/multivarki-parovarki/', slug: 'multivarky' },
  { path: '/ua/bt/tekhnika-dlya-kuhni/elektroplitki/', slug: 'hryli' },
  { path: '/ua/bt/tekhnika-dlya-kuhni/tosteri/', slug: 'tostery' },
  { path: '/ua/bt/tekhnika-dlya-kuhni/sokovijimalki/', slug: 'sokovyzhymalky' },
  { path: '/ua/bt/tekhnika-dlya-kuhni/hlebopechki/', slug: 'khlibopichky' },
  { path: '/ua/bt/mbt/robot_pyle_i_chist/', slug: 'roboty-pylososy' },
  { path: '/ua/bt/mbt/pylesosy/', slug: 'pylososy' },
  { path: '/ua/bt/mbt/utugi/tip_otparivatel/', slug: 'vidparyuvachi' },
  { path: '/ua/bt/mbt/utugi/', slug: 'prasky' },
  { path: '/ua/bt/klimaticheskaya-tekh/kondicionery/', slug: 'kondytsionery' },
  { path: '/ua/bt/klimaticheskaya-tekh/obogrevateli/', slug: 'obihrivachi' },
  { path: '/ua/bt/klimaticheskaya-tekh/ventylatory/', slug: 'ventyliatory' },
  { path: '/ua/bt/klimaticheskaya-tekh/uvlajnitely-vozduha/', slug: 'zvolozhuvachi' },
  { path: '/ua/bt/klimaticheskaya-tekh/ochistiteli_vozduha/', slug: 'ochyshchuvachi' },
  { path: '/ua/bt/tekhnika-lichnogo-po/feni/', slug: 'feny' },
  { path: '/ua/bt/tekhnika-lichnogo-po/elecricheskie-britvi/', slug: 'elektrobrytvy' },
  { path: '/ua/bt/tekhnika-lichnogo-po/trimmer/', slug: 'elektrobrytvy' },
  { path: '/ua/bt/tekhnika-lichnogo-po/elertricheskie_zubni/', slug: 'zubni-shchitky' },
]

/**
 * Статуси, за яких купити не можна. Решта («В наличии», «Заканчивается» тощо) продаються:
 * на таких картках є кнопка «Купити», а не «Повідомити».
 */
const NOT_AVAILABLE = /нет в наличии|немає в наявності|ожидается|очікується|снят|знят|архів|архив/i

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
  const inStock = !card.hasClass('not-available') && !NOT_AVAILABLE.test(status) && card.find('.js-inform').length === 0
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
  maxPagesPerListing: 30,
  async *listings() {
    for (const c of MOYO_CATEGORIES) yield { url: `${BASE}${c.path}`, categorySlug: c.slug }
  },
  parseListing: parseMoyoListing,
}
