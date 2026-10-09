import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PrismaClient } from '../generated/prisma/client'
import { createTempDb } from '../test-utils/temp-db'
import { FetchError, type Fetcher } from './fetcher'
import { parseProductPage } from './from-schema-org'
import { runScraper } from './runner'
import type { PageScraper, ProductRef, ShopScraper } from './types'

const DAY1 = new Date('2026-10-03T00:00:00Z')
const DAY2 = new Date('2026-10-04T00:00:00Z')

interface PageSpec {
  sku: string
  name?: string
  brand?: string
  price?: number
  ean?: string
  seller?: string
  inStock?: boolean
  currency?: string
}

function page(s: PageSpec): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify({
    '@type': 'Product',
    name: s.name ?? `Товар ${s.sku}`,
    sku: s.sku,
    brand: s.brand ?? 'Bosch',
    ...(s.ean ? { gtin13: s.ean } : {}),
    aggregateRating: { ratingValue: 4.6, reviewCount: 120 },
    offers: { price: s.price ?? 10000, priceCurrency: s.currency ?? 'UAH', availability: s.inStock === false ? 'OutOfStock' : 'InStock', ...(s.seller ? { seller: { name: s.seller } } : {}) },
  })}</script></head></html>`
}

type Reply = string | number | Error

/** Підроблений сайт: адреса → вміст сторінки, код помилки або збій мережі; веде журнал запитів */
function site(pages: Record<string, Reply>) {
  const requested: string[] = []
  const fetcher: Fetcher = {
    async get(url) {
      requested.push(url)
      const r = pages[url]
      if (r instanceof Error) throw r
      if (r === undefined) return { url, status: 404, body: '', fromCache: false }
      return typeof r === 'number' ? { url, status: r, body: '', fromCache: false } : { url, status: 200, body: r, fromCache: false }
    },
  }
  return { fetcher, requested }
}

function shopOf(slug: string, urls: Array<string | ProductRef>, parseOpts: Parameters<typeof parseProductPage>[2] = {}): PageScraper {
  return {
    slug,
    name: `Магазин ${slug}`,
    baseUrl: `https://${slug}.example`,
    async *discover() {
      for (const u of urls) yield typeof u === 'string' ? { url: u, categorySlug: 'televizory' } : u
    },
    parse: (html, ref) => parseProductPage(html, ref, parseOpts),
  }
}

let prisma: PrismaClient
let cleanup: () => Promise<void>

beforeAll(async () => {
  const db = createTempDb()
  prisma = db.prisma
  cleanup = db.cleanup
  await prisma.category.create({ data: { slug: 'televizory', name: 'Телевізори' } })
}, 90_000)
afterAll(async () => cleanup?.())

beforeEach(async () => {
  await prisma.scrapeError.deleteMany()
  await prisma.scrapeRun.deleteMany()
  await prisma.pricePoint.deleteMany()
  await prisma.offer.deleteMany()
  await prisma.product.deleteMany()
  await prisma.shop.deleteMany()
})

const u = (shop: string, n: number | string) => `https://${shop}.example/p/${n}`

