import { HISTORY_DAYS, type DealDto, type OfferDto, type PricePointDto, type ProductDetailResponse, type ShopHistoryDto } from '@znyzhky/shared'
import type { PrismaClient } from '../generated/prisma/client'
import { claimedOldPrice } from '../jobs/recompute-deals'
import { DAY_MS } from '../lib/dates'
import { marketSeries } from '../scoring'
import { dayString, latestDataDay, loadShopRefs, parseReasons } from './common'

/** Сторінка товару: знижка з поясненням, пропозиції магазинів, історія цін за HISTORY_DAYS діб. */
export async function getProductDetail(prisma: PrismaClient, id: number): Promise<ProductDetailResponse | null> {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: { include: { parent: true } },
      deal: true,
      offers: { where: { shop: { isActive: true } } },
    },
  })
  if (!product) return null

  const shops = await loadShopRefs(prisma)
  const endDay = await latestDataDay(prisma)
  const points = endDay
    ? await prisma.pricePoint.findMany({
        where: {
          productId: id,
          shop: { isActive: true },
          date: { gte: new Date(endDay.getTime() - (HISTORY_DAYS - 1) * DAY_MS), lte: endDay },
        },
        orderBy: { date: 'asc' },
        select: { shopId: true, date: true, price: true, inStock: true },
      })
    : []

  const bestShopId = product.deal?.bestShopId

  const offers: OfferDto[] = product.offers
    .map((o) => {
      const shop = shops.get(o.shopId) as { slug: string; name: string; rating: number | null }
      return {
        shop: { slug: shop.slug, name: shop.name, rating: shop.rating },
        price: o.price,
        inStock: o.inStock,
        url: o.url,
        oldPrice: claimedOldPrice(o.rawData),
        isBest: o.shopId === bestShopId && o.inStock,
        lastSeenAt: o.lastSeenAt.toISOString(),
      }
    })
    .sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.price - b.price)

  const market: PricePointDto[] = marketSeries(points).map((p) => ({ date: dayString(p.date), price: p.price }))

  const byShop = new Map<number, PricePointDto[]>()
  for (const p of points) {
    const list = byShop.get(p.shopId) ?? []
    list.push({ date: dayString(p.date), price: p.price })
    byShop.set(p.shopId, list)
  }
  const shopHistory: ShopHistoryDto[] = [...byShop]
    .map(([shopId, pts]) => ({ slug: shops.get(shopId)?.slug ?? '', name: shops.get(shopId)?.name ?? '', points: pts }))
    .sort((a, b) => a.name.localeCompare(b.name))

  let deal: DealDto | null = null
  if (product.deal) {
    const d = product.deal
    const best = shops.get(d.bestShopId)
    deal = {
      status: d.status as DealDto['status'],
      bestPrice: d.bestPrice,
      bestShop: { slug: best?.slug ?? '', name: best?.name ?? '' },
      basePrice: d.basePrice,
      min30: d.min30,
      min60: d.min60,
      discountPercent: d.discountPercent,
      discountAmount: d.discountAmount,
      claimedPercent: d.claimedPercent,
      score: d.score,
      shopsCount: d.shopsCount,
      reasons: parseReasons(d.reasons),
      computedAt: d.computedAt.toISOString(),
    }
  }

  const parent = product.category.parent
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    modelCode: product.modelCode,
    ean: product.ean,
    imageUrl: product.imageUrl,
    rating: product.ratingAvg,
    reviewCount: product.reviewCount,
    category: {
      slug: product.category.slug,
      name: product.category.name,
      parent: parent ? { slug: parent.slug, name: parent.name } : null,
    },
    deal,
    offers,
    history: { market, shops: shopHistory },
  }
}
