import { parseDay, startOfUtcDay } from '../../src/lib/dates'
import { createPrisma } from '../../src/lib/db'
import { seedDatabase } from './seed-database'

async function main() {
  const today = process.env.SEED_TODAY ? parseDay(process.env.SEED_TODAY) : startOfUtcDay(new Date())
  const prisma = createPrisma()

  try {
    const { data, deals } = await seedDatabase(prisma, today)

    const [shops, categories, products, offers, points] = await Promise.all([
      prisma.shop.count(),
      prisma.category.count(),
      prisma.product.count(),
      prisma.offer.count(),
      prisma.pricePoint.count(),
    ])
    const count = (status: string) => deals.filter((d) => d.status === status).length
    console.log(`Сид готовий (дата «сьогодні»: ${data.today.toISOString().slice(0, 10)})`)
    console.log(`  магазинів: ${shops}, категорій: ${categories}, товарів: ${products}`)
    console.log(`  пропозицій: ${offers}, записів історії цін: ${points}`)
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
