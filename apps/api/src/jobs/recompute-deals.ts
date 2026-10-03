import type { PrismaClient } from '../generated/prisma/client'
import { DAY_MS, startOfUtcDay } from '../lib/dates'
import { DEFAULT_SCORING_CONFIG, marketSeries, mergeConfig, scoreDeal, type DealResult, type ScoringOverrides } from '../scoring'

export interface DealSource {
  /** Північ UTC дня, для якого рахуємо */
  today: Date
  products: { id: number; ratingAvg: number | null; reviewCount: number }[]
  /** Пропозиції лише активних магазинів */
  offers: { productId: number; shopId: number; price: number; inStock: boolean; rawData: string | null }[]
  points: { productId: number; shopId: number; date: Date; price: number; inStock: boolean }[]
}

export interface ComputedDeal extends DealResult {
  productId: number
  bestShopId: number
  shopsCount: number
}

/** Закреслена ціна магазину з сирих даних пропозиції, якщо парсер її зберіг */
export function claimedOldPrice(rawData: string | null): number | null {
  if (!rawData) return null
  try {
    const v = (JSON.parse(rawData) as { oldPrice?: unknown }).oldPrice
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

/**
 * Чиста функція без доступу до бази: з пропозицій та історії цін рахує знижку
 * для кожного товару, який зараз є в наявності хоча б в одному магазині.
 */
export function computeDeals(src: DealSource, overrides: ScoringOverrides = {}): ComputedDeal[] {
  const pointsByProduct = new Map<number, DealSource['points']>()
  for (const p of src.points) {
    const list = pointsByProduct.get(p.productId)
    if (list) list.push(p)
    else pointsByProduct.set(p.productId, [p])
  }
  const offersByProduct = new Map<number, DealSource['offers']>()
  for (const o of src.offers) {
    const list = offersByProduct.get(o.productId)
    if (list) list.push(o)
    else offersByProduct.set(o.productId, [o])
  }

  const deals: ComputedDeal[] = []
  for (const product of src.products) {
    const inStock = (offersByProduct.get(product.id) ?? []).filter((o) => o.inStock)
    if (inStock.length === 0) continue

    const best = inStock.reduce((a, b) => (b.price < a.price || (b.price === a.price && b.shopId < a.shopId) ? b : a))
    const shopsCount = new Set(inStock.map((o) => o.shopId)).size

    const result = scoreDeal(
      {
        today: src.today,
        series: marketSeries(pointsByProduct.get(product.id) ?? []),
        currentPrice: best.price,
        rating: product.ratingAvg,
        reviewCount: product.reviewCount,
        shopsCount,
        claimedOldPrice: claimedOldPrice(best.rawData),
      },
      overrides,
    )
    deals.push({ ...result, productId: product.id, bestShopId: best.shopId, shopsCount })
  }
  return deals
}

export interface RecomputeOptions {
  today?: Date
  overrides?: ScoringOverrides
}

/** Перераховує таблицю ProductDeal цілком, в одній транзакції. */
export async function recomputeDeals(prisma: PrismaClient, opts: RecomputeOptions = {}): Promise<ComputedDeal[]> {
  const today = startOfUtcDay(opts.today ?? new Date())
  const cfg = mergeConfig(opts.overrides ?? DEFAULT_SCORING_CONFIG)
  const since = new Date(today.getTime() - (cfg.baselineDays + 1) * DAY_MS)
  const activeShop = { shop: { isActive: true } }

  const [products, offers, points] = await Promise.all([
    prisma.product.findMany({ select: { id: true, ratingAvg: true, reviewCount: true } }),
    prisma.offer.findMany({
      where: activeShop,
      select: { productId: true, shopId: true, price: true, inStock: true, rawData: true },
    }),
    prisma.pricePoint.findMany({
      where: { ...activeShop, date: { gte: since } },
      select: { productId: true, shopId: true, date: true, price: true, inStock: true },
    }),
  ])

  const deals = computeDeals({ today, products, offers, points }, opts.overrides)

  await prisma.$transaction([
    prisma.productDeal.deleteMany(),
    prisma.productDeal.createMany({
      data: deals.map((d) => ({
        productId: d.productId,
        bestPrice: d.currentPrice,
        bestShopId: d.bestShopId,
        min30: d.min30,
        min60: d.min60,
        basePrice: d.basePrice,
        discountPercent: d.discountPercent,
        discountAmount: d.discountAmount,
        claimedPercent: d.claimedPercent,
        score: d.score,
        status: d.status,
        reasons: JSON.stringify(d.reasons),
        shopsCount: d.shopsCount,
        computedAt: new Date(),
      })),
    }),
  ])
  return deals
}
