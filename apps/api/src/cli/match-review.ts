import path from 'node:path'
import { formatPrice } from '@znyzhky/shared'
import type { PrismaClient } from '../generated/prisma/client'
import { REPO_ROOT } from '../lib/database-url'
import { createPrisma } from '../lib/db'
import { appendDecision, offerKey } from '../matching/decisions'
import { mergeProducts } from '../matching/merge'

/**
 * Ручна перевірка схожих пар товарів, які автоматика не наважилась з'єднати.
 *
 *   npm run match:review                     показати пари, що чекають рішення
 *   npm run match:review -- --approve=12     це той самий товар: з'єднати
 *   npm run match:review -- --reject=12      це різні товари: більше не пропонувати
 *   [--store=папка]                          де лежить файлове сховище (за замовчуванням datastore/)
 *
 * Рішення дописується в <сховище>/match-decisions.jsonl, тож переживе перебудову бази
 * (npm run data:import), і одразу застосовується до поточної бази.
 */

const pairInclude = { include: { offers: { include: { shop: true } } } } as const

async function loadReview(prisma: PrismaClient, id: number) {
  const review = await prisma.matchReview.findUnique({ where: { id }, include: { product: pairInclude, candidate: pairInclude } })
  if (!review) throw new Error(`Пари №${id} немає`)
  if (review.status !== 'pending') throw new Error(`Пару №${id} вже розглянуто (${review.status === 'approved' ? 'з\'єднано' : 'відхилено'})`)
  const a = review.product.offers.find((o) => o.externalId)
  const b = review.candidate.offers.find((o) => o.externalId && o.shopId !== a?.shopId)
  if (!a?.externalId || !b?.externalId) throw new Error(`У пари №${id} немає пропозицій з артикулами різних магазинів`)
  return { review, keyA: offerKey(a.shop.slug, a.externalId), keyB: offerKey(b.shop.slug, b.externalId) }
}

export async function approvePair(prisma: PrismaClient, root: string, id: number): Promise<string> {
  const { review, keyA, keyB } = await loadReview(prisma, id)
  // Спершу злиття: якщо воно неможливе (обидва товари є в одному магазині), рішення не записуємо
  await mergeProducts(prisma, review.productId, review.candidateId)
  appendDecision(root, { a: keyA, b: keyB, decision: 'same' })
  await prisma.matchReview.updateMany({ where: { id }, data: { status: 'approved', resolvedAt: new Date() } })
  return `Пару №${id} з'єднано: ${review.product.name} = ${review.candidate.name}`
}

export async function rejectPair(prisma: PrismaClient, root: string, id: number): Promise<string> {
  const { review, keyA, keyB } = await loadReview(prisma, id)
  appendDecision(root, { a: keyA, b: keyB, decision: 'different' })
  await prisma.matchReview.update({ where: { id }, data: { status: 'rejected', resolvedAt: new Date() } })
  return `Пару №${id} позначено як різні товари`
}

export async function listPending(prisma: PrismaClient, limit = 50): Promise<string[]> {
  const pending = await prisma.matchReview.findMany({
    where: { status: 'pending' },
    include: { product: pairInclude, candidate: pairInclude },
    orderBy: [{ score: 'desc' }, { id: 'asc' }],
    take: limit,
  })
  const describe = (p: (typeof pending)[number]['product']) =>
    `${p.name}  [${p.offers.map((o) => `${o.shop.name} ${formatPrice(o.price)}`).join(', ')}]`
  return pending.map((r) => {
    let reasons: string[] = []
    try {
      reasons = JSON.parse(r.reasons) as string[]
    } catch {
      reasons = []
    }
    return `№${r.id} (схожість ${r.score.toFixed(2)}${reasons.length ? `; ${reasons.join('; ')}` : ''})\n    ${describe(r.product)}\n  ? ${describe(r.candidate)}`
  })
}

async function main() {
  const args = process.argv.slice(2)
  const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  const root = path.resolve(opt('store') ?? path.join(REPO_ROOT, 'datastore'))
  const prisma = createPrisma()
  try {
    const approve = opt('approve')
    const reject = opt('reject')
    if (approve) for (const id of approve.split(',')) console.log(await approvePair(prisma, root, Number(id)))
    if (reject) for (const id of reject.split(',')) console.log(await rejectPair(prisma, root, Number(id)))
    if (!approve && !reject) {
      const total = await prisma.matchReview.count({ where: { status: 'pending' } })
      console.log(`Пар на перевірку: ${total}${total > 50 ? ' (показано 50 найсхожіших)' : ''}\n`)
      for (const line of await listPending(prisma)) console.log(line + '\n')
      if (total) console.log('З\'єднати: npm run match:review -- --approve=№[,№]   Різні: npm run match:review -- --reject=№[,№]')
    }
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && process.argv[1].endsWith('match-review.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
