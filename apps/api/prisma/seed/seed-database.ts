import type { PrismaClient } from '../../src/generated/prisma/client'
import { recomputeDeals, type ComputedDeal } from '../../src/jobs/recompute-deals'
import { CATEGORIES, SHOPS } from './catalog'
import { generateSeed, type SeedData } from './generate'

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export interface SeedResult {
  data: SeedData
  deals: ComputedDeal[]
}

/** Очищає таблиці, записує тестові дані й перераховує знижки. */
export async function seedDatabase(prisma: PrismaClient, today: Date): Promise<SeedResult> {
  const data = generateSeed(today)

  await prisma.$transaction(
    async (tx) => {
      // Порядок видалення враховує зовнішні ключі
      await tx.productDeal.deleteMany()
      await tx.pricePoint.deleteMany()
      await tx.offer.deleteMany()
      await tx.product.deleteMany()
      await tx.category.deleteMany()
      await tx.shop.deleteMany()

      const shops = await tx.shop.createManyAndReturn({
        data: SHOPS.map((s) => ({ slug: s.slug, name: s.name, baseUrl: s.baseUrl, rating: s.rating })),
      })
      const shopId = new Map(shops.map((s) => [s.slug, s.id]))

      const categoryId = new Map<string, number>()
      for (const level of [CATEGORIES.filter((c) => !c.parent), CATEGORIES.filter((c) => c.parent)]) {
        const rows = await tx.category.createManyAndReturn({
          data: level.map((c) => ({
            slug: c.slug,
            name: c.name,
            parentId: c.parent ? (categoryId.get(c.parent) ?? null) : null,
          })),
        })
        for (const r of rows) categoryId.set(r.slug, r.id)
      }

      const products = await tx.product.createManyAndReturn({
        data: data.products.map((p) => ({
          name: p.def.name,
          brand: p.def.brand,
          modelCode: p.def.modelCode,
          ean: p.ean,
          categoryId: categoryId.get(p.def.category) as number,
          imageUrl: null,
          ratingAvg: p.def.rating,
          reviewCount: p.def.reviews,
        })),
      })
      // createManyAndReturn зберігає порядок вставки; перевіряємо, а не припускаємо
      data.products.forEach((p, i) => {
        if ((products[i] as { name: string }).name !== p.def.name) throw new Error(`Порядок товарів порушено: ${p.def.name}`)
      })
      const productId = new Map(data.products.map((p, i) => [p.key, (products[i] as { id: number }).id]))

      await tx.offer.createMany({
        data: data.offers.map((o) => ({
          productId: productId.get(o.productKey) as number,
          shopId: shopId.get(o.shopSlug) as number,
          externalId: o.externalId,
          price: o.price,
          inStock: o.inStock,
          url: o.url,
          rawData: o.rawData,
          lastSeenAt: o.lastSeenAt,
        })),
      })

      for (const part of chunk(data.pricePoints, 1000)) {
        await tx.pricePoint.createMany({
          data: part.map((pp) => ({
            productId: productId.get(pp.productKey) as number,
            shopId: shopId.get(pp.shopSlug) as number,
            date: pp.date,
            price: pp.price,
            inStock: pp.inStock,
            isPromo: pp.isPromo,
          })),
        })
      }
    },
    { timeout: 120_000, maxWait: 30_000 },
  )

  const deals = await recomputeDeals(prisma, { today: data.today })
  return { data, deals }
}
