import type { Snapshot } from '@znyzhky/shared'
import { getFeed } from '../services/feed'
import { getFilters } from '../services/filters'
import { getProductDetail } from '../services/product'
import { getRejected } from '../services/rejected'
import type { PrismaClient } from '../generated/prisma/client'

/** Збирає знімок усіх даних для сайту, який працює без сервера (див. export-static.ts) */
export async function buildSnapshot(prisma: PrismaClient): Promise<Snapshot> {
  const feed = await getFeed(prisma, { sort: 'score', page: 1, limit: 100_000 })
  const ids = (await prisma.product.findMany({ select: { id: true }, orderBy: { id: 'asc' } })).map((p) => p.id)
  const products = []
  for (const id of ids) {
    const detail = await getProductDetail(prisma, id)
    if (detail) products.push(detail)
  }
  return {
    generatedAt: new Date().toISOString(),
    filters: await getFilters(prisma),
    feed: feed.items,
    rejected: await getRejected(prisma, 60),
    products,
  }
}
