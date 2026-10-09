import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildStaticIndex, decodeProduct, encodeProduct, snapshotCompare, snapshotFeed, snapshotProduct, staticCompare, staticFeed, type ApiErrorResponse, type CompareQueryParams, type CompareResponse, type FeedQueryParams, type FeedResponse, type FiltersResponse, type ProductDetailResponse, type RejectedResponse } from '@znyzhky/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedDatabase } from '../prisma/seed/seed-database'
import { buildApp } from './app'
import { buildSnapshot } from './cli/export-snapshot'
import { getCompare } from './services/compare'
import { getFeed } from './services/feed'
import type { PrismaClient } from './generated/prisma/client'
import { REPO_ROOT } from './lib/database-url'
import { createPrisma } from './lib/db'

const TODAY = new Date('2026-10-03T00:00:00Z')
const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let tmpDir: string
let prisma: PrismaClient
let app: FastifyInstance

/** Тимчасова база: застосовуємо справжні міграції, потім сид. Ваша data/app.db не чіпається. */
beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'znyzhky-test-'))
  const url = `file:${tmpDir.replace(/\\/g, '/')}/test.db`
  execFileSync(process.execPath, [path.join(REPO_ROOT, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  })
  prisma = createPrisma(url)
  await seedDatabase(prisma, TODAY)
  app = buildApp({ prisma })
  await app.ready()
}, 90_000)

afterAll(async () => {
  await app?.close()
  await prisma?.$disconnect()
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
})

async function get<T>(url: string): Promise<{ status: number; body: T }> {
  const res = await app.inject({ method: 'GET', url })
  return { status: res.statusCode, body: res.json() as T }
}

const feed = async (query = '') => (await get<FeedResponse>(`/api/feed${query}`)).body
async function productIdByModel(modelCode: string): Promise<number> {
  return (await prisma.product.findFirstOrThrow({ where: { modelCode }, select: { id: true } })).id
}

describe('GET /api/health', () => {
  it('відповідає ok', async () => {
    const r = await get('/api/health')
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ status: 'ok' })
  })
})

