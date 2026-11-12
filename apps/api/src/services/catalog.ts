import { dayChange, queryCatalog, toCatalogItem, type CatalogItemDto, type CatalogQueryParams, type CatalogResponse, type DealStatus } from '@znyzhky/shared'
import type { PrismaClient } from '../generated/prisma/client'
import { DAY_MS } from '../lib/dates'
import { marketSeries } from '../scoring'
import { dayString, latestDataDay } from './common'

/** Усі товари для каталогу й пошуку: і зі знижкою, і без, і ті, яких зараз немає в наявності */
export async function catalogItems(prisma: PrismaClient): Promise<CatalogItemDto[]> {
  const endDay = await latestDataDay(prisma)
  const [products, points] = await Promise.all([
    prisma.product.findMany({
      select: {
        id: true,
        name: true,
        brand: true,
        imageUrl: true,
        category: { select: { slug: true, name: true, parent: { select: { slug: true, name: true } } } },
        deal: { select: { status: true, bestPrice: true, shopsCount: true, discountPercent: true, bestShopId: true } },
      },
      orderBy: { id: 'asc' },
    }),
    // Ціни двох останніх діб: для «подешевшав за добу»
    endDay
      ? prisma.pricePoint.findMany({
          where: { date: { gte: new Date(endDay.getTime() - DAY_MS), lte: endDay }, shop: { isActive: true } },
          select: { productId: true, shopId: true, date: true, price: true, inStock: true },
        })
      : [],
  ])
  type Point = { productId: number; shopId: number; date: Date; price: number; inStock: boolean }
  const byProduct = new Map<number, Point[]>()
  for (const p of points as Point[]) {
    const list = byProduct.get(p.productId)
    if (list) list.push(p)
    else byProduct.set(p.productId, [p])
  }
  const dataDay = endDay ? dayString(endDay) : null
  return products.map((p) => {
    const item = toCatalogItem({ ...p, deal: p.deal ? { ...p.deal, status: p.deal.status as DealStatus } : null })
    if (!p.deal) return item
    const own = byProduct.get(p.id) ?? []
    const market = marketSeries(own).map((x) => ({ date: dayString(x.date), price: x.price }))
    const bestShop = own.filter((x) => x.shopId === p.deal?.bestShopId).map((x) => ({ date: dayString(x.date), price: x.price }))
    return { ...item, dayChangePercent: dayChange(market, dataDay, bestShop) }
  })
}

export async function getCatalog(prisma: PrismaClient, q: CatalogQueryParams): Promise<CatalogResponse> {
  return queryCatalog(await catalogItems(prisma), q)
}
