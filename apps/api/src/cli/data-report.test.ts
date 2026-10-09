import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { formatPrice } from '@znyzhky/shared'
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
    expect(md).toContain('Історія: 2 дні. Пропозицій магазинів сьогодні: **3**, у наявності: 3, різних товарів: 3.')
    expect(md).toContain('| KTC | 3 | 3 | 2 (67%) | −17% |')
    expect(md).not.toContain('Один товар у кількох магазинах')
    expect(md).toContain('| Телевізори | 2 | 2 | 1 (50%) | −25% |')
    expect(md).toContain('| Ноутбуки | 1 | 1 | 1 (100%) | −9% |')
    expect(md).toContain('Закреслена ціна є в **2** з 3 пропозицій (67%)')
    expect(md).toContain('Подешевшало: **1**, подорожчало: **1**, без змін: 1.')
    expect(md).toContain('| 10 000 ₴ | 9 000 ₴ | −10,0% |')
    expect(md).toContain('потрібно щонайменше 14 днів історії, зараз 2 дні')
  })

  it('показує товари, знайдені в кількох магазинах, і різницю цін', async () => {
    const db = createTempDb()
    const root = mkdtempSync(path.join(os.tmpdir(), 'report-multi-'))
    try {
      const tv = (shop: string, id: string, price: number, name: string): ParsedProduct => ({ ...p(id, price, null), url: `https://${shop}.example/${id}`, name, modelCode: '43UA75006LA' })
      // Вживаний товар зі старого збору: у базу не потрапляє
      writeJsonl(path.join(root, 'prices/2026-10-09/ktc.jsonl'), [toRecord(tv('ktc', '1', 15999, 'Телевізор LED LG 43UA75006LA (Smart TV)'), 'ktc', '2026-10-09'), toRecord(tv('ktc', '2', 9999, 'Вживаний Телевізор LG 43UA75006LA чудовий стан'), 'ktc', '2026-10-09')])
      writeJsonl(path.join(root, 'prices/2026-10-09/moyo.jsonl'), [toRecord(tv('moyo', '77', 14999, 'Телевізор LG 43" 4K 43UA75006LA'), 'moyo', '2026-10-09')])
      await importDataStore(db.prisma, root)
      const md = await buildReport(db.prisma)
      expect(md).toContain('різних товарів: 1.')
      expect(md).toContain('Знайдено в 2+ магазинах: **1** товарів, у 3+: 0.')
      expect(md).toContain(`| Телевізор LED LG 43UA75006LA (Smart TV) | [${formatPrice(14999)}](https://moyo.example/77) MOYO | [${formatPrice(15999)}](https://ktc.example/1) KTC | −6% |`)
    } finally {
      await db.cleanup()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
