import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { importDataStore } from '../cli/data-import'
import { CATEGORIES } from '../catalog/categories'
import type { PrismaClient } from '../generated/prisma/client'
import { createTempDb } from '../test-utils/temp-db'
import { recomputeDeals } from '../jobs/recompute-deals'
import { fromRecord, listDayFiles, parseJsonl, toRecord, writeJson, writeJsonl, type DayRecord } from './datastore'
import type { ParsedProduct } from './types'

const product = (over: Partial<ParsedProduct> = {}): ParsedProduct => ({
  externalId: '447594',
  url: 'https://shop.example/goods/tv.html',
  name: 'Телевізор Xiaomi TV A Pro 32',
  brand: 'Xiaomi',
  modelCode: 'L32MB-APME',
  ean: null,
  categorySlug: 'televizory',
  imageUrl: null,
  price: 7999,
  oldPrice: 9999,
  inStock: true,
  rating: 5,
  reviewCount: 1,
  raw: { великі: 'сирі дані' },
  ...over,
})

let dir: string
beforeEach(() => void (dir = mkdtempSync(path.join(os.tmpdir(), 'store-test-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('формат щоденних файлів', () => {
  it('туди й назад без втрат, але без сирих даних', () => {
    const r = toRecord(product(), 'ktc', '2026-10-09')
    expect(r).toMatchObject({ v: 1, date: '2026-10-09', shop: 'ktc', category: 'televizory', price: 7999, oldPrice: 9999 })
    expect(JSON.stringify(r)).not.toContain('сирі дані')
    expect(fromRecord(r)).toEqual({ ...product(), raw: null })
  })

  it('пошкоджені й неповні рядки рахуються, але не валять файл', () => {
    const good = JSON.stringify(toRecord(product(), 'ktc', '2026-10-09'))
    const bad = [
      'не json',
      JSON.stringify({ ...JSON.parse(good), price: -5 }),
      JSON.stringify({ ...JSON.parse(good), price: 79.5 }),
      JSON.stringify({ ...JSON.parse(good), date: '9 жовтня' }),
      JSON.stringify({ ...JSON.parse(good), v: 2 }),
    ]
    const { records, invalid } = parseJsonl([good, ...bad, '', good].join('\n'))
    expect(records).toHaveLength(2)
    expect(invalid).toBe(5)
  })

  it('перелічує файли від старих до нових і ігнорує сторонні', () => {
    writeJsonl(path.join(dir, 'prices/2026-10-10/ktc.jsonl'), [])
    writeJsonl(path.join(dir, 'prices/2026-10-09/zeta.jsonl'), [])
    writeJsonl(path.join(dir, 'prices/2026-10-09/ktc.jsonl'), [])
    mkdirSync(path.join(dir, 'prices/чернетка'), { recursive: true })
    writeFileSync(path.join(dir, 'prices/2026-10-09/notes.txt'), 'x')
    expect(listDayFiles(dir).map((f) => `${f.date}/${f.shop}`)).toEqual(['2026-10-09/ktc', '2026-10-09/zeta', '2026-10-10/ktc'])
    expect(listDayFiles(path.join(dir, 'немає'))).toEqual([])
  })
})

describe('імпорт сховища в базу', () => {
  let prisma: PrismaClient
  let cleanup: () => Promise<void>
  beforeAll(async () => {
    const db = createTempDb()
    prisma = db.prisma
    cleanup = db.cleanup
  }, 90_000)
  afterAll(async () => cleanup?.())

  it('створює категорії, магазин, товари й історію за кожен день; повтор нічого не дублює', async () => {
    const day = (date: string, price: number, extra: Partial<ParsedProduct> = {}) =>
      writeJsonl(path.join(dir, `prices/${date}/ktc.jsonl`), [toRecord(product({ price, ...extra }), 'ktc', date), toRecord(product({ externalId: '2', name: 'Монітор', categorySlug: 'monitory', price: 20000 }), 'ktc', date)])
    day('2026-10-08', 8499)
    day('2026-10-09', 7999)

    const s = await importDataStore(prisma, dir)
    expect(s).toMatchObject({ days: 2, files: 2, records: 4, saved: 4, invalid: 0, lastDate: '2026-10-09' })
    expect(await prisma.category.count()).toBe(CATEGORIES.length)
    expect((await prisma.shop.findUniqueOrThrow({ where: { slug: 'ktc' } })).name).toBeTruthy()

    const tv = await prisma.offer.findFirstOrThrow({ where: { externalId: '447594' } })
    expect(tv.price).toBe(7999)
    expect(tv.lastSeenAt.toISOString().slice(0, 10)).toBe('2026-10-09')
    const points = await prisma.pricePoint.findMany({ where: { productId: tv.productId }, orderBy: { date: 'asc' } })
    expect(points.map((p) => [p.date.toISOString().slice(0, 10), p.price, p.isPromo])).toEqual([
      ['2026-10-08', 8499, true],
      ['2026-10-09', 7999, true],
    ])

    await importDataStore(prisma, dir)
    expect(await prisma.pricePoint.count()).toBe(4)
    expect(await prisma.product.count()).toBe(2)
  })

  it('хибна ціна одного дня пропускається, а наступного дня правильна ціна знову приймається', async () => {
    const put = (date: string, price: number) => writeJsonl(path.join(dir, `prices/${date}/ktc.jsonl`), [toRecord(product({ price, oldPrice: null }), 'ktc', date)] as DayRecord[])
    put('2026-10-07', 7999)
    put('2026-10-08', 799900)
    put('2026-10-09', 7899)
    const s = await importDataStore(prisma, dir)
    expect(s.errors.map((e) => e.kind)).toEqual(['suspicious_price', 'suspicious_price'])
    put('2026-10-10', 7799)
    await importDataStore(prisma, dir)
    const points = await prisma.pricePoint.findMany({ orderBy: { date: 'asc' } })
    expect(points.map((p) => p.price)).toEqual([7999, 7799])
  })

  describe('товар зник із магазину', () => {
    const tv = (shop: string, over: Partial<ParsedProduct> = {}) => product({ externalId: `${shop}-tv`, name: 'Телевізор Xiaomi TV A Pro 32 (L32MB-APME)', oldPrice: null, ...over })
    const other = (shop: string, n: number) => product({ externalId: `${shop}-${n}`, name: `Монітор Xiaomi A${20 + n}i`, modelCode: `ELA${5000 + n}EU`, categorySlug: 'monitory', oldPrice: null })
    const put = (date: string, shop: string, items: ParsedProduct[], status?: string) => {
      writeJsonl(path.join(dir, `prices/${date}/${shop}.jsonl`), items.map((p) => toRecord(p, shop, date)))
      if (status) writeJson(path.join(dir, `runs/${date}/${shop}.json`), { shop, date, status })
    }
    const offer = (shop: string) => prisma.offer.findFirstOrThrow({ where: { externalId: `${shop}-tv` }, include: { product: { include: { deal: true } } } })

    it('магазин перестав показувати товар: пропозиція вже не в наявності, найкращу ціну дає інший магазин', async () => {
      const rest = [1, 2, 3, 4].map((n) => other('ktc', n))
      put('2026-10-08', 'ktc', [tv('ktc', { price: 6999 }), ...rest])
      put('2026-10-08', 'moyo', [tv('moyo', { price: 7999 })])
      put('2026-10-09', 'ktc', rest)
      put('2026-10-09', 'moyo', [tv('moyo', { price: 7999 })])
      const s = await importDataStore(prisma, dir)
      expect(s.gone).toBe(1)
      await recomputeDeals(prisma, { today: new Date('2026-10-09T00:00:00Z') })

      const ktc = await offer('ktc')
      expect(ktc).toMatchObject({ inStock: false, price: 6999 })
      expect(ktc.lastSeenAt.toISOString().slice(0, 10)).toBe('2026-10-08')
      // Той самий товар у MOYO: саме його ціна тепер найкраща, а не стара ціна KTC
      expect((await offer('moyo')).productId).toBe(ktc.productId)
      expect(ktc.product.deal).toMatchObject({ bestPrice: 7999, shopsCount: 1 })
    })

    it('перерваний збір бачив лише частину товарів: решта лишається чинною', async () => {
      const full = [tv('ktc'), ...[1, 2, 3, 4, 5].map((n) => other('ktc', n))]
      put('2026-10-08', 'ktc', full, 'completed')
      put('2026-10-09', 'ktc', full.slice(1, 3), 'aborted')
      expect((await importDataStore(prisma, dir)).gone).toBe(0)
      expect((await offer('ktc')).inStock).toBe(true)

      // Те саме без підсумку запуску: товарів набагато менше, ніж у попередньому повному зборі
      put('2026-10-09', 'ktc', full.slice(1, 3))
      rmSync(path.join(dir, 'runs'), { recursive: true, force: true })
      expect((await importDataStore(prisma, dir)).gone).toBe(0)
    })

    it('магазин давно не збирався: його ціни вже не чинні', async () => {
      put('2026-10-05', 'ktc', [tv('ktc')])
      for (const date of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']) put(date, 'moyo', [tv('moyo')])
      await importDataStore(prisma, dir)
      expect((await offer('ktc')).inStock).toBe(false)
      expect((await offer('moyo')).inStock).toBe(true)
    })
  })

  it('бере лише останні дні сховища; номер товару між збираннями бази не змінюється', async () => {
    const put = (date: string, price: number) => writeJsonl(path.join(dir, `prices/${date}/ktc.jsonl`), [toRecord(product({ price, oldPrice: null }), 'ktc', date)])
    put('2026-10-07', 7999)
    put('2026-10-08', 7899)
    put('2026-10-09', 7799)
    await importDataStore(prisma, dir)
    const before = (await prisma.product.findFirstOrThrow()).id
    expect(await prisma.pricePoint.count()).toBe(3)

    const s = await importDataStore(prisma, dir, { days: 2 })
    expect(s.days).toBe(2)
    expect((await prisma.pricePoint.findMany({ orderBy: { date: 'asc' } })).map((p) => p.price)).toEqual([7899, 7799])
    expect((await prisma.product.findFirstOrThrow()).id).toBe(before)
  })

  it('товар у невідомій категорії потрапляє в помилки, решта імпортується', async () => {
    writeJsonl(path.join(dir, 'prices/2026-10-09/ktc.jsonl'), [toRecord(product({ externalId: 'x1', categorySlug: 'kaviari' }), 'ktc', '2026-10-09')] as DayRecord[])
    const s = await importDataStore(prisma, dir)
    expect(s.saved).toBe(0)
    expect(s.errors[0]?.message).toContain('Невідома категорія')
  })
})
