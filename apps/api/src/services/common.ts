import { SPARKLINE_DAYS, type ShopRefDto } from '@znyzhky/shared'
import type { PrismaClient } from '../generated/prisma/client'
import { DAY_MS } from '../lib/dates'
import { marketSeries } from '../scoring'

export const dayString = (d: Date): string => d.toISOString().slice(0, 10)

/**
 * Остання доба, за яку є ціни. Історія відраховується від неї, а не від
 * годинника, тож сайт не «ламається», якщо збір цін пропустив день.
 */
export async function latestDataDay(prisma: PrismaClient): Promise<Date | null> {
  const { _max } = await prisma.pricePoint.aggregate({ _max: { date: true } })
  return _max.date
}

export async function loadShopRefs(prisma: PrismaClient): Promise<Map<number, ShopRefDto & { rating: number | null }>> {
  const shops = await prisma.shop.findMany({ select: { id: true, slug: true, name: true, rating: true } })
  return new Map(shops.map((s) => [s.id, { slug: s.slug, name: s.name, rating: s.rating }]))
}

/**
 * Міні-графіки: найкраща ціна ринку за SPARKLINE_DAYS діб до endDay включно.
 * Доби без даних заповнюються попередньою ціною, щоб лінія була суцільною.
 */
export async function loadSparklines(prisma: PrismaClient, productIds: number[], endDay: Date): Promise<Map<number, number[]>> {
  const result = new Map<number, number[]>()
  if (productIds.length === 0) return result

  const start = new Date(endDay.getTime() - (SPARKLINE_DAYS - 1) * DAY_MS)
  const points = await prisma.pricePoint.findMany({
    where: { productId: { in: productIds }, date: { gte: start, lte: endDay }, shop: { isActive: true } },
    select: { productId: true, date: true, price: true, inStock: true },
  })

  const byProduct = new Map<number, typeof points>()
  for (const p of points) {
    const list = byProduct.get(p.productId)
    if (list) list.push(p)
    else byProduct.set(p.productId, [p])
  }

  for (const id of productIds) {
    const byDay = new Map(marketSeries(byProduct.get(id) ?? []).map((p) => [p.date.getTime(), p.price]))
    const known = [...byDay.values()]
    const values: number[] = []
    let last = known[0]
    for (let i = 0; i < SPARKLINE_DAYS; i++) {
      const price = byDay.get(start.getTime() + i * DAY_MS)
      if (price !== undefined) last = price
      if (last !== undefined) values.push(last)
    }
    result.set(id, values)
  }
  return result
}

/** Безпечний розбір масиву причин із текстового поля */
export function parseReasons(json: string): import('@znyzhky/shared').Reason[] {
  try {
    const v: unknown = JSON.parse(json)
    return Array.isArray(v) ? (v as import('@znyzhky/shared').Reason[]) : []
  } catch {
    return []
  }
}
