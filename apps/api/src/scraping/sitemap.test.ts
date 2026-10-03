import { describe, expect, it } from 'vitest'
import type { Fetcher } from './fetcher'
import { sitemapUrls } from './sitemap'

function fetcherOf(files: Record<string, string | number>): Fetcher & { requested: string[] } {
  const requested: string[] = []
  return {
    requested,
    async get(url) {
      requested.push(url)
      const f = files[url]
      if (f === undefined) return { url, status: 404, body: '', fromCache: false }
      return typeof f === 'number' ? { url, status: f, body: '', fromCache: false } : { url, status: 200, body: f, fromCache: false }
    },
  }
}

const urlset = (...locs: string[]) => `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs.map((l) => `<url><loc>${l}</loc></url>`).join('')}</urlset>`
const index = (...locs: string[]) => `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs.map((l) => `<sitemap><loc>${l}</loc></sitemap>`).join('')}</sitemapindex>`
const collect = async (gen: AsyncGenerator<string>) => {
  const out: string[] = []
  for await (const u of gen) out.push(u)
  return out
}

describe('sitemapUrls', () => {
  it('читає звичайний sitemap', async () => {
    const f = fetcherOf({ 'https://s.example/sitemap.xml': urlset('https://s.example/a', 'https://s.example/b') })
    expect(await collect(sitemapUrls(f, 'https://s.example/sitemap.xml'))).toEqual(['https://s.example/a', 'https://s.example/b'])
  })

  it('проходить sitemap-індекс і фільтрує адреси', async () => {
    const f = fetcherOf({
      'https://s.example/index.xml': index('https://s.example/p1.xml', 'https://s.example/p2.xml'),
      'https://s.example/p1.xml': urlset('https://s.example/product/1', 'https://s.example/about'),
      'https://s.example/p2.xml': urlset('https://s.example/product/2'),
    })
    const urls = await collect(sitemapUrls(f, 'https://s.example/index.xml', { include: (u) => u.includes('/product/') }))
    expect(urls).toEqual(['https://s.example/product/1', 'https://s.example/product/2'])
  })

  it('зупиняється на ліміті, не відкриваючи зайвих файлів', async () => {
    const f = fetcherOf({
      'https://s.example/index.xml': index('https://s.example/p1.xml', 'https://s.example/p2.xml'),
      'https://s.example/p1.xml': urlset('https://s.example/1', 'https://s.example/2', 'https://s.example/3'),
      'https://s.example/p2.xml': urlset('https://s.example/4'),
    })
    expect(await collect(sitemapUrls(f, 'https://s.example/index.xml', { maxUrls: 2 }))).toHaveLength(2)
    expect(f.requested).not.toContain('https://s.example/p2.xml')
  })

  it('не зациклюється на посиланнях самих на себе і пропускає недоступні файли', async () => {
    const f = fetcherOf({
      'https://s.example/index.xml': index('https://s.example/index.xml', 'https://s.example/broken.xml', 'https://s.example/ok.xml'),
      'https://s.example/broken.xml': 503,
      'https://s.example/ok.xml': urlset('https://s.example/x'),
    })
    expect(await collect(sitemapUrls(f, 'https://s.example/index.xml'))).toEqual(['https://s.example/x'])
    expect(f.requested.filter((u) => u.endsWith('index.xml'))).toHaveLength(1)
  })
})
