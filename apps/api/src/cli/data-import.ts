import { REMOVED_CATEGORIES, ensureCategories } from '../catalog/categories'
import { recomputeDeals } from '../jobs/recompute-deals'
import { parseDay } from '../lib/dates'
import { createPrisma } from '../lib/db'
import { findScraper } from '../scrapers'
import { CandidateIndex } from '../matching/candidates'
import { MatchDecisions, readDecisions } from '../matching/decisions'
import { fromRecord, listDayFiles, readDayFile } from '../scraping/datastore'
import { IngestError, MAX_PRICE_JUMP, ingestProduct } from '../scraping/ingest'
import { isNotNew } from '../scrapers/listing-utils'
import type { PrismaClient } from '../generated/prisma/client'

export interface ImportSummary {
  days: number
  files: number
  records: number
  saved: number
  invalid: number
  /** Вживані, уцінені, вітринні: у сховищі можуть бути зі старих зборів, у базу не беремо */
  notNew: number
  /** Записи категорій, прибраних із сайту (ноутбуки) */
  removed: number
  errors: { kind: string; message: string; date: string; shop: string }[]
  lastDate: string | null
}

/**
 * Збирає базу з файлового сховища: дні по черзі, від старих до нових. Повторний імпорт
 * безпечний: ціна за день перезаписується, а не дублюється.
 */
