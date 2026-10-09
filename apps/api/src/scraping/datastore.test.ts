import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { importDataStore } from '../cli/data-import'
import type { PrismaClient } from '../generated/prisma/client'
import { createTempDb } from '../test-utils/temp-db'
import { fromRecord, listDayFiles, parseJsonl, toRecord, writeJsonl, type DayRecord } from './datastore'
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
      writeJsonl(path.join(dir, `prices/${date}/ktc.jsonl`), [toRecord(product({ price, ...extra }), 'ktc', date), toRecord(product({ externalId: '2', name: 'Ноутбук', categorySlug: 'noutbuky', price: 20000 }), 'ktc', date)])
    day('2026-10-08', 8499)
    day('2026-10-09', 7999)

    const s = await importDataStore(prisma, dir)
    expect(s).toMatchObject({ days: 2, files: 2, records: 4, saved: 4, invalid: 0, lastDate: '2026-10-09' })
    expect(await prisma.category.count()).toBe(8)
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

  it('товар у невідомій категорії потрапляє в помилки, решта імпортується', async () => {
    writeJsonl(path.join(dir, 'prices/2026-10-09/ktc.jsonl'), [toRecord(product({ externalId: 'x1', categorySlug: 'navushnyky' }), 'ktc', '2026-10-09')] as DayRecord[])
    const s = await importDataStore(prisma, dir)
    expect(s.saved).toBe(0)
    expect(s.errors[0]?.message).toContain('Невідома категорія')
  })
})
