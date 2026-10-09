import path from 'node:path'
import { formatPrice } from '@znyzhky/shared'
import { recomputeDeals } from '../jobs/recompute-deals'
import { REPO_ROOT } from '../lib/database-url'
import { createPrisma } from '../lib/db'
import { findScraper, scrapers } from '../scrapers'
import { PoliteFetcher } from '../scraping/fetcher'
import { toRecord, writeJson, writeJsonl } from '../scraping/datastore'
import { runScraper } from '../scraping/runner'
import { consoleLogger, type ShopScraper } from '../scraping/types'
import type { PrismaClient } from '../generated/prisma/client'

const USAGE = `Запуск: npm run scrape -- <магазин|магазин1,магазин2|all> [--max=N] [--dry-run] [--fresh] [--no-deals] [--store=папка]

  --max=N         обробити не більше N сторінок (для перевірки)
  --dry-run       лише завантажити й розібрати, нічого не писати в базу
  --fresh         не користуватись кешем завантажених сторінок
  --no-deals      не перераховувати знижки після збору
  --store=папка   замість бази записати результат у файлове сховище:
                  <папка>/prices/<дата>/<магазин>.jsonl і <папка>/runs/<дата>/<магазин>.json`

async function main() {
  const args = process.argv.slice(2)
  const flag = (name: string) => args.includes(`--${name}`)
  const max = args.find((a) => a.startsWith('--max='))?.slice(6)
  const store = args.find((a) => a.startsWith('--store='))?.slice(8)
  const target = args.find((a) => !a.startsWith('--'))

  if (!target) {
    console.log(USAGE)
    console.log(`\nДоступні магазини: ${scrapers.map((s) => s.slug).join(', ') || 'поки немає жодного'}`)
    process.exit(scrapers.length > 0 ? 1 : 0)
  }
  // «all» = усі магазини з реєстру по черзі; збій одного не зупиняє інші
  const slugs = target === 'all' ? scrapers.map((s) => s.slug) : target.split(',').map((s) => s.trim()).filter(Boolean)
  const unknown = slugs.filter((s) => !findScraper(s))
  if (unknown.length) {
    console.error(`Магазин ${unknown.map((s) => `"${s}"`).join(', ')} не знайдено. Доступні: ${scrapers.map((s) => s.slug).join(', ') || 'жодного'}`)
    process.exit(1)
  }

  const prisma = createPrisma()
  const failed: string[] = []
  try {
    for (const slug of slugs) {
      const scraper = findScraper(slug) as ShopScraper
      if (slugs.length > 1) console.log(`\n==================== ${scraper.name} ====================`)
      try {
        const status = await collectShop(prisma, scraper, { flag, max, store })
        if (status === 'aborted') failed.push(`${slug} (перервано)`)
      } catch (err) {
        console.error(`Збір ${scraper.name} не вдався: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`)
        failed.push(slug)
      }
    }
  } finally {
    await prisma.$disconnect()
  }
  if (failed.length) {
    console.log(`\nЗ помилками: ${failed.join(', ')}`)
    process.exitCode = 2
  }
}

async function collectShop(
  prisma: PrismaClient,
  scraper: ShopScraper,
  { flag, max, store }: { flag: (name: string) => boolean; max: string | undefined; store: string | undefined },
): Promise<string> {
  const dataDir = path.join(REPO_ROOT, 'data')
  const fetcher = new PoliteFetcher({
    shop: scraper.slug,
    userAgent: process.env.SCRAPER_USER_AGENT ?? `ZnyzhkyBot/0.1 (+${process.env.SCRAPER_CONTACT ?? 'contact: not set'})`,
    cacheDir: flag('fresh') ? undefined : path.join(dataDir, 'cache', scraper.slug),
    rawDir: path.join(dataDir, 'raw', scraper.slug),
  })

  const toStore = store !== undefined && !flag('dry-run')
  console.log(`Збір цін: ${scraper.name}${flag('dry-run') ? ' (пробний запуск, без запису)' : toStore ? ` (у сховище ${store})` : ''}`)
  const startedAt = new Date()
  const summary = await runScraper(prisma, scraper, fetcher, {
    log: consoleLogger,
    maxProducts: max ? Number(max) : undefined,
    // У режимі сховища база не потрібна: товари збираються в пам'яті й пишуться у файли
    dryRun: flag('dry-run') || toStore,
  })

  if (toStore) {
    const date = startedAt.toISOString().slice(0, 10)
    const records = summary.products.map((p) => toRecord(p, scraper.slug, date))
    writeJsonl(path.join(store, 'prices', date, `${scraper.slug}.jsonl`), records)
    const { products: _omit, ...rest } = summary
    writeJson(path.join(store, 'runs', date, `${scraper.slug}.json`), { shop: scraper.slug, date, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), ...rest, runId: undefined })
    console.log(`Записано товарів у сховище: ${records.length}`)
  }

  console.log(`\nПідсумок: ${summary.status}`)
  console.log(`  розібрано як товар: ${summary.found}, збережено: ${summary.saved}, пропущено: ${summary.skipped}, помилок: ${summary.errors}`)
  for (const [reason, n] of Object.entries(summary.skippedByReason)) console.log(`  пропущено (${reason}): ${n}`)
  if (summary.note) console.log(`  ${summary.note}`)
  const byCategory = new Map<string, number>()
  for (const p of summary.products) byCategory.set(p.categorySlug, (byCategory.get(p.categorySlug) ?? 0) + 1)
  if (byCategory.size) console.log(`  за категоріями: ${[...byCategory].map(([c, n]) => `${c} ${n}`).join(', ')}`)
  if (flag('dry-run')) {
    const withOld = summary.products.filter((p) => p.oldPrice).length
    const withRating = summary.products.filter((p) => p.rating !== null).length
    console.log(`  із закресленою ціною: ${withOld}, з оцінкою: ${withRating}, з фото: ${summary.products.filter((p) => p.imageUrl).length}, з кодом моделі: ${summary.products.filter((p) => p.modelCode).length}`)
    for (const p of summary.products.slice(0, 20)) console.log(`  • ${formatPrice(p.price)}${p.oldPrice ? ` (було ${formatPrice(p.oldPrice)})` : ''}  ${p.inStock ? '' : '[немає] '}[${p.categorySlug}] ${p.brand} | ${p.name} | код ${p.modelCode ?? '—'} | ★${p.rating ?? '—'} (${p.reviewCount}) | ${p.externalId} | ${p.url}`)
  }

  if (!flag('dry-run') && !toStore && !flag('no-deals') && summary.saved > 0) {
    const deals = await recomputeDeals(prisma)
    console.log(`Знижки перераховано для ${deals.length} товарів.`)
  }
  return summary.status
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