export async function importDataStore(prisma: PrismaClient, root: string): Promise<ImportSummary> {
  const files = listDayFiles(root)
  const decisions = new MatchDecisions(readDecisions(root))
  const candidates = new CandidateIndex()
  const categoryIds = await ensureCategories(prisma)
  const shopIds = new Map<string, number>()
  const summary: ImportSummary = { days: new Set(files.map((f) => f.date)).size, files: files.length, records: 0, saved: 0, invalid: 0, notNew: 0, removed: 0, errors: [], lastDate: null }

  // Відомі пропозиції магазину за кодом у магазині. Імпорт десятків днів по одному запису на запит
  // не вкладався в запуск на GitHub; тепер повний шлях (пошук збігів) лише для нових пропозицій.
  const offersByShop = new Map<number, Map<string, { offerId: number; productId: number; price: number }>>()
  const knownOffers = async (shopId: number) => {
    let m = offersByShop.get(shopId)
    if (!m) {
      m = new Map()
      for (const o of await prisma.offer.findMany({ where: { shopId }, select: { id: true, externalId: true, productId: true, price: true } })) {
        if (o.externalId) m.set(o.externalId, { offerId: o.id, productId: o.productId, price: o.price })
      }
      offersByShop.set(shopId, m)
    }
    return m
  }
  // Категорія товару — за найсвіжішим записом: магазини переносять товари між розділами, а ми
  // ділимо категорії дрібніше (роботи-пилососи окремо від пилососів)
  const latestCategory = new Map<number, string>()
  // Останній стан пропозицій записується наприкінці, одним пакетом
  const pendingOffers = new Map<number, { price: number; inStock: boolean; url: string; rawData: string; lastSeenAt: Date }>()
  // Поля товару, які доповнюються з інших магазинів (як у ingestProduct)
  const products = new Map<number, { imageUrl: string | null; ean: string | null; modelCode: string | null; reviewCount: number }>()
  const fillProduct = async (productId: number, r: { imageUrl: string | null; ean: string | null; modelCode: string | null; rating: number | null; reviewCount: number }) => {
    let p = products.get(productId)
    if (!p) {
      p = await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { imageUrl: true, ean: true, modelCode: true, reviewCount: true } })
      products.set(productId, p)
    }
    const data: Record<string, unknown> = {}
    if (!p.imageUrl && r.imageUrl) data['imageUrl'] = p.imageUrl = r.imageUrl
    if (!p.modelCode && r.modelCode) data['modelCode'] = p.modelCode = r.modelCode
    if (r.reviewCount > p.reviewCount) {
      data['ratingAvg'] = r.rating
      data['reviewCount'] = p.reviewCount = r.reviewCount
    }
    if (!p.ean && r.ean && !(await prisma.product.findUnique({ where: { ean: r.ean }, select: { id: true } }))) data['ean'] = p.ean = r.ean
    if (Object.keys(data).length > 0) await prisma.product.update({ where: { id: productId }, data })
  }

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
    const known = await knownOffers(shopId)
    // Повторний імпорт того самого дня: ціни дня магазину пишемо наново
    await prisma.pricePoint.deleteMany({ where: { shopId, date: day } })
    const viaIngest = new Set<number>()
    const categorizedToday = new Set<number>()
    const points = new Map<number, { productId: number; shopId: number; date: Date; price: number; inStock: boolean; isPromo: boolean }>()

    for (const r of records) {
      summary.records++
      if (isNotNew(r.name)) {
        summary.notNew++
        continue
      }
      if (REMOVED_CATEGORIES.has(r.category)) {
        summary.removed++
        continue
      }
      const fail = (kind: string, message: string) => {
        if (summary.errors.length < 200) summary.errors.push({ kind, message, date: f.date, shop: f.shop })
      }
      const o = known.get(r.externalId)
      if (o) {
        // Уже відома пропозиція: без пошуку збігів, ціна дня й стан пропозиції пишуться пакетом
        if (r.price < o.price / MAX_PRICE_JUMP || r.price > o.price * MAX_PRICE_JUMP) {
          fail('suspicious_price', `Ціна змінилась з ${o.price} до ${r.price} ₴, схоже на помилку розбору; запис пропущено`)
          // Порівнюємо далі з новою ціною: якщо хибною була попередня, наступного дня ціна пройде
          o.price = r.price
          continue
        }
        o.price = r.price
        // Товар буває і в загальному розділі, і у вужчому: перелік розділів магазину йде від вужчих,
        // тож за день береться перша категорія
        if (!categorizedToday.has(o.productId)) latestCategory.set(o.productId, r.category)
        categorizedToday.add(o.productId)
        if (!viaIngest.has(o.productId)) points.set(o.productId, { productId: o.productId, shopId, date: day, price: r.price, inStock: r.inStock, isPromo: r.oldPrice !== null && r.oldPrice > r.price })
        pendingOffers.set(o.offerId, { price: r.price, inStock: r.inStock, url: r.url, rawData: JSON.stringify({ oldPrice: r.oldPrice, raw: null }), lastSeenAt: day })
        await fillProduct(o.productId, r)
        summary.saved++
        continue
      }
      try {
        await ingestProduct(prisma, shopId, fromRecord(r), day, categoryIds, { now: day, shopSlug: f.shop, decisions, candidates, transactional: false })
        const offer = await prisma.offer.findFirst({ where: { shopId, externalId: r.externalId }, select: { id: true, productId: true, price: true } })
        // Ціну дня цього товару вже записав ingestProduct (буває, коли магазин має той самий товар
        // під двома кодами): пакетний запис її не дублює
        if (offer) {
          points.delete(offer.productId)
          viaIngest.add(offer.productId)
          categorizedToday.add(offer.productId)
          latestCategory.set(offer.productId, r.category)
          known.set(r.externalId, { offerId: offer.id, productId: offer.productId, price: offer.price })
          pendingOffers.delete(offer.id)
          products.delete(offer.productId)
        }
        summary.saved++
      } catch (err) {
        fail(err instanceof IngestError ? err.kind : 'ingest', err instanceof Error ? err.message : String(err))
      }
    }
    const rows = [...points.values()]
    for (let i = 0; i < rows.length; i += 1000) await prisma.pricePoint.createMany({ data: rows.slice(i, i + 1000) })
    summary.lastDate = f.date
  }
  const byCategory = new Map<number, number[]>()
  for (const [productId, slug] of latestCategory) {
    const categoryId = categoryIds.get(slug)
    if (categoryId === undefined) continue
    byCategory.set(categoryId, [...(byCategory.get(categoryId) ?? []), productId])
  }
  for (const [categoryId, ids] of byCategory) {
    for (let i = 0; i < ids.length; i += 500) await prisma.product.updateMany({ where: { id: { in: ids.slice(i, i + 500) }, categoryId: { not: categoryId } }, data: { categoryId } })
  }
  const updates = [...pendingOffers]
  for (let i = 0; i < updates.length; i += 500) {
    await prisma.$transaction(updates.slice(i, i + 500).map(([id, data]) => prisma.offer.update({ where: { id }, data })))
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
    console.log(`Імпорт: днів ${s.days}, файлів ${s.files}, записів ${s.records}, збережено ${s.saved}, не нових ${s.notNew}, прибраних категорій ${s.removed}, пошкоджених рядків ${s.invalid}, помилок ${s.errors.length}`)
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
