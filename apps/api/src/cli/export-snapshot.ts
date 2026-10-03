import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import type { Snapshot } from '@znyzhky/shared'
import { createPrisma } from '../lib/db'
import { REPO_ROOT } from '../lib/database-url'
import { getFeed } from '../services/feed'
import { getFilters } from '../services/filters'
import { getProductDetail } from '../services/product'
import { getRejected } from '../services/rejected'
import type { PrismaClient } from '../generated/prisma/client'

/** Збирає знімок усіх даних для сайту, який працює без сервера */
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

/** Запуск: npm run snapshot:export  →  apps/web/src/snapshot/data.json */
async function main() {
  const prisma = createPrisma()
  try {
    const snapshot = await buildSnapshot(prisma)
    const out = path.join(REPO_ROOT, 'apps/web/src/snapshot/data.json')
    mkdirSync(path.dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify(snapshot))
    console.log(`Знімок записано: ${path.relative(REPO_ROOT, out)}`)
    console.log(`  знижок у стрічці: ${snapshot.feed.length}, відсіяних: ${snapshot.rejected.total}, товарів: ${snapshot.products.length}`)
  } finally {
    await prisma.$disconnect()
  }
}

// Запускаємо, лише коли файл викликано напряму (а не імпортовано в тесті)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
