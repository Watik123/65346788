import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { canonicalBrand } from '../catalog/brands'
import { REMOVED_CATEGORIES, ensureCategories, matchGroup } from '../catalog/categories'
import { normalizeRecord } from '../catalog/normalize'
import { recomputeDeals } from '../jobs/recompute-deals'
import { DAY_MS, parseDay } from '../lib/dates'
import { createPrisma } from '../lib/db'
import { clusterOffers, type ClusterItem } from '../matching/cluster'
import { MatchDecisions, offerKey, readDecisions } from '../matching/decisions'
import { findScraper } from '../scrapers'
import { isNotNew } from '../scrapers/listing-utils'
import { fromRecord, listDayFiles, readDayFile } from '../scraping/datastore'
import { MAX_PRICE_JUMP } from '../scraping/ingest'
import type { ParsedProduct } from '../scraping/types'
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
  /** Аксесуари, товари з платним пакетом послуг та інше, що відсіює normalizeRecord */
  filtered: number
  /** Товарів і пропозицій магазинів у базі після імпорту */
  products: number
  offers: number
  /** Пропозиції, яких в останньому повному зборі магазину вже немає: показуються як «немає в наявності» */
  gone: number
  errors: { kind: string; message: string; date: string; shop: string }[]
  lastDate: string | null
}

export interface ImportOptions {
  /** Скільки останніх днів сховища брати. Сайт показує 90 днів історії, знижки рахуються за 60 */
  days?: number
}

/** Типове вікно імпорту: з запасом на 90 днів історії; час збирання сайту не росте з роками */
export const DEFAULT_IMPORT_DAYS = 100

/** Збір магазину вважається неповним, якщо товарів менше за цю частку від попереднього повного збору */
const PARTIAL_SHARE = 0.6
/** Магазин не збирався довше за стільки діб: його ціни вже не вважаємо чинними */
const SHOP_GRACE_DAYS = 2

interface OfferState extends ClusterItem {
  externalId: string
  /** Найсвіжіший запис магазину (після normalizeRecord) */
  rec: ParsedProduct
  /** Назва товару в магазині, як її показав магазин */
  title: string
  category: string
  categoryDay: string
  lastSeen: string
  lastPrice: number
  imageUrl: string | null
  rating: number | null
  reviewCount: number
  points: Map<string, { price: number; inStock: boolean; isPromo: boolean }>
}

/** Стабільний номер товару з ключа його першої пропозиції: посилання на товар не змінюються між збираннями бази */
function stableId(key: string, used: Set<number>): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  let id = ((h >>> 0) % 2_000_000_000) + 1
  while (used.has(id)) id = (id % 2_000_000_000) + 1
  used.add(id)
  return id
}

function runStatus(root: string, date: string, shop: string): string | null {
  const file = path.join(root, 'runs', date, `${shop}.json`)
  if (!existsSync(file)) return null
  try {
    const status = (JSON.parse(readFileSync(file, 'utf8')) as { status?: unknown }).status
    return typeof status === 'string' ? status : null
  } catch {
    return null
  }
}

async function inBatches<T>(rows: T[], size: number, write: (batch: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += size) await write(rows.slice(i, i + size))
}

/**
 * Збирає базу з файлового сховища наново: читає дні вікна, зіставляє пропозиції магазинів у товари
 * (усі разом, у пам'яті) і записує товари, пропозиції та історію цін пакетами. Наявні товари,
 * пропозиції й історія в базі замінюються: сховище — першоджерело, база — похідна від нього.
 */
