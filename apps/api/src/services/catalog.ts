import { queryCatalog, toCatalogItem, type CatalogItemDto, type CatalogQueryParams, type CatalogResponse, type DealStatus } from '@znyzhky/shared'
import type { PrismaClient } from '../generated/prisma/client'

/** Усі товари для каталогу й пошуку: і зі знижкою, і без, і ті, яких зараз немає в наявності */
export async function catalogItems(prisma: PrismaClient): Promise<CatalogItemDto[]> {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      brand: true,
      imageUrl: true,
      category: { select: { slug: true, name: true, parent: { select: { slug: true, name: true } } } },
      deal: { select: { status: true, bestPrice: true, shopsCount: true, discountPercent: true } },
    },
    orderBy: { id: 'asc' },
  })
  return products.map((p) => toCatalogItem({ ...p, deal: p.deal ? { ...p.deal, status: p.deal.status as DealStatus } : null }))
}

export async function getCatalog(prisma: PrismaClient, q: CatalogQueryParams): Promise<CatalogResponse> {
  return queryCatalog(await catalogItems(prisma), q)
}
