import { SORT_OPTIONS, type CategoryNodeDto, type FiltersResponse } from '@znyzhky/shared'
import type { PrismaClient } from '../generated/prisma/client'

/** Дані для панелі фільтрів: категорії, магазини, межі цін. Рахуються по справжніх знижках. */
export async function getFilters(prisma: PrismaClient): Promise<FiltersResponse> {
  const real = { status: 'real' }
  const [categories, shops, byCategory, byShop, agg] = await Promise.all([
    prisma.category.findMany({ orderBy: { id: 'asc' } }),
    prisma.shop.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.product.groupBy({ by: ['categoryId'], where: { deal: real }, _count: { _all: true } }),
    prisma.offer.groupBy({ by: ['shopId'], where: { inStock: true, product: { deal: real } }, _count: { _all: true } }),
    prisma.productDeal.aggregate({ where: real, _min: { bestPrice: true }, _max: { bestPrice: true, discountPercent: true } }),
  ])

  const ownCount = new Map(byCategory.map((c) => [c.categoryId, c._count._all]))
  const toNode = (id: number): CategoryNodeDto => {
    const c = categories.find((x) => x.id === id) as (typeof categories)[number]
    const children = categories.filter((x) => x.parentId === id).map((x) => toNode(x.id))
    return {
      slug: c.slug,
      name: c.name,
      dealCount: (ownCount.get(id) ?? 0) + children.reduce((sum, ch) => sum + ch.dealCount, 0),
      children,
    }
  }

  const shopCount = new Map(byShop.map((s) => [s.shopId, s._count._all]))

  // Тестові магазини з сиду мають адреси на example.com; справжні — сайти магазинів
  const isExample = (url: string) => {
    try {
      const host = new URL(url).hostname
      return host === 'example.com' || host.endsWith('.example.com') || host.endsWith('.example')
    } catch {
      return false
    }
  }

  return {
    demo: shops.length > 0 && shops.every((s) => isExample(s.baseUrl)),
    categories: categories.filter((c) => c.parentId === null).map((c) => toNode(c.id)),
    shops: shops.map((s) => ({ slug: s.slug, name: s.name, dealCount: shopCount.get(s.id) ?? 0 })),
    priceRange: agg._min.bestPrice !== null && agg._max.bestPrice !== null ? { min: agg._min.bestPrice, max: agg._max.bestPrice } : null,
    maxDiscountPercent: agg._max.discountPercent ?? 0,
    sortOptions: SORT_OPTIONS,
  }
}