export async function importDataStore(prisma: PrismaClient, root: string, opts: ImportOptions = {}): Promise<ImportSummary> {
  const allFiles = listDayFiles(root)
  const allDays = [...new Set(allFiles.map((f) => f.date))]
  const windowDays = new Set(allDays.slice(-(opts.days ?? DEFAULT_IMPORT_DAYS)))
  const files = allFiles.filter((f) => windowDays.has(f.date))
  const decisions = new MatchDecisions(readDecisions(root))
  const categoryIds = await ensureCategories(prisma)
  const summary: ImportSummary = { days: windowDays.size, files: files.length, records: 0, saved: 0, invalid: 0, notNew: 0, removed: 0, filtered: 0, products: 0, offers: 0, gone: 0, errors: [], lastDate: null }

  // 1. Читання: останній стан кожної пропозиції та її ціни по днях
  const offers = new Map<string, OfferState>()
  const shopDays = new Map<string, { date: string; count: number; status: string | null }[]>()
  for (const f of files) {
    const { records, invalid } = readDayFile(f)
    summary.invalid += invalid
    summary.lastDate = f.date
    const fail = (kind: string, message: string) => {
      if (summary.errors.length < 200) summary.errors.push({ kind, message, date: f.date, shop: f.shop })
    }
    const seenToday = new Set<string>()
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
      const p = normalizeRecord(f.shop, fromRecord(r))
      if (!p) {
        summary.filtered++
        continue
      }
      if (!categoryIds.has(p.categorySlug)) {
        fail('ingest', `Невідома категорія "${p.categorySlug}"`)
        continue
      }
      const key = offerKey(f.shop, p.externalId)
      // Товар буває і в загальному розділі, і у вужчому: перелік розділів магазину йде від вужчих,
      // тож за день береться перший запис
      if (seenToday.has(key)) continue
      seenToday.add(key)

      let o = offers.get(key)
      if (o && (p.price < o.lastPrice / MAX_PRICE_JUMP || p.price > o.lastPrice * MAX_PRICE_JUMP)) {
        fail('suspicious_price', `Ціна змінилась з ${o.lastPrice} до ${p.price} ₴, схоже на помилку розбору; запис пропущено`)
        // Порівнюємо далі з новою ціною: якщо хибною була попередня, наступного дня ціна пройде
        o.lastPrice = p.price
        continue
      }
      if (!o) {
        o = {
          key,
          shop: f.shop,
          externalId: p.externalId,
          group: matchGroup(p.categorySlug),
          fields: { brand: p.brand, name: p.name, modelCode: p.modelCode, ean: p.ean },
          rec: p,
          title: r.name,
          category: p.categorySlug,
          categoryDay: f.date,
          lastSeen: f.date,
          lastPrice: p.price,
          imageUrl: p.imageUrl,
          rating: p.rating,
          reviewCount: p.reviewCount,
          points: new Map(),
        }
        offers.set(key, o)
      } else {
        // Назву, код і категорію беремо найсвіжіші: магазини виправляють назви й переносять товари між розділами
        o.rec = p
        o.title = r.name
        o.fields = { brand: p.brand, name: p.name, modelCode: p.modelCode ?? o.fields.modelCode, ean: p.ean ?? o.fields.ean }
        o.category = p.categorySlug
        o.categoryDay = f.date
        o.group = matchGroup(p.categorySlug)
        o.lastSeen = f.date
        o.lastPrice = p.price
        o.imageUrl ??= p.imageUrl
        if (p.reviewCount > o.reviewCount) {
          o.rating = p.rating
          o.reviewCount = p.reviewCount
        }
      }
      o.points.set(f.date, { price: p.price, inStock: p.inStock, isPromo: p.oldPrice !== null && p.oldPrice > p.price })
      summary.saved++
    }
    shopDays.set(f.shop, [...(shopDays.get(f.shop) ?? []), { date: f.date, count: seenToday.size, status: runStatus(root, f.date, f.shop) }])
  }

  // 2. Чи чинна пропозиція. Магазини не показують проданий товар у списках, тож запис просто зникає.
  //    Чинними вважаємо пропозиції з останнього ПОВНОГО збору магазину (перерваний збір бачив лише частину
  //    товарів) і пізніших; якщо магазин давно не збирався, його ціни вже не чинні взагалі.
  const lastDate = summary.lastDate
  const currentSince = new Map<string, string | null>()
  for (const [shop, days] of shopDays) {
    let fullCount = 0
    let lastFull: string | null = null
    for (const d of days) {
      const partial = d.status === 'aborted' || (fullCount > 0 && d.count < fullCount * PARTIAL_SHARE)
      if (!partial) {
        fullCount = d.count
        lastFull = d.date
      }
    }
    const fresh = lastFull !== null && lastDate !== null && parseDay(lastDate).getTime() - parseDay(lastFull).getTime() <= SHOP_GRACE_DAYS * DAY_MS
    currentSince.set(shop, fresh ? lastFull : null)
  }
  const isCurrent = (o: OfferState) => {
    const since = currentSince.get(o.shop)
    return since !== null && since !== undefined && o.lastSeen >= since
  }

  // 3. Зіставлення: які пропозиції різних магазинів є тим самим товаром
  const { clusters, reviews } = clusterOffers([...offers.values()], decisions)

  // 4. Запис. База — похідна від сховища: товари, пропозиції й історія замінюються цілком
  await prisma.matchReview.deleteMany()
  await prisma.productDeal.deleteMany()
  await prisma.pricePoint.deleteMany()
  await prisma.offer.deleteMany()
  await prisma.product.deleteMany()

  const shopIds = new Map<string, number>()
  for (const shop of shopDays.keys()) {
    const meta = findScraper(shop)
    const row = await prisma.shop.upsert({
      where: { slug: shop },
      create: { slug: shop, name: meta?.name ?? shop, baseUrl: meta?.baseUrl ?? '' },
      update: meta ? { name: meta.name, baseUrl: meta.baseUrl } : {},
    })
    shopIds.set(shop, row.id)
  }

  const usedIds = new Set<number>()
  const usedEans = new Set<string>()
  const productOf = new Map<string, number>()
  const productRows = []
  const offerRows = []
  const pointRows = []
  const now = new Date()
  for (const c of clusters) {
    const first = c.members[0] as OfferState
    const id = stableId(first.key, usedIds)
    // Категорія — за найсвіжішим записом (серед рівних за датою — першого за порядком появи)
    const latest = c.members.reduce((a, b) => (b.categoryDay > a.categoryDay ? b : a))
    const reviewed = c.members.reduce((a, b) => (b.reviewCount > a.reviewCount ? b : a))
    const ean = c.members.map((m) => m.fields.ean).find((e) => e && !usedEans.has(e)) ?? null
    if (ean) usedEans.add(ean)
    productRows.push({
      id,
      name: first.rec.name,
      brand: canonicalBrand(first.rec.brand),
      modelCode: c.members.map((m) => m.fields.modelCode).find(Boolean) ?? null,
      ean,
      categoryId: categoryIds.get(latest.category) as number,
      imageUrl: c.members.map((m) => m.imageUrl).find(Boolean) ?? null,
      ratingAvg: reviewed.reviewCount > 0 ? reviewed.rating : null,
      reviewCount: reviewed.reviewCount,
      createdAt: now,
      updatedAt: now,
    })
    for (const m of c.members) {
      productOf.set(m.key, id)
      const shopId = shopIds.get(m.shop) as number
      const current = isCurrent(m)
      if (!current) summary.gone++
      offerRows.push({
        productId: id,
        shopId,
        externalId: m.externalId,
        price: m.rec.price,
        inStock: m.rec.inStock && current,
        url: m.rec.url,
        rawData: JSON.stringify({ oldPrice: m.rec.oldPrice, title: m.title }),
        lastSeenAt: parseDay(m.lastSeen),
      })
      for (const [date, pt] of m.points) pointRows.push({ productId: id, shopId, date: parseDay(date), ...pt })
    }
  }
  await inBatches(productRows, 500, (data) => prisma.product.createMany({ data }))
  await inBatches(offerRows, 500, (data) => prisma.offer.createMany({ data }))
  await inBatches(pointRows, 1000, (data) => prisma.pricePoint.createMany({ data }))

  // Спірні пари: окремі товари з позначкою «перевірити, чи це не той самий»
  const pairs = new Map<string, { productId: number; candidateId: number; score: number; reasons: string }>()
  for (const r of reviews) {
    const productId = productOf.get(r.a)
    const candidateId = productOf.get(r.b)
    if (productId === undefined || candidateId === undefined || productId === candidateId) continue
    pairs.set(`${productId}:${candidateId}`, { productId, candidateId, score: r.score, reasons: JSON.stringify(r.reasons) })
  }
  await inBatches([...pairs.values()], 500, (data) => prisma.matchReview.createMany({ data }))

  summary.products = productRows.length
  summary.offers = offerRows.length
  return summary
}

/** Запуск: npm run data:import -- <папка сховища> [--days=N] */
async function main() {
  const root = process.argv.slice(2).find((a) => !a.startsWith('--'))
  const days = process.argv.find((a) => a.startsWith('--days='))?.slice(7)
  if (!root) {
    console.log('Запуск: npm run data:import -- <папка сховища> [--days=N]')
    process.exit(1)
  }
  const prisma = createPrisma()
  try {
    const s = await importDataStore(prisma, root, days ? { days: Number(days) } : {})
    console.log(
      `Імпорт: днів ${s.days}, файлів ${s.files}, записів ${s.records}, збережено ${s.saved}, не нових ${s.notNew}, прибраних категорій ${s.removed}, відсіяно ${s.filtered}, пошкоджених рядків ${s.invalid}, помилок ${s.errors.length}`,
    )
    console.log(`Товарів ${s.products}, пропозицій ${s.offers}, з них уже немає в магазинах ${s.gone}`)
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
