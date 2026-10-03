import path from 'node:path'
import { formatPrice } from '@znyzhky/shared'
import { recomputeDeals } from '../jobs/recompute-deals'
import { REPO_ROOT } from '../lib/database-url'
import { createPrisma } from '../lib/db'
import { findScraper, scrapers } from '../scrapers'
import { PoliteFetcher } from '../scraping/fetcher'
import { runScraper } from '../scraping/runner'
import { consoleLogger } from '../scraping/types'

const USAGE = `Запуск: npm run scrape -- <магазин> [--max=N] [--dry-run] [--fresh] [--no-deals]

  --max=N      обробити не більше N сторінок (для перевірки)
  --dry-run    лише завантажити й розібрати, нічого не писати в базу
  --fresh      не користуватись кешем завантажених сторінок
  --no-deals   не перераховувати знижки після збору`

async function main() {
  const args = process.argv.slice(2)
  const flag = (name: string) => args.includes(`--${name}`)
  const max = args.find((a) => a.startsWith('--max='))?.slice(6)
  const slug = args.find((a) => !a.startsWith('--'))

  if (!slug) {
    console.log(USAGE)
    console.log(`\nДоступні магазини: ${scrapers.map((s) => s.slug).join(', ') || 'поки немає жодного'}`)
    process.exit(slug === undefined && scrapers.length > 0 ? 1 : 0)
  }
  const scraper = findScraper(slug)
  if (!scraper) {
    console.error(`Магазин "${slug}" не знайдено. Доступні: ${scrapers.map((s) => s.slug).join(', ') || 'жодного'}`)
    process.exit(1)
  }

  const dataDir = path.join(REPO_ROOT, 'data')
  const fetcher = new PoliteFetcher({
    shop: scraper.slug,
    userAgent: process.env.SCRAPER_USER_AGENT ?? `ZnyzhkyBot/0.1 (+${process.env.SCRAPER_CONTACT ?? 'вкажіть SCRAPER_CONTACT у .env'})`,
    cacheDir: flag('fresh') ? undefined : path.join(dataDir, 'cache', scraper.slug),
    rawDir: path.join(dataDir, 'raw', scraper.slug),
  })

  const prisma = createPrisma()
  try {
    console.log(`Збір цін: ${scraper.name}${flag('dry-run') ? ' (пробний запуск, без запису)' : ''}`)
    const summary = await runScraper(prisma, scraper, fetcher, {
      log: consoleLogger,
      maxProducts: max ? Number(max) : undefined,
      dryRun: flag('dry-run'),
    })

    console.log(`\nПідсумок: ${summary.status}`)
    console.log(`  розібрано як товар: ${summary.found}, збережено: ${summary.saved}, пропущено: ${summary.skipped}, помилок: ${summary.errors}`)
    for (const [reason, n] of Object.entries(summary.skippedByReason)) console.log(`  пропущено (${reason}): ${n}`)
    if (summary.note) console.log(`  ${summary.note}`)
    for (const p of summary.products.slice(0, 10)) console.log(`  • ${formatPrice(p.price)}  ${p.brand}  ${p.name}`)

    if (!flag('dry-run') && !flag('no-deals') && summary.saved > 0) {
      const deals = await recomputeDeals(prisma)
      console.log(`Знижки перераховано для ${deals.length} товарів.`)
    }
    if (summary.status === 'aborted') process.exitCode = 2
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
