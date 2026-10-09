import { ensureCategories } from '../catalog/categories'
import { recomputeDeals } from '../jobs/recompute-deals'
import { parseDay } from '../lib/dates'
import { createPrisma } from '../lib/db'
import { findScraper } from '../scrapers'
import { fromRecord, listDayFiles, readDayFile } from '../scraping/datastore'
import { IngestError, ingestProduct } from '../scraping/ingest'
import type { PrismaClient } from '../generated/prisma/client'

export interface ImportSummary {
  days: number
  files: number
  records: number
  saved: number
  invalid: number
  errors: { kind: string; message: string; date: string; shop: string }[]
  lastDate: string | null
}

/**
 * Збирає базу з файлового сховища: дні по черзі, від старих до нових. Повторний імпорт
 * безпечний: ціна за день перезаписується, а не дублюється.
 */
export async function importDataStore(prisma: PrismaClient, root: string): Promise<ImportSummary> {
  const files = listDayFiles(root)
  const categoryIds = await ensureCategories(prisma)
  const shopIds = new Map<string, number>()
  const summary: ImportSummary = { days: new Set(files.map((f) => f.date)).size, files: files.length, records: 0, saved: 0, invalid: 0, errors: [], lastDate: null }

  for (const f of files) {
    let shopId = shopIds.get(f.shop)
    if (shopId === undefined) {
      const meta = findScraper(f.shop)
      const shop = await prisma.shop.upsert({
        where: { slug: f.shop },
        create: { slug: f.shop, name: meta?.name ?? f.shop, baseUrl: meta?.baseUrl ?? '' },
        update: meta ? { name: meta.name, baseUrl: meta.baseUrl } : {},
      })
      shopId = shop.id
      shopIds.set(f.shop, shopId)
    }

    const { records, invalid } = readDayFile(f)
    summary.invalid += invalid
    const day = parseDay(f.date)
    for (const r of records) {
      summary.records++
      try {
        await ingestProduct(prisma, shopId, fromRecord(r), day, categoryIds, day)
        summary.saved++
      } catch (err) {
        if (summary.errors.length < 200) {
          summary.errors.push({ kind: err instanceof IngestError ? err.kind : 'ingest', message: err instanceof Error ? err.message : String(err), date: f.date, shop: f.shop })
        }
      }
    }
    summary.lastDate = f.date
  }
  return summary
}

/** Запуск: npm run data:import -- <папка сховища> */
async function main() {
  const root = process.argv.slice(2).find((a) => !a.startsWith('--'))
  if (!root) {
    console.log('Запуск: npm run data:import -- <папка сховища>')
    process.exit(1)
  }
  const prisma = createPrisma()
  try {
    const s = await importDataStore(prisma, root)
    console.log(`Імпорт: днів ${s.days}, файлів ${s.files}, записів ${s.records}, збережено ${s.saved}, пошкоджених рядків ${s.invalid}, помилок ${s.errors.length}`)
    for (const e of s.errors.slice(0, 10)) console.log(`  ${e.date} ${e.shop} ${e.kind}: ${e.message}`)
    if (s.lastDate) {
      const deals = await recomputeDeals(prisma, { today: parseDay(s.lastDate) })
      const count = (st: string) => deals.filter((d) => d.status === st).length
      console.log(`Знижки на ${s.lastDate}: справжні ${count('real')}, фейкові ${count('fake')}, замало даних ${count('insufficient_data')}, без знижки ${count('none')}`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && process.argv[1].endsWith('data-import.ts')) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
