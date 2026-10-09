import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureCategories } from '../catalog/categories'
import type { PrismaClient } from '../generated/prisma/client'
import { ingestProduct } from '../scraping/ingest'
import type { ParsedProduct } from '../scraping/types'
import { createTempDb } from '../test-utils/temp-db'
import { CandidateIndex } from './candidates'
import { MatchDecisions, appendDecision, readDecisions } from './decisions'
import { mergeProducts } from './merge'

const DAY = new Date('2026-10-05T00:00:00Z')

function product(p: Partial<ParsedProduct> & Pick<ParsedProduct, 'externalId' | 'name'>): ParsedProduct {
  return {
    url: `https://shop.example/${p.externalId}`,
    brand: 'Samsung',
    modelCode: null,
    ean: null,
    categorySlug: 'smartfony',
    imageUrl: null,
    price: 30000,
    oldPrice: null,
    inStock: true,
    rating: null,
    reviewCount: 0,
    raw: null,
    ...p,
  }
}

let db: ReturnType<typeof createTempDb>
let prisma: PrismaClient
let categoryIds: Map<string, number>
let shopA: number
let shopB: number

beforeAll(() => {
  db = createTempDb()
  prisma = db.prisma
})
afterAll(() => db.cleanup())

beforeEach(async () => {
  await prisma.matchReview.deleteMany()
  await prisma.pricePoint.deleteMany()
  await prisma.offer.deleteMany()
  await prisma.product.deleteMany()
  await prisma.shop.deleteMany()
  categoryIds = await ensureCategories(prisma)
  shopA = (await prisma.shop.create({ data: { slug: 'a', name: 'А', baseUrl: 'https://a.example' } })).id
  shopB = (await prisma.shop.create({ data: { slug: 'b', name: 'Б', baseUrl: 'https://b.example' } })).id
})

const ingest = (shopId: number, slug: string, p: ParsedProduct, decisions?: MatchDecisions) =>
  ingestProduct(prisma, shopId, p, DAY, categoryIds, { now: DAY, shopSlug: slug, decisions })

describe('зіставлення під час запису', () => {
  it('той самий бренд і код моделі в іншому магазині: один товар з двома пропозиціями', async () => {
    const a = await ingest(shopA, 'a', product({ externalId: '1', name: 'Смартфон Samsung Galaxy A27 5G 8/256GB Black (SM-A276BZKCEUC)', modelCode: 'SM-A276BZKCEUC' }))
    const b = await ingest(shopB, 'b', product({ externalId: 'x9', name: 'Samsung Galaxy A27 8/256 Чорний SM-A276BZKCEUC', price: 29500 }))
    expect(a.matchedBy).toBe('new')
    expect(b).toMatchObject({ action: 'updated', productId: a.productId, matchedBy: 'model' })
    expect(await prisma.offer.count({ where: { productId: a.productId } })).toBe(2)
  })

  it('однаковий штрихкод: той самий товар, навіть з іншою назвою', async () => {
    const a = await ingest(shopA, 'a', product({ externalId: '1', name: 'Телевізор LG 55"', brand: 'LG', categorySlug: 'televizory', ean: '8806091234567' }))
    const b = await ingest(shopB, 'b', product({ externalId: '2', name: 'LG 55 4K', brand: 'LG', categorySlug: 'televizory', ean: '8806091234567' }))
    expect(b).toMatchObject({ productId: a.productId, matchedBy: 'ean' })
  })

  it('інша пам\'ять: різні товари, а не одна пропозиція', async () => {
    const a = await ingest(shopA, 'a', product({ externalId: '1', name: 'Samsung Galaxy S26 12/256GB Black (SM-S942B)', modelCode: 'SM-S942B' }))
    const b = await ingest(shopB, 'b', product({ externalId: '2', name: 'Samsung Galaxy S26 12/512GB Black (SM-S942B)', modelCode: 'SM-S942B' }))
    expect(b.productId).not.toBe(a.productId)
    expect(await prisma.matchReview.count()).toBe(0)
  })

  it('спірна пара: окремий товар і запис на ручну перевірку', async () => {
    const a = await ingest(shopA, 'a', product({ externalId: '1', name: 'Samsung Galaxy S26 Ultra 12/512GB (SM-S948B)' }))
    const b = await ingest(shopB, 'b', product({ externalId: '2', name: 'Samsung Galaxy S26 Ultra 12/512GB (SM-S948BZKGEUC)' }))
    expect(b).toMatchObject({ matchedBy: 'new' })
    expect(b.productId).not.toBe(a.productId)
    const review = await prisma.matchReview.findFirstOrThrow()
    expect(review).toMatchObject({ productId: b.productId, candidateId: a.productId, status: 'pending' })
    expect(JSON.parse(review.reasons)).toEqual(expect.arrayContaining([expect.stringMatching(/код/)]))
  })

  it('товари того самого магазину не зливаються між собою', async () => {
    const a1 = await ingest(shopA, 'a', product({ externalId: '1', name: 'Samsung Galaxy A27 8/256GB Black (SM-A276BZKCEUC)' }))
    const a2 = await ingest(shopA, 'a', product({ externalId: '2', name: 'Samsung Galaxy A27 8/256GB Black (SM-A276BZKCEUC)' }))
    expect(a2.productId).not.toBe(a1.productId)
  })

  it('рішення людини: «той самий» з\'єднує, «різні» забороняє збіг за кодом', async () => {
    const a = await ingest(shopA, 'a', product({ externalId: '1', name: 'Samsung Galaxy S26 Ultra 12/512GB (SM-S948B)' }))
    const same = new MatchDecisions([{ a: 'a:1', b: 'b:2', decision: 'same', at: '' }])
    expect(await ingest(shopB, 'b', product({ externalId: '2', name: 'Galaxy S26 Ultra' }), same)).toMatchObject({ productId: a.productId, matchedBy: 'decision' })

    const c = await ingest(shopA, 'a', product({ externalId: '3', name: 'Samsung Galaxy A57 8/256GB (SM-A576B)' }))
    const different = new MatchDecisions([{ a: 'a:3', b: 'b:4', decision: 'different', at: '' }])
    const d = await ingest(shopB, 'b', product({ externalId: '4', name: 'Samsung Galaxy A57 8/256GB (SM-A576B)' }), different)
    expect(d.productId).not.toBe(c.productId)
  })

  it('наступна поява вже відомої пропозиції не шукає збігів удруге', async () => {
    const a = await ingest(shopA, 'a', product({ externalId: '1', name: 'Samsung Galaxy S26 Ultra 12/512GB (SM-S948B)' }))
    const b = await ingest(shopB, 'b', product({ externalId: '2', name: 'Samsung Galaxy S26 Ultra 12/512GB (SM-S948BZKGEUC)' }))
    const again = await ingestProduct(prisma, shopB, product({ externalId: '2', name: 'Samsung Galaxy S26 Ultra 12/512GB (SM-S948BZKGEUC)' }), new Date('2026-10-06T00:00:00Z'), categoryIds, { shopSlug: 'b' })
    expect(again).toMatchObject({ productId: b.productId, matchedBy: 'offer' })
    expect(again.productId).not.toBe(a.productId)
    expect(await prisma.matchReview.count()).toBe(1)
  })
})

