import type { PrismaClient } from '../generated/prisma/client'
import { startOfUtcDay } from '../lib/dates'
import { FetchError, type Fetcher } from './fetcher'
import { IngestError, ingestProduct } from './ingest'
import { silentLogger, type Logger, type ParseOutcome, type ParsedProduct, type ProductRef, type ShopScraper } from './types'

export interface RunOptions {
  today?: Date
  maxProducts?: number | undefined
  /** Нічого не пише в базу: лише завантажує й розбирає сторінки */
  dryRun?: boolean
  log?: Logger
  /** Скільки невдалих завантажень поспіль вважати ознакою блокування і зупинитись */
  maxConsecutiveFailures?: number
}

export type RunStatus = 'completed' | 'completed_with_errors' | 'aborted'

export interface RunSummary {
  runId: number | null
  status: RunStatus
  /** Сторінок, розібраних як товар */
  found: number
  saved: number
  skipped: number
  skippedByReason: Record<string, number>
  errors: number
  note: string | null
  /** Перші помилки запуску (для звіту, коли бази немає) */
  errorList: { kind: string; url: string | null; message: string }[]
  /** Лише для dryRun */
  products: ParsedProduct[]
}

/**
 * Один запуск збору для одного магазину. Сторінки завантажуються по одній (з паузами, які
 * тримає Fetcher). Помилка однієї сторінки не зупиняє запуск, але якщо сайт відмовляє
 * багато разів поспіль, запуск зупиняється: так ми не довбемо сайт, який нас не пускає.
 */
