import { formatPercent, formatPrice } from '@znyzhky/shared'
import { parseDay } from '../lib/dates'
import { createPrisma } from '../lib/db'
import { recomputeDeals } from '../jobs/recompute-deals'

/** Запуск: npm run deals:recompute [-- --today=2026-10-03] */
async function main() {
  const arg = process.argv.find((a) => a.startsWith('--today='))
  const today = arg ? parseDay(arg.slice('--today='.length)) : undefined

  const prisma = createPrisma()
  try {
    const deals = await recomputeDeals(prisma, today ? { today } : {})
    const names = new Map((await prisma.product.findMany({ select: { id: true, name: true } })).map((p) => [p.id, p.name]))

    const count = (status: string) => deals.filter((d) => d.status === status).length
    console.log(`Знижки перераховано для ${deals.length} товарів:`)
    console.log(`  справжні: ${count('real')}, фейкові: ${count('fake')}, замало даних: ${count('insufficient_data')}, без знижки: ${count('none')}`)

    console.log('\nТоп-10 за скором:')
    const top = deals.filter((d) => d.status === 'real').sort((a, b) => b.score - a.score).slice(0, 10)
    for (const d of top) {
      console.log(`  ${String(d.score).padStart(5)}  −${formatPercent(d.discountPercent, 1).padEnd(6)} ${formatPrice(d.currentPrice).padStart(9)}  ${names.get(d.productId)}`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
