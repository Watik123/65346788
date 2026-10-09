import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readDecisions } from '../matching/decisions'
import { toRecord, writeJsonl } from '../scraping/datastore'
import type { ParsedProduct } from '../scraping/types'
import { createTempDb } from '../test-utils/temp-db'
import { importDataStore } from './data-import'
import { approvePair, listPending, rejectPair } from './match-review'

const phone = (shop: string, id: string, name: string, price: number): ParsedProduct => ({
  externalId: id,
  url: `https://${shop}.example/${id}`,
  name,
  brand: 'Samsung',
  modelCode: null,
  ean: null,
  categorySlug: 'smartfony',
  imageUrl: null,
  price,
  oldPrice: null,
  inStock: true,
  rating: null,
  reviewCount: 0,
  raw: null,
})

let root: string
let db: ReturnType<typeof createTempDb>

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'review-'))
  db = createTempDb()
  // Код у KTC коротший, ніж у MOYO: автоматика не впевнена і відкладає пару на перевірку
  writeJsonl(path.join(root, 'prices/2026-10-09/ktc.jsonl'), [toRecord(phone('ktc', '1', 'Samsung Galaxy S26 Ultra 12/512GB (SM-S948B)', 65000), 'ktc', '2026-10-09')])
  writeJsonl(path.join(root, 'prices/2026-10-09/moyo.jsonl'), [toRecord(phone('moyo', '77', 'Samsung Galaxy S26 Ultra 12/512GB (SM-S948BZKGEUC)', 63999), 'moyo', '2026-10-09')])
})
afterEach(async () => {
  await db.cleanup()
  rmSync(root, { recursive: true, force: true })
})

describe('ручна перевірка пар', () => {
  it('показує пару з цінами обох магазинів', async () => {
    await importDataStore(db.prisma, root)
    const [line] = await listPending(db.prisma)
    expect(line).toMatch(/^№\d+ \(схожість/)
    expect(line).toContain('SM-S948BZKGEUC')
    expect(line).toContain('KTC')
    expect(line).toContain('MOYO')
  })

  it('«той самий»: товари з\'єднуються, рішення переживає перебудову бази', async () => {
    await importDataStore(db.prisma, root)
    const review = await db.prisma.matchReview.findFirstOrThrow()
    await approvePair(db.prisma, root, review.id)
    expect(await db.prisma.product.count()).toBe(1)
    expect(readDecisions(root)).toMatchObject([{ a: 'moyo:77', b: 'ktc:1', decision: 'same' }])

    const fresh = createTempDb()
    try {
      await importDataStore(fresh.prisma, root)
      expect(await fresh.prisma.product.count()).toBe(1)
      expect(await fresh.prisma.offer.count()).toBe(2)
      expect(await fresh.prisma.matchReview.count()).toBe(0)
    } finally {
      await fresh.cleanup()
    }
  })

  it('«різні»: пара більше не пропонується після перебудови', async () => {
    await importDataStore(db.prisma, root)
    const review = await db.prisma.matchReview.findFirstOrThrow()
    await rejectPair(db.prisma, root, review.id)
    expect(await listPending(db.prisma)).toEqual([])
    await expect(rejectPair(db.prisma, root, review.id)).rejects.toThrow(/вже розглянуто/)

    const fresh = createTempDb()
    try {
      await importDataStore(fresh.prisma, root)
      expect(await fresh.prisma.product.count()).toBe(2)
      expect(await fresh.prisma.matchReview.count()).toBe(0)
    } finally {
      await fresh.cleanup()
    }
  })
})