describe('GET /api/feed', () => {
  it('за замовчуванням віддає лише справжні знижки, від найкращого скору', async () => {
    const f = await feed('?limit=60')
    expect(f.total).toBe(17)
    expect(f.items).toHaveLength(17)
    const scores = f.items.map((i) => i.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
    expect(f.items.every((i) => i.score > 0 && i.discountPercent >= 5)).toBe(true)
  })

  it('картка містить усе потрібне: ціну, знижку, оцінку, магазини, міні-графік', async () => {
    const [top] = (await feed('?limit=1')).items
    expect(top).toMatchObject({
      name: expect.any(String),
      brand: expect.any(String),
      category: { slug: expect.any(String), name: expect.any(String) },
      bestPrice: expect.any(Number),
      bestShop: { slug: expect.any(String), name: expect.any(String) },
      basePrice: expect.any(Number),
      discountPercent: expect.any(Number),
      discountAmount: expect.any(Number),
      shopsCount: expect.any(Number),
    })
    expect(top?.basePrice).toBeGreaterThan(top?.bestPrice ?? 0)
    expect(top?.discountAmount).toBe((top?.basePrice ?? 0) - (top?.bestPrice ?? 0))
    expect(top?.sparkline).toHaveLength(30)
    // Міні-графік закінчується поточною найкращою ціною й починається зі звичайної
    expect(top?.sparkline.at(-1)).toBe(top?.bestPrice)
    expect(top?.sparkline[0]).toBeGreaterThan(top?.bestPrice ?? 0)
  })

  it('фейкові знижки й товари без знижки у стрічку не потрапляють', async () => {
    const names = (await feed('?limit=60')).items.map((i) => i.name)
    for (const model of ['UE50DU7100UXUA', 'KD-55X75WL', 'XT2347-2', '55U7KQ']) {
      const p = await prisma.product.findFirstOrThrow({ where: { modelCode: model } })
      expect(names).not.toContain(p.name)
    }
  })

  it('пагінація: сторінки не перетинаються й разом дають усі товари', async () => {
    const p1 = await feed('?limit=10&page=1')
    const p2 = await feed('?limit=10&page=2')
    expect(p1.pages).toBe(2)
    expect(p1.items).toHaveLength(10)
    expect(p2.items).toHaveLength(7)
    const ids = [...p1.items, ...p2.items].map((i) => i.id)
    expect(new Set(ids).size).toBe(17)
    expect((await feed('?limit=10&page=3')).items).toHaveLength(0)
  })

  it('фільтр за категорією: листова та батьківська (з підкатегоріями)', async () => {
    const tv = await feed('?category=televizory&limit=60')
    expect(tv.total).toBe(3)
    expect(tv.items.every((i) => i.category.slug === 'televizory')).toBe(true)

    const electronics = await feed('?category=elektronika&limit=60')
    expect(electronics.total).toBe(9)
    expect(new Set(electronics.items.map((i) => i.category.slug))).toEqual(new Set(['televizory', 'noutbuky', 'smartfony']))

    expect((await feed('?category=nonexistent')).total).toBe(0)
  })

  it('фільтр за магазином: товари, що є в наявності у вибраному магазині', async () => {
    const all = (await feed()).total
    const one = await feed('?shop=hama&limit=60')
    expect(one.total).toBeGreaterThan(0)
    expect(one.total).toBeLessThanOrEqual(all)
    for (const item of one.items) {
      const offer = await prisma.offer.findFirst({ where: { productId: item.id, inStock: true, shop: { slug: 'hama' } } })
      expect(offer).not.toBeNull()
    }
    // Кілька магазинів — об'єднання
    const two = await feed('?shop=hama,alfa&limit=60')
    expect(two.total).toBeGreaterThan(one.total)
    expect((await feed('?shop=nonexistent')).total).toBe(0)
  })

  it('фільтри за знижкою, ціною та оцінкою', async () => {
    const deep = await feed('?minDiscount=18&limit=60')
    expect(deep.total).toBeGreaterThan(0)
    expect(deep.total).toBeLessThan(17)
    expect(deep.items.every((i) => i.discountPercent >= 18)).toBe(true)

    const cheap = await feed('?maxPrice=15000&limit=60')
    expect(cheap.total).toBeGreaterThan(0)
    expect(cheap.items.every((i) => i.bestPrice <= 15000)).toBe(true)

    const mid = await feed('?minPrice=10000&maxPrice=20000&limit=60')
    expect(mid.items.every((i) => i.bestPrice >= 10000 && i.bestPrice <= 20000)).toBe(true)

    const rated = await feed('?minRating=4.8&limit=60')
    expect(rated.total).toBeGreaterThan(0)
    expect(rated.items.every((i) => (i.rating ?? 0) >= 4.8)).toBe(true)
  })

  it('фільтри поєднуються', async () => {
    const f = await feed('?category=pobutova-tekhnika&minDiscount=14&maxPrice=20000&limit=60')
    expect(f.items.length).toBeGreaterThan(0)
    for (const i of f.items) {
      expect(['pralni-mashyny', 'kholodylnyky', 'pylososy']).toContain(i.category.slug)
      expect(i.discountPercent).toBeGreaterThanOrEqual(14)
      expect(i.bestPrice).toBeLessThanOrEqual(20000)
    }
  })

  it('сортування: знижка, ціна, популярність, і зворотний порядок', async () => {
    const byDiscount = (await feed('?sort=discount&limit=60')).items.map((i) => i.discountPercent)
    expect(byDiscount).toEqual([...byDiscount].sort((a, b) => b - a))

    const byPrice = (await feed('?sort=price&limit=60')).items.map((i) => i.bestPrice)
    expect(byPrice).toEqual([...byPrice].sort((a, b) => a - b))

    const byPriceDesc = (await feed('?sort=price&order=desc&limit=60')).items.map((i) => i.bestPrice)
    expect(byPriceDesc).toEqual([...byPrice].reverse())

    const byShops = (await feed('?sort=popularity&limit=60')).items.map((i) => i.shopsCount)
    expect(byShops).toEqual([...byShops].sort((a, b) => b - a))
  })

  it('некоректні параметри дають 400 з поясненням', async () => {
    for (const q of ['?limit=1000', '?sort=foo', '?page=0', '?minPrice=500&maxPrice=100', '?minDiscount=abc', '?order=sideways']) {
      const r = await get<ApiErrorResponse>(`/api/feed${q}`)
      expect(r.status, q).toBe(400)
      expect(r.body.error.code).toBe('invalid_request')
      expect(r.body.error.message).toBe('Некоректні параметри запиту')
    }
  })
})

describe('GET /api/compare', () => {
  it('товари з кількох магазинів: ціни від найдешевшої, різниця, «знижка на папері»', async () => {
    const { status, body } = await get<CompareResponse>('/api/compare?limit=60')
    expect(status).toBe(200)
    expect(body.total).toBeGreaterThan(0)
    expect(body.summary.products).toBe(body.total)
    for (const item of body.items) {
      expect(new Set(item.prices.map((p) => p.shop.slug)).size).toBeGreaterThanOrEqual(2)
      expect(item.prices.map((p) => p.price)).toEqual([...item.prices.map((p) => p.price)].sort((a, b) => a - b))
      expect(item.minPrice).toBe(item.prices[0]?.price)
      expect(item.spreadAmount).toBe(item.maxPrice - item.minPrice)
      if (item.paper) {
        // Магазин заявляє знижку, а інший продає не дорожче і без знижки
        expect(item.paper.claimedPercent).toBeGreaterThanOrEqual(10)
        expect(item.paper.plainPrice).toBeLessThanOrEqual(item.paper.price)
        expect(item.paper.plainShop.slug).not.toBe(item.paper.shop.slug)
      }
    }
    // За замовчуванням спершу найбільша різниця цін
    const spreads = body.items.map((i) => i.spreadPercent)
    expect(spreads).toEqual([...spreads].sort((a, b) => b - a))
  })

  it('фільтр «лише знижки на папері» і категорія', async () => {
    const all = (await get<CompareResponse>('/api/compare?limit=60')).body
    const paper = (await get<CompareResponse>('/api/compare?paper=1&sort=paper&limit=60')).body
    expect(paper.total).toBe(all.summary.paper)
    expect(paper.items.every((i) => i.paper !== null)).toBe(true)
    const tv = (await get<CompareResponse>('/api/compare?category=televizory')).body
    expect(tv.items.every((i) => i.category.slug === 'televizory')).toBe(true)
  })

  it('неправильне сортування — помилка 400', async () => {
    expect((await get<ApiErrorResponse>('/api/compare?sort=nope')).status).toBe(400)
  })
})

describe('GET /api/filters', () => {
  it('віддає дерево категорій, магазини, межі цін і варіанти сортування', async () => {
    const { status, body } = await get<FiltersResponse>('/api/filters')
    expect(status).toBe(200)
    expect(body.demo).toBe(true) // сид: вигадані магазини на example.com
    expect(body.categories.map((c) => c.slug)).toEqual(['elektronika', 'pobutova-tekhnika'])
    expect(body.categories.map((c) => c.dealCount)).toEqual([9, 8])
    expect(body.categories[0]?.children.map((c) => c.slug)).toEqual(['televizory', 'noutbuky', 'smartfony'])
    expect(body.shops.map((s) => s.name)).toEqual(['Магазин Альфа', 'Магазин Бета', 'Магазин Гама', 'Магазин Дельта', 'Магазин Епсілон', 'Магазин Зета'])
    expect(body.shops.every((s) => s.dealCount > 0)).toBe(true)
    expect(body.priceRange?.min).toBeLessThan(body.priceRange?.max ?? 0)
    expect(body.maxDiscountPercent).toBeGreaterThan(20)
    expect(body.sortOptions.map((o) => o.value)).toEqual(['score', 'discount', 'price', 'popularity'])
  })
})

describe('GET /api/products/:id', () => {
  it('справжня знижка: пояснення, пропозиції, 90 діб історії', async () => {
    const id = await productIdByModel('QE55Q80DAUXUA')
    const { status, body } = await get<ProductDetailResponse>(`/api/products/${id}`)
    expect(status).toBe(200)
    expect(body.name).toContain('Samsung')
    expect(body.category).toMatchObject({ slug: 'televizory', parent: { slug: 'elektronika' } })

    expect(body.deal?.status).toBe('real')
    expect(body.deal?.reasons.length).toBeGreaterThanOrEqual(2)
    expect(body.deal?.reasons[0]?.text).toContain('нижча за типову ціну')
    expect(body.deal?.min30).toBe(body.deal?.bestPrice)

    // Пропозиції від найдешевшої, найкраща позначена
    const prices = body.offers.filter((o) => o.inStock).map((o) => o.price)
    expect(prices).toEqual([...prices].sort((a, b) => a - b))
    expect(body.offers[0]?.isBest).toBe(true)
    expect(body.offers[0]?.price).toBe(body.deal?.bestPrice)
    expect(body.offers.filter((o) => o.isBest)).toHaveLength(1)
    expect(body.offers[0]?.shop.rating).toBeGreaterThan(0)
    expect(body.offers[0]?.url).toMatch(/^https:\/\//)

    // Історія: до 90 діб, по днях, за зростанням дат, кінець збігається з ціною зараз
    const { market, shops } = body.history
    expect(market.length).toBeGreaterThan(80)
    expect(market.length).toBeLessThanOrEqual(90)
    expect(market[0]?.date ?? '').toBe('2026-07-06')
    expect((market[0]?.date ?? '') < (market.at(-1)?.date ?? '')).toBe(true)
    expect(market.at(-1)).toEqual({ date: '2026-10-03', price: body.deal?.bestPrice })
    expect(shops).toHaveLength(6)
    expect(shops[0]?.points.length).toBeGreaterThan(80)
  })

  it('фейкова знижка: статус fake, причини негативні, видно закреслену ціну магазину', async () => {
    const id = await productIdByModel('UE50DU7100UXUA')
    const { body } = await get<ProductDetailResponse>(`/api/products/${id}`)
    expect(body.deal?.status).toBe('fake')
    expect(body.deal?.score).toBe(0)
    expect(body.deal?.claimedPercent).toBeGreaterThan(10)
    expect(body.deal?.reasons.every((r) => r.tone === 'negative')).toBe(true)
    expect(body.offers.some((o) => o.oldPrice !== null)).toBe(true)
  })

  it('новий товар: замало даних', async () => {
    const id = await productIdByModel('55U7KQ')
    const { body } = await get<ProductDetailResponse>(`/api/products/${id}`)
    expect(body.deal?.status).toBe('insufficient_data')
    expect(body.history.market.length).toBeLessThan(14)
  })

  it('товар без відгуків віддає rating = null', async () => {
    const id = await productIdByModel('CNef 4313')
    const { body } = await get<ProductDetailResponse>(`/api/products/${id}`)
    expect(body.rating).toBeNull()
    expect(body.reviewCount).toBe(0)
  })

  it('неіснуючий або некоректний id', async () => {
    const missing = await get<ApiErrorResponse>('/api/products/999999')
    expect(missing.status).toBe(404)
    expect(missing.body.error.code).toBe('product_not_found')
    expect(missing.body.error.message).toBe('Товар не знайдено')

    for (const bad of ['abc', '0', '-5', '1.5']) {
      expect((await get<ApiErrorResponse>(`/api/products/${bad}`)).status, bad).toBe(400)
    }
  })
})

describe('помилки', () => {
  it('невідома адреса дає 404 у тому ж форматі', async () => {
    const r = await get<ApiErrorResponse>('/api/nothing')
    expect(r.status).toBe(404)
    expect(r.body.error.code).toBe('not_found')
  })

  it('інші HTTP-методи не відкриті', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/feed' })
    expect(res.statusCode).toBe(404)
  })
})

describe('GET /api/rejected', () => {
  it('віддає відсіяні знижки: спершу ті, де магазин обіцяє найбільше', async () => {
    const { status, body } = await get<RejectedResponse>('/api/rejected?limit=60')
    expect(status).toBe(200)
    expect(body.total).toBe(15)
    expect(body.items).toHaveLength(15)

    const claims = body.items.map((i) => i.claimedPercent)
    const claimed = claims.filter((c): c is number => c !== null)
    expect(claimed.length).toBeGreaterThan(8)
    expect(claimed).toEqual([...claimed].sort((a, b) => b - a))
    // Товари без закресленої ціни (нестабільні) — в кінці
    expect(claims.slice(0, claimed.length).every((c) => c !== null)).toBe(true)

    for (const i of body.items) {
      expect(i.discountPercent).toBeLessThan(5)
      expect(i.reasons.length).toBeGreaterThan(0)
      expect(i.reasons.every((r) => r.tone === 'negative')).toBe(true)
      expect(i.sparkline).toHaveLength(30)
    }
  })

  it('обмежує кількість і перевіряє параметр', async () => {
    expect((await get<RejectedResponse>('/api/rejected?limit=3')).body.items).toHaveLength(3)
    expect((await get<ApiErrorResponse>('/api/rejected?limit=0')).status).toBe(400)
  })
})

describe('знімок для сайту без сервера збігається з API', () => {
  const queries: Partial<FeedQueryParams>[] = [
    {},
    { limit: 5, page: 2 },
    { sort: 'discount' },
    { sort: 'price' },
    { sort: 'price', order: 'desc' },
    { sort: 'popularity' },
    { sort: 'popularity', order: 'asc' },
    { category: 'televizory' },
    { category: 'elektronika' },
    { category: 'pobutova-tekhnika', sort: 'discount' },
    { category: 'nonexistent' },
    { shop: ['hama'] },
    { shop: ['alfa', 'delta'], sort: 'price' },
    { shop: ['nonexistent'] },
    { minDiscount: 15 },
    { minPrice: 10000, maxPrice: 30000 },
    { maxPrice: 8000 },
    { minRating: 4.8 },
    { minRating: 4.8, sort: 'popularity', limit: 4 },
    { category: 'smartfony', minDiscount: 10, maxPrice: 25000, sort: 'price' },
    { limit: 7, page: 3, sort: 'discount' },
    { limit: 7, page: 9 },
  ]

  it('на кожному наборі параметрів дає ту саму відповідь, що й база', async () => {
    const snapshot = await buildSnapshot(prisma)
    const index = JSON.parse(JSON.stringify(buildStaticIndex(snapshot))) as ReturnType<typeof buildStaticIndex>
    for (const partial of queries) {
      const q: FeedQueryParams = { sort: 'score', page: 1, limit: 24, ...partial }
      const viaDb = await getFeed(prisma, q)
      expect(snapshotFeed(snapshot, q), JSON.stringify(partial)).toEqual(viaDb)
      expect(staticFeed(index, q), `файли: ${JSON.stringify(partial)}`).toEqual(viaDb)
    }
  })

  it('порівняння цін збігається з API на різних параметрах', async () => {
    const snapshot = await buildSnapshot(prisma)
    const index = JSON.parse(JSON.stringify(buildStaticIndex(snapshot))) as ReturnType<typeof buildStaticIndex>
    const variants: Partial<CompareQueryParams>[] = [
      {},
      { sort: 'paper' },
      { sort: 'shops', limit: 5, page: 2 },
      { sort: 'price', category: 'elektronika' },
      { category: 'televizory', paperOnly: true },
      { category: 'nonexistent' },
    ]
    for (const partial of variants) {
      const q: CompareQueryParams = { sort: 'spread', page: 1, limit: 24, ...partial }
      const viaDb = await getCompare(prisma, q)
      expect(snapshotCompare(snapshot, q), JSON.stringify(partial)).toEqual(viaDb)
      expect(staticCompare(index, q), `файли: ${JSON.stringify(partial)}`).toEqual(viaDb)
    }
  })

  it('сторінки товарів збігаються з API', async () => {
    const snapshot = await buildSnapshot(prisma)
    for (const model of ['QE55Q80DAUXUA', 'UE50DU7100UXUA', '55U7KQ']) {
      const id = await productIdByModel(model)
      const viaApi = (await get<ProductDetailResponse>(`/api/products/${id}`)).body
      expect(snapshotProduct(snapshot, id)).toEqual(viaApi)
      // Сайт без сервера зберігає історію стисло; після розпакування сторінка та сама
      const stored = JSON.parse(JSON.stringify(encodeProduct(snapshotProduct(snapshot, id) as ProductDetailResponse)))
      expect(decodeProduct(stored)).toEqual(viaApi)
    }
    expect(snapshotProduct(snapshot, 999_999)).toBeNull()
  })
})
