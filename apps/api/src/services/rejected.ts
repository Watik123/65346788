import type { RejectedItemDto, RejectedResponse } from '@znyzhky/shared'
import type { PrismaClient } from '../generated/prisma/client'
import { latestDataDay, loadShopRefs, loadSparklines, parseReasons } from './common'

/**
 * Відсіяні знижки: магазин їх показує, але порівняно з типовою ціною ринку
 * вони не підтверджуються. Спершу ті, де магазин обіцяє найбільше.
 */
export async function getRejected(prisma: PrismaClient, limit = 24): Promise<RejectedResponse> {
  const include = { product: { include: { category: { select: { slug: true, name: true } } } } }
  const where = { status: 'fake' }

  // Сортування «за спаданням з NULL наприкінці» різниться між СУБД, тож робимо його явно
  const withClaim = await prisma.productDeal.findMany({
    where: { ...where, claimedPercent: { not: null } },
    orderBy: [{ claimedPercent: 'desc' }, { productId: 'asc' }],
    take: limit,
    include,
  })
  const withoutClaim =
    withClaim.length < limit
      ? await prisma.productDeal.findMany({
          where: { ...where, claimedPercent: null },
          orderBy: { productId: 'asc' },
          take: limit - withClaim.length,
          include,
        })
      : []
  const rows = [...withClaim, ...withoutClaim]

  const [total, shops, endDay] = await Promise.all([prisma.productDeal.count({ where }), loadShopRefs(prisma), latestDataDay(prisma)])
  const sparklines = endDay ? await loadSparklines(prisma, rows.map((r) => r.productId), endDay) : new Map<number, number[]>()

  const items: RejectedItemDto[] = rows.map((r) => {
    const shop = shops.get(r.bestShopId)
    return {
      id: r.productId,
      name: r.product.name,
      brand: r.product.brand,
      category: r.product.category,
      bestPrice: r.bestPrice,
      bestShop: { slug: shop?.slug ?? '', name: shop?.name ?? '' },
      basePrice: r.basePrice,
      discountPercent: r.discountPercent,
      claimedPercent: r.claimedPercent,
      reasons: parseReasons(r.reasons),
      sparkline: sparklines.get(r.productId) ?? [],
    }
  })
  return { items, total }
}
