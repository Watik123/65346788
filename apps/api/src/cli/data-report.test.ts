import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '../generated/prisma/client'
import { toRecord, writeJsonl } from '../scraping/datastore'
import type { ParsedProduct } from '../scraping/types'
import { createTempDb } from '../test-utils/temp-db'
import { importDataStore } from './data-import'
import { buildReport } from './data-report'

const p = (id: string, price: number, oldPrice: number | null, category = 'televizory'): ParsedProduct => ({
  externalId: id,
  url: `https://ktc.ua/goods/${id}.html`,
  name: `Товар ${id}`,
  brand: 'LG',
  modelCode: null,
  ean: null,
  categorySlug: category,
  imageUrl: null,
  price,
  oldPrice,
  inStock: true,
  rating: null,
  reviewCount: 0,
  raw: null,
})

let prisma: PrismaClient
let cleanup: () => Promise<void>
let dir: string

beforeAll(async () => {
  const db = createTempDb()
  prisma = db.prisma
  cleanup = db.cleanup
  dir = mkdtempSync(path.join(os.tmpdir(), 'report-'))
}, 90_000)
afterAll(async () => {
  await cleanup?.()
  rmSync(dir, { recursive: true, force: true })
})

describe('buildReport', () => {
  it('без даних каже про це прямо', async () => {
    expect(await buildReport(prisma)).toContain('Даних ще немає')
  })

  it('рахує товари, заявлені знижки і зміни за добу', async () => {
    writeJsonl(path.join(dir, 'prices/2026-10-08/ktc.jsonl'), [p('a', 10000, null), p('b', 20000, null), p('c', 5000, null, 'noutbuky')].map((x) => toRecord(x, 'ktc', '2026-10-08')))
    writeJsonl(path.join(dir, 'prices/2026-10-09/ktc.jsonl'), [p('a', 9000, 12000), p('b', 21000, null), p('c', 5000, 5500, 'noutbuky')].map((x) => toRecord(x, 'ktc', '2026-10-09')))
    await importDataStore(prisma, dir)
    const md = await buildReport(prisma)

    expect(md).toContain('# Статистика цін на 2026-10-09')
    expect(md).toContain('Історія: 2 дні. Товарів сьогодні: **3**')
    expect(md).toContain('| Телевізори | 2 | 2 | 1 (50%) | −25% |')
    expect(md).toContain('| Ноутбуки | 1 | 1 | 1 (100%) | −9% |')
    expect(md).toContain('Закреслена ціна є в **2** з 3 товарів (67%)')
    expect(md).toContain('Подешевшало: **1**, подорожчало: **1**, без змін: 1.')
    expect(md).toContain('| 10 000 ₴ | 9 000 ₴ | −10,0% |')
    expect(md).toContain('потрібно щонайменше 14 днів історії, зараз 2 дні')
  })
})
