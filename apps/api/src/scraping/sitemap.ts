import * as cheerio from 'cheerio'
import type { Fetcher } from './fetcher'

export interface SitemapOptions {
  /** Які адреси брати (наприклад, лише сторінки товарів) */
  include?: (url: string) => boolean
  /** Скільки вкладених файлів sitemap відкривати */
  maxSitemaps?: number
  maxUrls?: number
}

/**
 * Збирає адреси зі sitemap.xml, у тому числі зі sitemap-індексу (файл із переліком файлів).
 * Це найчемніший спосіб знайти сторінки товарів: сайт сам їх перелічує для роботів.
 */
export async function* sitemapUrls(fetcher: Fetcher, sitemapUrl: string, opts: SitemapOptions = {}): AsyncGenerator<string> {
  const { include = () => true, maxSitemaps = 20, maxUrls = Infinity } = opts
  const queue = [sitemapUrl]
  const seen = new Set<string>()
  let opened = 0
  let yielded = 0

  while (queue.length > 0 && opened < maxSitemaps) {
    const url = queue.shift() as string
    if (seen.has(url)) continue
    seen.add(url)
    opened++

    const res = await fetcher.get(url)
    if (res.status !== 200) continue
    const $ = cheerio.load(res.body, { xml: true })

    $('sitemap > loc').each((_, el) => void queue.push($(el).text().trim()))

    const urls = $('url > loc')
      .map((_, el) => $(el).text().trim())
      .get()
    for (const u of urls) {
      if (!u || !include(u)) continue
      yield u
      if (++yielded >= maxUrls) return
    }
  }
}