describe('спільний індекс кандидатів (імпорт, збір)', () => {
  it('бачить щойно записані товари й магазини, а дописаний код моделі враховує', async () => {
    const candidates = new CandidateIndex()
    const shopC = (await prisma.shop.create({ data: { slug: 'c', name: 'В', baseUrl: 'https://c.example' } })).id
    const put = (shopId: number, slug: string, p: ParsedProduct) => ingestProduct(prisma, shopId, p, DAY, categoryIds, { now: DAY, shopSlug: slug, candidates })

    const a = await put(shopA, 'a', product({ externalId: '1', name: 'Samsung Galaxy A27 8/256GB Black' }))
    const b = await put(shopB, 'b', product({ externalId: '2', name: 'Samsung Galaxy A27 8/256GB Black', modelCode: 'SM-A276B' }))
    expect(b).toMatchObject({ productId: a.productId, matchedBy: 'model' })
    // Товар уже є в магазині Б: другий такий самий запис Б не зливається з ним
    expect((await put(shopB, 'b', product({ externalId: '3', name: 'Samsung Galaxy A27 8/256GB Black' }))).productId).not.toBe(a.productId)
    // Код моделі товар отримав від Б: магазин В з іншою назвою, але тим самим кодом, знаходить його
    expect(await put(shopC, 'c', product({ externalId: '4', name: 'Смартфон Samsung A27 (SM-A276B) 8/256 Чорний' }))).toMatchObject({ productId: a.productId, matchedBy: 'model' })
  })
})

describe('mergeProducts', () => {
  it('переносить пропозиції та історію цін, доповнює поля, видаляє зайвий товар', async () => {
    const a = await ingest(shopA, 'a', product({ externalId: '1', name: 'Samsung Galaxy S26 Ultra 12/512GB (SM-S948B)' }))
    const b = await ingest(shopB, 'b', product({ externalId: '2', name: 'Samsung Galaxy S26 Ultra 12/512GB (SM-S948BZKGEUC)', ean: '8806095000001', imageUrl: 'https://b.example/i.jpg' }))
    await mergeProducts(prisma, b.productId, a.productId)
    const merged = await prisma.product.findUniqueOrThrow({ where: { id: a.productId }, include: { offers: true, pricePoints: true } })
    expect(merged.offers).toHaveLength(2)
    expect(merged.pricePoints).toHaveLength(2)
    expect(merged).toMatchObject({ ean: '8806095000001', imageUrl: 'https://b.example/i.jpg' })
    expect(await prisma.product.findUnique({ where: { id: b.productId } })).toBeNull()
    expect(await prisma.matchReview.count()).toBe(0) // спірна пара зникла разом із товаром
  })

  it('не зливає товари, що мають пропозиції одного магазину', async () => {
    const a1 = await ingest(shopA, 'a', product({ externalId: '1', name: 'Samsung Galaxy A27 8/256GB (SM-A276B)' }))
    const a2 = await ingest(shopA, 'a', product({ externalId: '2', name: 'Samsung Galaxy A27 8/128GB (SM-A276B)' }))
    await expect(mergeProducts(prisma, a2.productId, a1.productId)).rejects.toThrow(/одного магазину/)
  })
})

describe('файл рішень', () => {
  it('дописує рядки й читає їх назад; пізніше рішення переважує', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'znyzhky-decisions-'))
    try {
      appendDecision(dir, { a: 'a:1', b: 'b:2', decision: 'same' })
      appendDecision(dir, { a: 'b:2', b: 'a:1', decision: 'different' })
      const records = readDecisions(dir)
      expect(records).toHaveLength(2)
      const d = new MatchDecisions(records)
      expect(d.sameAs('a:1')).toEqual([])
      expect(d.differentFrom('a:1').has('b:2')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
