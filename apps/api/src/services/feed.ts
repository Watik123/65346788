import { SORT_OPTIONS, type FeedItemDto, type FeedResponse, type SortKey, type SortOrder } from '@znyzhky/shared'
import type { Prisma, PrismaClient } from '../generated/prisma/client'
import type { FeedQuery } from '../schemas'
import { latestDataDay, loadShopRefs, loadSparklines } from './common'

/** Id категорії та всіх її нащадків */
async function categoryTreeIds(prisma: PrismaClient, slug: string): Promise<number[]> {
  const all = await prisma.category.findMany({ select: { id: true, slug: true, parentId: true } })
  const root = all.find((c) => c.slug === slug)
  if (!root) return []
  const ids = [root.id]
  for (let i = 0; i < ids.length; i++) {
    for (const c of all) if (c.parentId === ids[i]) ids.push(c.id)
  }
  return ids
}

function buildOrderBy(sort: SortKey, order: SortOrder | undefined): Prisma.ProductDealOrderByWithRelationInput[] {
  const defaultOrder = SORT_OPTIONS.find((o) => o.value === sort)?.defaultOrder ?? 'desc'
  const dir = order ?? defaultOrder
  switch (sort) {
    case 'discount':
      return [{ discountPercent: dir }, { score: 'desc' }, { productId: 'asc' }]
    case 'price':
      return [{ bestPrice: dir }, { productId: 'asc' }]
    case 'popularity':
      return [{ shopsCount: dir }, { score: 'desc' }, { productId: 'asc' }]
    case 'score':
      return [{ score: dir }, { productId: 'asc' }]
  }
}

/** Стрічка: лише справжні знижки, з фільтрами, сортуванням і пагінацією. */
export async function getFeed(prisma: PrismaClient, q: FeedQuery): Promise<FeedResponse> {
  const productWhere: Prisma.ProductWhereInput = {}
  if (q.category !== undefined) productWhere.categoryId = { in: await categoryTreeIds(prisma, q.category) }
  if (q.minRating !== undefined) productWhere.ratingAvg = { gte: q.minRating }

  const where: Prisma.ProductDealWhereInput = { status: 'real', product: productWhere }
  if (q.minDiscount !== undefined) where.discountPercent = { gte: q.minDiscount }
  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    where.bestPrice = {
      ...(q.minPrice !== undefined && { gte: q.minPrice }),
      ...(q.maxPrice !== undefined && { lte: q.maxPrice }),
    }
  }

  const shops = await loadShopRefs(prisma)
  if (q.shop !== undefined) {
    // Товар лишається, якщо хоча б один із вибраних магазинів має його в наявності
    productWhere.offers = { some: { inStock: true, shop: { slug: { in: q.shop }, isActive: true } } }
  }

  const [total, rows, endDay] = await Promise.all([
    prisma.productDeal.count({ where }),
    prisma.productDeal.findMany({
      where,
      orderBy: buildOrderBy(q.sort as SortKey, q.order),
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: { product: { include: { category: { select: { slug: true, name: true } } } } },
    }),
    latestDataDay(prisma),
  ])

  const sparklines = endDay ? await loadSparklines(prisma, rows.map((r) => r.productId), endDay) : new Map<number, number[]>()

  const items: FeedItemDto[] = rows.map((r) => {
    const shop = shops.get(r.bestShopId)
    return {
      id: r.productId,
      name: r.product.name,
      brand: r.product.brand,
      imageUrl: r.product.imageUrl,
      category: r.product.category,
      bestPrice: r.bestPrice,
      bestShop: { slug: shop?.slug ?? '', name: shop?.name ?? '' },
      basePrice: r.basePrice ?? r.bestPrice,
      discountPercent: r.discountPercent,
      discountAmount: r.discountAmount,
      rating: r.product.ratingAvg,
      reviewCount: r.product.reviewCount,
      shopsCount: r.shopsCount,
      score: r.score,
      sparkline: sparklines.get(r.productId) ?? [],
    }
  })

  return { items, total, page: q.page, limit: q.limit, pages: Math.max(1, Math.ceil(total / q.limit)) }
}
