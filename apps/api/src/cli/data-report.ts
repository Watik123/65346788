import { writeFileSync } from 'node:fs'
import { formatPercent, formatPrice, pluralUk } from '@znyzhky/shared'
import type { PrismaClient } from '../generated/prisma/client'
import { claimedOldPrice } from '../jobs/recompute-deals'
import { DAY_MS } from '../lib/dates'
import { createPrisma } from '../lib/db'

const days = (n: number) => `${n} ${pluralUk(n, 'день', 'дні', 'днів')}`
const pct = (part: number, total: number) => (total > 0 ? formatPercent((part / total) * 100) : '0%')
const esc = (s: string) => s.replace(/\|/g, '/')
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length === 0 ? 0 : s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2
}

/**
 * Звіт за зібраними даними у форматі Markdown: що відстежуємо, що магазин показує як знижки,
 * як змінились ціни за добу і (коли історії достатньо) які знижки справжні.
 */
export async function buildReport(prisma: PrismaClient): Promise<string> {
  const last = (await prisma.pricePoint.aggregate({ _max: { date: true }, _min: { date: true } }))
  if (!last._max.date || !last._min.date) return '# Статистика цін\n\nДаних ще немає.\n'
  const today = last._max.date
  const historyDays = Math.round((today.getTime() - last._min.date.getTime()) / DAY_MS) + 1
  const yesterday = new Date(today.getTime() - DAY_MS)

  const offers = await prisma.offer.findMany({
    where: { lastSeenAt: { gte: today } },
    include: { shop: true, product: { include: { category: true, deal: true } } },
  })
  const prev = new Map(
    (await prisma.pricePoint.findMany({ where: { date: yesterday }, select: { productId: true, shopId: true, price: true } })).map((p) => [`${p.productId}:${p.shopId}`, p.price]),
  )

  const out: string[] = []
  const day = today.toISOString().slice(0, 10)
  out.push(`# Статистика цін на ${day}`, '')
  const productCount = new Set(offers.map((o) => o.productId)).size
  out.push(`Історія: ${days(historyDays)}. Пропозицій магазинів сьогодні: **${offers.length}**, у наявності: ${offers.filter((o) => o.inStock).length}, різних товарів: ${productCount}.`, '')

  // По магазинах
  const byShop = new Map<string, typeof offers>()
  for (const o of offers) byShop.set(o.shop.name, [...(byShop.get(o.shop.name) ?? []), o])
  out.push('## Магазини', '', '| Магазин | Товарів | У наявності | Із закресленою ціною | Середня «знижка» магазину |', '|---|---:|---:|---:|---:|')
  for (const [shop, list] of [...byShop].sort((a, b) => b[1].length - a[1].length)) {
    const claims = list.map((o) => ({ o, old: claimedOldPrice(o.rawData) })).filter((x) => x.old !== null && x.old > x.o.price)
    const avg = claims.length ? claims.reduce((s, x) => s + (1 - x.o.price / (x.old as number)) * 100, 0) / claims.length : 0
    out.push(`| ${esc(shop)} | ${list.length} | ${list.filter((o) => o.inStock).length} | ${claims.length} (${pct(claims.length, list.length)}) | ${claims.length ? `−${formatPercent(avg)}` : '–'} |`)
  }
  out.push('')

  // По магазинах і категоріях
  const byCat = new Map<string, typeof offers>()
  for (const o of offers) byCat.set(o.product.category.name, [...(byCat.get(o.product.category.name) ?? []), o])
  out.push('## Категорії', '', '| Категорія | Пропозицій | У наявності | Із закресленою ціною | Середня «знижка» магазину |', '|---|---:|---:|---:|---:|')
  for (const [cat, list] of [...byCat].sort((a, b) => b[1].length - a[1].length)) {
    const claims = list.map((o) => ({ o, old: claimedOldPrice(o.rawData) })).filter((x) => x.old !== null && x.old > x.o.price)
    const avg = claims.length ? claims.reduce((s, x) => s + (1 - x.o.price / (x.old as number)) * 100, 0) / claims.length : 0
    out.push(`| ${cat} | ${list.length} | ${list.filter((o) => o.inStock).length} | ${claims.length} (${pct(claims.length, list.length)}) | ${claims.length ? `−${formatPercent(avg)}` : '–'} |`)
  }
  out.push('')

  // Що магазин показує як знижку
  const claimed = offers
    .map((o) => ({ o, old: claimedOldPrice(o.rawData) }))
    .filter((x): x is { o: (typeof offers)[number]; old: number } => x.old !== null && x.old > x.o.price)
    .map((x) => ({ ...x, pct: (1 - x.o.price / x.old) * 100 }))
  out.push('## Знижки, які показує магазин', '')
  out.push(
    `Закреслена ціна є в **${claimed.length}** з ${offers.length} пропозицій (${pct(claimed.length, offers.length)}). Медіанна заявлена знижка: −${formatPercent(median(claimed.map((c) => c.pct)))}.`,
    '',
  )
  if (claimed.length) {
    out.push('Найбільші заявлені знижки (перевіримо їх, щойно буде 14 днів історії):', '', '| Товар | Магазин | Ціна | Закреслена | Заявлено |', '|---|---|---:|---:|---:|')
    for (const c of claimed.sort((a, b) => b.pct - a.pct).slice(0, 10)) {
      out.push(`| [${esc(c.o.product.name)}](${c.o.url}) | ${esc(c.o.shop.name)} | ${formatPrice(c.o.price)} | ${formatPrice(c.old)} | −${formatPercent(c.pct)} |`)
    }
    out.push('')
  }

  // Той самий товар у кількох магазинах: різниця цін сьогодні
  const byProduct = new Map<number, typeof offers>()
  for (const o of offers.filter((x) => x.inStock)) byProduct.set(o.productId, [...(byProduct.get(o.productId) ?? []), o])
  const multi = [...byProduct.values()].filter((list) => new Set(list.map((o) => o.shopId)).size >= 2)
  if (byShop.size >= 2) {
    const pending = await prisma.matchReview.count({ where: { status: 'pending' } })
    out.push('## Один товар у кількох магазинах', '')
    out.push(
      `Знайдено в 2+ магазинах: **${multi.length}** товарів, у 3+: ${multi.filter((l) => new Set(l.map((o) => o.shopId)).size >= 3).length}. Схожих пар, які треба перевірити вручну: ${pending}.`,
      '',
    )
    const spread = multi
      .map((list) => {
        const sorted = [...list].sort((a, b) => a.price - b.price)
        const min = sorted[0] as (typeof list)[number]
        const max = sorted[sorted.length - 1] as (typeof list)[number]
        return { min, max, pct: (1 - min.price / max.price) * 100 }
      })
      .filter((x) => x.pct > 0)
      .sort((a, b) => b.pct - a.pct)
    if (spread.length) {
      out.push('Найбільша різниця цін між магазинами:', '', '| Товар | Дешевше | Дорожче | Різниця |', '|---|---:|---:|---:|')
      for (const x of spread.slice(0, 10)) {
        out.push(`| ${esc(x.min.product.name)} | [${formatPrice(x.min.price)}](${x.min.url}) ${esc(x.min.shop.name)} | [${formatPrice(x.max.price)}](${x.max.url}) ${esc(x.max.shop.name)} | −${formatPercent(x.pct)} |`)
      }
      out.push('')
    }
  }

  // Зміни за добу
  const changes = offers
    .map((o) => ({ o, before: prev.get(`${o.productId}:${o.shopId}`) }))
    .filter((x): x is { o: (typeof offers)[number]; before: number } => x.before !== undefined && x.before !== x.o.price)
  if (prev.size > 0) {
    const down = changes.filter((c) => c.o.price < c.before)
    const up = changes.filter((c) => c.o.price > c.before)
    out.push('## Зміни за добу', '', `Подешевшало: **${down.length}**, подорожчало: **${up.length}**, без змін: ${offers.length - changes.length}.`, '')
    if (down.length) {
      out.push('| Товар | Було | Стало | Зміна |', '|---|---:|---:|---:|')
      for (const c of down.sort((a, b) => a.o.price / a.before - b.o.price / b.before).slice(0, 10)) {
        out.push(`| [${esc(c.o.product.name)}](${c.o.url}) | ${formatPrice(c.before)} | ${formatPrice(c.o.price)} | −${formatPercent((1 - c.o.price / c.before) * 100, 1)} |`)
      }
      out.push('')
    }
  }

  // Висновки модуля скору
  const deals = offers.map((o) => o.product.deal).filter((d): d is NonNullable<typeof d> => d !== null)
  const count = (s: string) => new Set(deals.filter((d) => d.status === s).map((d) => d.productId)).size
  out.push('## Справжні й фальшиві знижки', '')
  if (historyDays < 14) {
    out.push(`Для висновків потрібно щонайменше 14 днів історії, зараз ${days(historyDays)}. До того всі товари мають статус «замало даних».`, '')
  } else {
    out.push(`Справжніх знижок: **${count('real')}**, фальшивих: **${count('fake')}**, без знижки: ${count('none')}, замало даних: ${count('insufficient_data')}.`, '')
    const real = [...new Map(offers.filter((o) => o.product.deal?.status === 'real').map((o) => [o.productId, o])).values()]
      .sort((a, b) => (b.product.deal?.score ?? 0) - (a.product.deal?.score ?? 0))
      .slice(0, 10)
    if (real.length) {
      out.push('| Товар | Ціна | Типова | Знижка | Скор |', '|---|---:|---:|---:|---:|')
      for (const o of real) {
        const d = o.product.deal as NonNullable<typeof o.product.deal>
        out.push(`| [${esc(o.product.name)}](${o.url}) | ${formatPrice(d.bestPrice)} | ${d.basePrice ? formatPrice(d.basePrice) : '–'} | −${formatPercent(d.discountPercent, 1)} | ${d.score} |`)
      }
      out.push('')
    }
  }
  return out.join('\n')
}

/** Запуск: npm run data:report [-- --out=STATS.md] */
async function main() {
  const outFile = process.argv.find((a) => a.startsWith('--out='))?.slice(6)
  const prisma = createPrisma()
  try {
    const md = await buildReport(prisma)
    if (outFile) writeFileSync(outFile, md + '\n')
    console.log(md)
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && process.argv[1].endsWith('data-report.ts')) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
