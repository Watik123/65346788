import { queryCompare, toCompareItem, type CompareItemDto, type CompareQueryParams, type CompareResponse } from '@znyzhky/shared'
import type { PrismaClient } from '../generated/prisma/client'
import { claimedOldPrice } from '../jobs/recompute-deals'

/**
 * Порівняння цін між магазинами: товари, що є в наявності щонайменше у двох.
 * Правила (різниця цін, «знижка на папері») спільні з режимом знімка, див. @znyzhky/shared/compare.
 */
export async function getCompare(prisma: PrismaClient, q: CompareQueryParams): Promise<CompareResponse> {
  const products = await prisma.product.findMany({
    where: { offers: { some: { inStock: true, shop: { isActive: true } } } },
    select: {
      id: true,
      name: true,
      brand: true,
      imageUrl: true,
      ratingAvg: true,
      reviewCount: true,
      category: { select: { slug: true, name: true, parent: { select: { slug: true, name: true } } } },
      offers: { where: { shop: { isActive: true } }, select: { price: true, inStock: true, rawData: true, shop: { select: { slug: true, name: true } } } },
    },
    orderBy: { id: 'asc' },
  })
  const items = products
    .map((p) =>
      toCompareItem({
        id: p.id,
        name: p.name,
        brand: p.brand,
        imageUrl: p.imageUrl,
        rating: p.ratingAvg,
        reviewCount: p.reviewCount,
        category: p.category,
        offers: p.offers.map((o) => ({ shop: o.shop, price: o.price, inStock: o.inStock, oldPrice: claimedOldPrice(o.rawData) })),
      }),
    )
    .filter((i): i is CompareItemDto => i !== null)
  return queryCompare(items, q)
}
