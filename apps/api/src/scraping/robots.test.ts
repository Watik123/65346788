import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ALLOW_ALL, parseRobots } from './robots'

const here = path.dirname(fileURLToPath(import.meta.url))
const UA = 'ZnyzhkyBot/0.1 (+contact)'

describe('robots.txt справжнього сайту (KTC)', () => {
  const text = readFileSync(path.join(here, 'fixtures/ktc-robots.txt'), 'utf8')
  const rules = parseRobots(text, UA)

  it('дозволяє каталог, сторінки товарів і пагінацію', () => {
    for (const p of ['/', '/ua/', '/televizory/', '/product/samsung-qe55q80d/', '/televizory/?page=2', '/televizory/?sort=price', '/sitemap.xml']) {
      expect(rules.isAllowed(p), p).toBe(true)
    }
  })

  it('забороняє кошик, кабінет, пошук і адреси з рекламними мітками', () => {
    for (const p of ['/basket', '/ru/basket', '/u/login', '/search/?q=samsung', '/?q=samsung', '/televizory/?utm_source=google', '/x/?gclid=abc', '/filter/brand=samsung;lg']) {
      expect(rules.isAllowed(p), p).toBe(false)
    }
  })

  it('не просить паузу між запитами, а повну заборону має лише ICC-Crawler', () => {
    expect(rules.crawlDelaySeconds).toBeNull()
    expect(parseRobots(text, 'ICC-Crawler/2.0').isAllowed('/televizory/')).toBe(false)
  })
})

describe('parseRobots', () => {
  it('без правил і з порожнім Disallow дозволено все', () => {
    expect(parseRobots('', UA).isAllowed('/anything')).toBe(true)
    expect(parseRobots('User-agent: *\nDisallow:', UA).isAllowed('/anything')).toBe(true)
    expect(ALLOW_ALL.isAllowed('/x')).toBe(true)
  })

  it('група з точнішим User-agent перемагає групу *', () => {
    const text = 'User-agent: *\nDisallow: /\n\nUser-agent: ZnyzhkyBot\nDisallow: /private/'
    const r = parseRobots(text, UA)
    expect(r.isAllowed('/catalog/')).toBe(true)
    expect(r.isAllowed('/private/x')).toBe(false)
    expect(parseRobots(text, 'OtherBot/1').isAllowed('/catalog/')).toBe(false)
  })

  it('кілька User-agent підряд ділять одну групу', () => {
    const text = 'User-agent: A\nUser-agent: ZnyzhkyBot\nDisallow: /x'
    expect(parseRobots(text, UA).isAllowed('/x')).toBe(false)
  })

  it('виграє найдовше правило, при рівності Allow', () => {
    const text = 'User-agent: *\nDisallow: /catalog/\nAllow: /catalog/public/\nDisallow: /same\nAllow: /same'
    const r = parseRobots(text, UA)
    expect(r.isAllowed('/catalog/secret')).toBe(false)
    expect(r.isAllowed('/catalog/public/page')).toBe(true)
    expect(r.isAllowed('/same')).toBe(true)
  })

  it('розуміє * та $', () => {
    const r = parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /a*b', UA)
    expect(r.isAllowed('/doc.pdf')).toBe(false)
    expect(r.isAllowed('/doc.pdf?x=1')).toBe(true)
    expect(r.isAllowed('/axxb')).toBe(false)
    expect(r.isAllowed('/axx')).toBe(true)
  })

  it('читає Crawl-delay, Sitemap, коментарі та переноси Windows', () => {
    const r = parseRobots('# коментар\r\nUser-agent: *\r\nCrawl-delay: 5 # секунд\r\nDisallow: /x\r\nSitemap: https://shop.example/sitemap.xml\r\n', UA)
    expect(r.crawlDelaySeconds).toBe(5)
    expect(r.sitemaps).toEqual(['https://shop.example/sitemap.xml'])
    expect(r.isAllowed('/x')).toBe(false)
  })
})
