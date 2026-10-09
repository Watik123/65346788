import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '../generated/prisma/client'
import { ensureCategories } from '../catalog/categories'
import type { Fetcher } from '../scraping/fetcher'
import { runScraper } from '../scraping/runner'
import type { ParsedProduct } from '../scraping/types'
import { createTempDb } from '../test-utils/temp-db'
import { ktc, parseKtcListing } from './ktc'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(path.join(here, 'fixtures/ktc-listing.html'), 'utf8')
const ref = { url: 'https://ktc.ua/smartphone/', categorySlug: 'smartfony' }

const products = () =>
  parseKtcListing(fixture, ref)
    .outcomes.filter((o): o is { kind: 'product'; product: ParsedProduct } => o.kind === 'product')
    .map((o) => o.product)

describe('parseKtcListing', () => {
  it('бере товари з розмітки ItemList з ціною, закресленою ціною, наявністю й оцінкою', () => {
    const [s26, robot, tv] = products()
    expect(s26).toMatchObject({
      externalId: '458814',
      url: 'https://ktc.ua/goods/smartfon_samsung_galaxy_s26_ultra_12512gb_black_sm_s948bzkgeuc.html',
      name: 'Смартфон Samsung Galaxy S26 Ultra 12/512GB Black (SM-S948BZKGEUC)',
      brand: 'Samsung',
      modelCode: 'SM-S948BZKGEUC',
      categorySlug: 'smartfony',
      price: 65299,
      oldPrice: 70999,
      inStock: true,
      rating: 5,
      reviewCount: 2,
      imageUrl: 'https://img.ktc.ua/img/base/1_295/5/830015.webp',
      ean: null,
    })
    // sku-число, ratingCount замість reviewCount, адреса з #якорем
    expect(robot).toMatchObject({ externalId: '465545', price: 22999, oldPrice: 29999, reviewCount: 1, url: 'https://ktc.ua/goods/robot_pilosos_xiaomi_robot_vacuum_h50_pro_1189770.html' })
    // відносна адреса з рекламною міткою, ціна рядком, немає в наявності, «стара» ціна дорівнює поточній
    expect(tv).toMatchObject({ externalId: '425446', url: 'https://ktc.ua/goods/televizor_led_lg_43ua75006la_smart_tv_wi_fi_3840x2160.html', price: 15999, oldPrice: null, inStock: false, rating: null, reviewCount: 0 })
  })

  it('дублікати рахує один раз, а товари без бренду чи ціни пропускає з причиною', () => {
    const { outcomes } = parseKtcListing(fixture, ref)
    expect(products().map((p) => p.externalId)).toEqual(['458814', '465545', '425446'])
    const skips = outcomes.filter((o) => o.kind === 'skip')
    expect(skips).toEqual([
      { kind: 'skip', reason: 'missing_data', detail: 'немає бренду' },
      { kind: 'skip', reason: 'no_price' },
    ])
  })

  it('знаходить наступну сторінку лише в межах тієї самої категорії', () => {
    expect(parseKtcListing(fixture, ref).nextUrl).toBe('https://ktc.ua/smartphone/?page=2')
    expect(parseKtcListing(fixture.replace('/smartphone/?page=2', '/tv/?page=2'), ref).nextUrl).toBeNull()
    expect(parseKtcListing(fixture.replace('/smartphone/?page=2', 'https://evil.example/smartphone/?page=2'), ref).nextUrl).toBeNull()
    expect(parseKtcListing('<html></html>', ref)).toEqual({ outcomes: [], nextUrl: null })
  })

  it('проданий товар без ціни пропускається як «продано»; сторінка з самих проданих зупиняє обхід', () => {
    const sold = (sku: string) => ({ '@type': 'ListItem', item: { '@type': 'Product', name: `Ноутбук ASUS ${sku}`, url: `https://ktc.ua/goods/${sku}.html`, brand: { name: 'ASUS' }, sku, offers: { '@type': 'Offer', availability: 'https://schema.org/OutOfStock' } } })
    const page = (items: unknown[]) => `<link rel="next" href="/smartphone/?page=9"><script type="application/ld+json">${JSON.stringify({ '@type': 'ItemList', itemListElement: items })}</script>`

    const allSold = parseKtcListing(page([sold('1'), sold('2')]), ref)
    expect(allSold.outcomes).toEqual([
      { kind: 'skip', reason: 'sold_out' },
      { kind: 'skip', reason: 'sold_out' },
    ])
    expect(allSold.nextUrl).toBeNull()

    // Змішана сторінка: є товари з ціною, тож ідемо далі
    const mixed = JSON.parse(fixture.match(/<script type="application\/ld\+json">(\{"@context": "https:\/\/schema.org", "@type": "ItemList"[\s\S]*?)<\/script>/)?.[1] ?? '{}')
    const mixedPage = page([...mixed.itemListElement, sold('3')])
    expect(parseKtcListing(mixedPage, ref).nextUrl).toBe('https://ktc.ua/smartphone/?page=9')
  })

  it('порожня сторінка списку не веде далі, навіть якщо є rel=next', () => {
    expect(parseKtcListing('<link rel="next" href="/smartphone/?page=99">', ref).nextUrl).toBeNull()
  })
})

describe('збір KTC повністю (сайт підроблено, справжній лише формат сторінок)', () => {
  let prisma: PrismaClient
  let cleanup: () => Promise<void>
  beforeAll(async () => {
    const db = createTempDb()
    prisma = db.prisma
    cleanup = db.cleanup
    await ensureCategories(prisma)
  }, 90_000)
  afterAll(async () => cleanup?.())

  it('проходить усі категорії й сторінки, зберігає товари з закресленими цінами', async () => {
    const page2 = fixture.replace('<link rel="next" href="/smartphone/?page=2">', '').replaceAll('458814', '999001').replaceAll('465545', '999002').replaceAll('425446', '999003')
    const requested: string[] = []
    const fetcher: Fetcher = {
      async get(url) {
        requested.push(url)
        if (url === 'https://ktc.ua/smartphone/') return { url, status: 200, body: fixture, fromCache: false }
        if (url === 'https://ktc.ua/smartphone/?page=2') return { url, status: 200, body: page2, fromCache: false }
        return { url, status: 200, body: '<html>порожня категорія</html>', fromCache: false }
      },
    }
    const s = await runScraper(prisma, ktc, fetcher, { today: new Date('2026-10-09T00:00:00Z') })

    expect(requested).toEqual([
      'https://ktc.ua/tv/',
      'https://ktc.ua/notebook/',
      'https://ktc.ua/smartphone/',
      'https://ktc.ua/smartphone/?page=2',
      'https://ktc.ua/robotic_vacuums/',
      'https://ktc.ua/cordless_vacuums/',
    ])
    expect(s).toMatchObject({ status: 'completed', found: 6, saved: 6, errors: 0, skippedByReason: { missing_data: 2, no_price: 2 } })
    const shop = await prisma.shop.findUniqueOrThrow({ where: { slug: 'ktc' } })
    expect(shop).toMatchObject({ name: 'KTC', baseUrl: 'https://ktc.ua' })
    const offer = await prisma.offer.findFirstOrThrow({ where: { externalId: '458814' } })
    expect(JSON.parse(offer.rawData ?? '{}').oldPrice).toBe(70999)
    expect((await prisma.pricePoint.findFirstOrThrow({ where: { productId: offer.productId } })).isPromo).toBe(true)
  })

  it('ліміт товарів зупиняє обхід посеред категорії', async () => {
    const requested: string[] = []
    const fetcher: Fetcher = { async get(url) { requested.push(url); return { url, status: 200, body: fixture, fromCache: false } } }
    const s = await runScraper(prisma, ktc, fetcher, { dryRun: true, maxProducts: 2 })
    expect(s.found).toBe(2)
    expect(requested).toEqual(['https://ktc.ua/tv/'])
  })
})