describe('runScraper: звичайний збір', () => {
  it('створює магазин, товари, пропозиції, історію цін і запис про запуск', async () => {
    const { fetcher } = site({ [u('a', 1)]: page({ sku: 'A1', price: 12499, ean: '4006381333931' }), [u('a', 2)]: page({ sku: 'A2', price: 4599, inStock: false }) })
    const s = await runScraper(prisma, shopOf('a', [u('a', 1), u('a', 2)]), fetcher, { today: DAY1 })

    expect(s).toMatchObject({ status: 'completed', found: 2, saved: 2, skipped: 0, errors: 0 })
    const shop = await prisma.shop.findUniqueOrThrow({ where: { slug: 'a' } })
    expect(shop).toMatchObject({ name: 'Магазин a', baseUrl: 'https://a.example', isActive: true })

    const offers = await prisma.offer.findMany({ where: { shopId: shop.id }, orderBy: { externalId: 'asc' } })
    expect(offers.map((o) => [o.externalId, o.price, o.inStock])).toEqual([['A1', 12499, true], ['A2', 4599, false]])
    expect(JSON.parse(offers[0]?.rawData ?? '{}')).toHaveProperty('raw')

    const points = await prisma.pricePoint.findMany({ where: { shopId: shop.id } })
    expect(points).toHaveLength(2)
    expect(points.every((p) => p.date.getTime() === DAY1.getTime())).toBe(true)

    const product = await prisma.product.findFirstOrThrow({ where: { ean: '4006381333931' }, include: { category: true } })
    expect(product).toMatchObject({ brand: 'Bosch', ratingAvg: 4.6, reviewCount: 120 })
    expect(product.category.slug).toBe('televizory')

    const run = await prisma.scrapeRun.findFirstOrThrow({ where: { shopId: shop.id } })
    expect(run).toMatchObject({ status: 'completed', productsFound: 2, productsSaved: 2, errorsCount: 0 })
    expect(run.finishedAt).not.toBeNull()
  })

  it('наступного дня оновлює ціну й додає точку в історію, не дублюючи товар', async () => {
    const shop = shopOf('a', [u('a', 1)])
    await runScraper(prisma, shop, site({ [u('a', 1)]: page({ sku: 'A1', price: 10000 }) }).fetcher, { today: DAY1 })
    await runScraper(prisma, shop, site({ [u('a', 1)]: page({ sku: 'A1', price: 8500 }) }).fetcher, { today: DAY2 })

    expect(await prisma.product.count()).toBe(1)
    expect((await prisma.offer.findFirstOrThrow()).price).toBe(8500)
    const points = await prisma.pricePoint.findMany({ orderBy: { date: 'asc' } })
    expect(points.map((p) => p.price)).toEqual([10000, 8500])
  })

  it('повторний запуск за ту саму добу перезаписує сьогоднішню ціну', async () => {
    const shop = shopOf('a', [u('a', 1)])
    await runScraper(prisma, shop, site({ [u('a', 1)]: page({ sku: 'A1', price: 10000 }) }).fetcher, { today: DAY1 })
    await runScraper(prisma, shop, site({ [u('a', 1)]: page({ sku: 'A1', price: 9900 }) }).fetcher, { today: DAY1 })
    const points = await prisma.pricePoint.findMany()
    expect(points).toHaveLength(1)
    expect(points[0]?.price).toBe(9900)
  })

  it('той самий товар у двох магазинах з однаковим штрихкодом стає одним товаром з двома пропозиціями', async () => {
    const ean = '4006381333931'
    await runScraper(prisma, shopOf('a', [u('a', 1)]), site({ [u('a', 1)]: page({ sku: 'A1', price: 10000, ean }) }).fetcher, { today: DAY1 })
    await runScraper(prisma, shopOf('b', [u('b', 1)]), site({ [u('b', 1)]: page({ sku: 'B9', price: 9800, ean, name: 'Інша назва' }) }).fetcher, { today: DAY1 })
    expect(await prisma.product.count()).toBe(1)
    expect(await prisma.offer.count()).toBe(2)
    expect((await prisma.product.findFirstOrThrow()).name).toBe('Товар A1')
  })
})

describe('runScraper: чужі продавці й дані, яких бракує', () => {
  it('пропускає чужих продавців маркетплейсу й рахує причини пропуску', async () => {
    const { fetcher } = site({
      [u('a', 1)]: page({ sku: 'A1', seller: 'Магазин a' }),
      [u('a', 2)]: page({ sku: 'A2', seller: 'ТОВ Сторонній' }),
      [u('a', 3)]: page({ sku: 'A3', currency: 'USD' }),
      [u('a', 4)]: '<html>без розмітки</html>',
    })
    const s = await runScraper(prisma, shopOf('a', [1, 2, 3, 4].map((n) => u('a', n)), { ownSellerNames: ['Магазин a'] }), fetcher, { today: DAY1 })
    expect(s).toMatchObject({ found: 1, saved: 1, skipped: 3, skippedByReason: { third_party_seller: 1, wrong_currency: 1, not_a_product: 1 } })
    expect(await prisma.offer.count()).toBe(1)
  })

  it('404 і 410 це «товару вже немає», а не помилка', async () => {
    const { fetcher } = site({ [u('a', 1)]: 404, [u('a', 2)]: 410, [u('a', 3)]: page({ sku: 'A3' }) })
    const s = await runScraper(prisma, shopOf('a', [1, 2, 3].map((n) => u('a', n))), fetcher, { today: DAY1 })
    expect(s).toMatchObject({ status: 'completed', saved: 1, errors: 0, skippedByReason: { gone: 2 } })
  })
})