export async function runScraper(prisma: PrismaClient, scraper: ShopScraper, fetcher: Fetcher, opts: RunOptions = {}): Promise<RunSummary> {
  const log = opts.log ?? silentLogger
  const today = startOfUtcDay(opts.today ?? new Date())
  const maxFailures = opts.maxConsecutiveFailures ?? 8
  const dryRun = opts.dryRun === true

  const summary: RunSummary = { runId: null, status: 'completed', found: 0, saved: 0, skipped: 0, skippedByReason: {}, errors: 0, note: null, errorList: [], products: [] }
  const skip = (reason: string) => {
    summary.skipped++
    summary.skippedByReason[reason] = (summary.skippedByReason[reason] ?? 0) + 1
  }

  let shopId = 0
  let categoryIds = new Map<string, number>()
  if (!dryRun) {
    const shop = await prisma.shop.upsert({
      where: { slug: scraper.slug },
      create: { slug: scraper.slug, name: scraper.name, baseUrl: scraper.baseUrl },
      update: { name: scraper.name, baseUrl: scraper.baseUrl },
    })
    shopId = shop.id
    categoryIds = new Map((await prisma.category.findMany({ select: { id: true, slug: true } })).map((c) => [c.slug, c.id]))
    summary.runId = (await prisma.scrapeRun.create({ data: { shopId } })).id
  }

  const recordError = async (kind: string, message: string, url?: string) => {
    summary.errors++
    if (summary.errorList.length < 200) summary.errorList.push({ kind, url: url ?? null, message })
    log.error(`${kind}: ${message}${url ? ` (${url})` : ''}`)
    if (!dryRun && summary.runId !== null) await prisma.scrapeError.create({ data: { runId: summary.runId, kind, message, url: url ?? null } })
  }

  let processed = 0
  let consecutiveFailures = 0
  let aborted = false

  const handle = async (ref: ProductRef): Promise<void> => {
    const html = await load(ref.url)
    if (html === null) return

    if (scraper.kind === 'listing') return
    let outcome: ParseOutcome
    try {
      outcome = scraper.parse(html, ref)
    } catch (err) {
      await recordError('parse', err instanceof Error ? err.message : String(err), ref.url)
      return
    }
    await accept(outcome, ref.url)
  }

  const accept = async (outcome: ParseOutcome, url: string): Promise<void> => {
    if (outcome.kind === 'skip') {
      skip(outcome.reason)
      return
    }
    summary.found++
    if (dryRun) {
      summary.products.push(outcome.product)
      summary.saved++
      return
    }
    try {
      await ingestProduct(prisma, shopId, outcome.product, today, categoryIds, { shopSlug: scraper.slug })
      summary.saved++
    } catch (err) {
      if (err instanceof IngestError) await recordError(err.kind, err.message, outcome.product.url || url)
      else await recordError('ingest', err instanceof Error ? err.message : String(err), outcome.product.url || url)
    }
  }

  /** Завантаження сторінки з обліком невдач; null, якщо сторінку отримати не вдалося */
  const load = async (url: string): Promise<string | null> => {
    try {
      const res = await fetcher.get(url)
      if (res.status === 404 || res.status === 410) {
        consecutiveFailures = 0
        skip('gone')
        return null
      }
      if (res.status !== 200) {
        consecutiveFailures++
        await recordError('fetch', `HTTP ${res.status}`, url)
        return null
      }
      consecutiveFailures = 0
      return res.body
    } catch (err) {
      consecutiveFailures++
      const kind = err instanceof FetchError && err.kind === 'robots' ? 'robots' : 'fetch'
      await recordError(kind, err instanceof Error ? err.message : String(err), url)
      return null
    }
  }

  const limitReached = () => opts.maxProducts !== undefined && summary.found >= opts.maxProducts

  try {
    const ctx = { fetcher, log, maxProducts: opts.maxProducts }
    if (scraper.kind === 'listing') {
      const maxPages = scraper.maxPagesPerListing ?? 200
      outer: for await (const listing of scraper.listings(ctx)) {
        const visited = new Set<string>()
        let url: string | null = listing.url
        while (url && !visited.has(url) && visited.size < maxPages) {
          visited.add(url)
          const html = await load(url)
          processed++
          if (consecutiveFailures >= maxFailures) {
            aborted = true
            summary.note = `Зупинено: ${maxFailures} невдалих завантажень поспіль. Схоже, сайт блокує збір або недоступний.`
            break outer
          }
          if (html === null) break
          let parsed
          try {
            parsed = scraper.parseListing(html, { url, categorySlug: listing.categorySlug })
          } catch (err) {
            await recordError('parse', err instanceof Error ? err.message : String(err), url)
            break
          }
          if (parsed.outcomes.length === 0) log.warn(`На сторінці ${url} не знайдено жодного товару`)
          for (const outcome of parsed.outcomes) {
            await accept(outcome, url)
            if (limitReached()) break outer
          }
          log.info(`${listing.categorySlug}: сторінок ${visited.size}, товарів ${summary.found}`)
          url = parsed.nextUrl
        }
      }
    } else for await (const ref of scraper.discover(ctx)) {
      await handle(ref)
      processed++
      if (processed % 25 === 0) log.info(`Опрацьовано сторінок: ${processed}, збережено: ${summary.saved}`)

      if (consecutiveFailures >= maxFailures) {
        aborted = true
        summary.note = `Зупинено: ${maxFailures} невдалих завантажень поспіль. Схоже, сайт блокує збір або недоступний.`
        break
      }
      if (opts.maxProducts !== undefined && processed >= opts.maxProducts) break
    }
  } catch (err) {
    aborted = true
    summary.note = `Не вдалося знайти сторінки товарів: ${err instanceof Error ? err.message : String(err)}`
    await recordError('fetch', summary.note)
  }

  summary.status = aborted ? 'aborted' : summary.errors > 0 ? 'completed_with_errors' : 'completed'
  if (!dryRun && summary.runId !== null) {
    await prisma.scrapeRun.update({
      where: { id: summary.runId },
      data: {
        finishedAt: new Date(),
        status: summary.status,
        productsFound: summary.found,
        productsSaved: summary.saved,
        productsSkipped: summary.skipped,
        errorsCount: summary.errors,
        note: summary.note,
      },
    })
  }
  return summary
}
