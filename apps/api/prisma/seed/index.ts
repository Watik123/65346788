import { recomputeDeals } from '../../src/jobs/recompute-deals'
import { createPrisma } from '../../src/lib/db'
import { CATEGORIES, SHOPS } from './catalog'
import { generateSeed, startOfUtcDay } from './generate'

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function main() {
  const today = process.env.SEED_TODAY
    ? new Date(`${process.env.SEED_TODAY}T00:00:00Z`)
    : startOfUtcDay(new Date())
  if (Number.isNaN(today.getTime())) throw new Error(`SEED_TODAY має формат РРРР-ММ-ДД, а не "${process.env.SEED_TODAY}"`)

  const data = generateSeed(today)
  const prisma = createPrisma()

  try {
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
        const productId = new Map(data.products.map((p, i) => [p.key, (products[i] as { id: number }).id]))
        // createManyAndReturn зберігає порядок вставки; перевіряємо, а не припускаємо
        data.products.forEach((p, i) => {
          if ((products[i] as { name: string }).name !== p.def.name) throw new Error(`Порядок товарів порушено: ${p.def.name}`)
        })

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

    const [shops, categories, products, offers, points] = await Promise.all([
      prisma.shop.count(),
      prisma.category.count(),
      prisma.product.count(),
      prisma.offer.count(),
      prisma.pricePoint.count(),
    ])
    console.log(`Сид готовий (дата «сьогодні»: ${data.today.toISOString().slice(0, 10)})`)
    console.log(`  магазинів: ${shops}, категорій: ${categories}, товарів: ${products}`)
    console.log(`  пропозицій: ${offers}, записів історії цін: ${points}`)
    const count = (status: string) => deals.filter((d) => d.status === status).length
    console.log(
      `  знижки: справжні ${count('real')}, фейкові ${count('fake')}, замало даних ${count('insufficient_data')}, без знижки ${count('none')}`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