describe('runScraper: збої', () => {
  it('помилка однієї сторінки потрапляє в журнал, решта зберігається', async () => {
    const { fetcher } = site({ [u('a', 1)]: page({ sku: 'A1' }), [u('a', 2)]: 500, [u('a', 3)]: new FetchError('network', 'ECONNRESET'), [u('a', 4)]: page({ sku: 'A4' }) })
    const s = await runScraper(prisma, shopOf('a', [1, 2, 3, 4].map((n) => u('a', n))), fetcher, { today: DAY1 })
    expect(s).toMatchObject({ status: 'completed_with_errors', saved: 2, errors: 2 })

    const errors = await prisma.scrapeError.findMany({ orderBy: { id: 'asc' } })
    expect(errors.map((e) => [e.kind, e.url, e.message])).toEqual([
      ['fetch', u('a', 2), 'HTTP 500'],
      ['fetch', u('a', 3), 'ECONNRESET'],
    ])
    expect((await prisma.scrapeRun.findFirstOrThrow()).errorsCount).toBe(2)
  })

  it('забороні robots.txt дає окремий тип помилки', async () => {
    const { fetcher } = site({ [u('a', 1)]: new FetchError('robots', 'robots.txt забороняє') })
    await runScraper(prisma, shopOf('a', [u('a', 1)]), fetcher, { today: DAY1 })
    expect((await prisma.scrapeError.findFirstOrThrow()).kind).toBe('robots')
  })

  it('зупиняється, коли сайт відмовляє багато разів поспіль, і не довбе його далі', async () => {
    const urls = Array.from({ length: 20 }, (_, i) => u('a', i))
    const { fetcher, requested } = site(Object.fromEntries(urls.map((x) => [x, 403])))
    const s = await runScraper(prisma, shopOf('a', urls), fetcher, { today: DAY1, maxConsecutiveFailures: 4 })

    expect(s.status).toBe('aborted')
    expect(requested).toHaveLength(4)
    expect(s.note).toContain('4 невдалих завантажень поспіль')
    const run = await prisma.scrapeRun.findFirstOrThrow()
    expect(run).toMatchObject({ status: 'aborted', errorsCount: 4 })
  })

  it('успішне завантаження обнуляє лічильник невдач', async () => {
    const urls = [1, 2, 3, 4, 5, 6].map((n) => u('a', n))
    const { fetcher } = site({ [urls[0] as string]: 500, [urls[1] as string]: 500, [urls[2] as string]: page({ sku: 'OK' }), [urls[3] as string]: 500, [urls[4] as string]: 500, [urls[5] as string]: page({ sku: 'OK2' }) })
    const s = await runScraper(prisma, shopOf('a', urls), fetcher, { today: DAY1, maxConsecutiveFailures: 3 })
    expect(s.status).toBe('completed_with_errors')
    expect(s.saved).toBe(2)
  })

  it('збій пошуку сторінок (напр. sitemap) завершує запуск зі зрозумілою приміткою', async () => {
    const broken: ShopScraper = { ...shopOf('a', []), async *discover() { throw new FetchError('network', 'sitemap недоступний') } }
    const s = await runScraper(prisma, broken, site({}).fetcher, { today: DAY1 })
    expect(s.status).toBe('aborted')
    expect(s.note).toContain('sitemap недоступний')
    expect((await prisma.scrapeError.findFirstOrThrow()).kind).toBe('fetch')
  })

  it('виняток у розборі однієї сторінки не зупиняє запуск', async () => {
    const shop: ShopScraper = { ...shopOf('a', [u('a', 1), u('a', 2)]), parse: (html, ref) => { if (ref.url.endsWith('/1')) throw new Error('зламався селектор'); return parseProductPage(html, ref) } }
    const s = await runScraper(prisma, shop, site({ [u('a', 1)]: page({ sku: 'A1' }), [u('a', 2)]: page({ sku: 'A2' }) }).fetcher, { today: DAY1 })
    expect(s).toMatchObject({ saved: 1, errors: 1 })
    expect((await prisma.scrapeError.findFirstOrThrow()).kind).toBe('parse')
  })
})

describe('runScraper: захист даних', () => {
  it('не записує різкий стрибок ціни (імовірна помилка розбору) і залишає стару', async () => {
    const shop = shopOf('a', [u('a', 1)])
    await runScraper(prisma, shop, site({ [u('a', 1)]: page({ sku: 'A1', price: 12000 }) }).fetcher, { today: DAY1 })
    const s = await runScraper(prisma, shop, site({ [u('a', 1)]: page({ sku: 'A1', price: 120 }) }).fetcher, { today: DAY2 })

    expect(s).toMatchObject({ status: 'completed_with_errors', saved: 0, errors: 1 })
    expect((await prisma.scrapeError.findFirstOrThrow()).kind).toBe('suspicious_price')
    expect((await prisma.offer.findFirstOrThrow()).price).toBe(12000)
    expect(await prisma.pricePoint.count()).toBe(1)
  })

  it('товар у невідомій категорії не створюється, помилка пояснює чому', async () => {
    const s = await runScraper(prisma, shopOf('a', [{ url: u('a', 1), categorySlug: 'невідома' }]), site({ [u('a', 1)]: page({ sku: 'A1' }) }).fetcher, { today: DAY1 })
    expect(s.errors).toBe(1)
    expect((await prisma.scrapeError.findFirstOrThrow()).message).toContain('Невідома категорія')
    expect(await prisma.product.count()).toBe(0)
  })

  it('ліміт сторінок для пробних запусків', async () => {
    const urls = [1, 2, 3, 4, 5].map((n) => u('a', n))
    const { fetcher, requested } = site(Object.fromEntries(urls.map((x, i) => [x, page({ sku: `A${i}` })])))
    const s = await runScraper(prisma, shopOf('a', urls), fetcher, { today: DAY1, maxProducts: 2 })
    expect(s.saved).toBe(2)
    expect(requested).toHaveLength(2)
  })

  it('пробний запуск нічого не пише в базу, але показує, що було б збережено', async () => {
    const { fetcher } = site({ [u('a', 1)]: page({ sku: 'A1', price: 5000 }) })
    const s = await runScraper(prisma, shopOf('a', [u('a', 1)]), fetcher, { today: DAY1, dryRun: true })
    expect(s.runId).toBeNull()
    expect(s.products.map((p) => [p.externalId, p.price])).toEqual([['A1', 5000]])
    expect(await prisma.shop.count()).toBe(0)
    expect(await prisma.product.count()).toBe(0)
    expect(await prisma.scrapeRun.count()).toBe(0)
  })
})
