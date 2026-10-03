import { describe, expect, it } from 'vitest'
import { SHOPS } from '../../prisma/seed/catalog'
import { generateSeed } from '../../prisma/seed/generate'
import { claimedOldPrice, computeDeals, type ComputedDeal, type DealSource } from './recompute-deals'

const TODAY = new Date('2026-10-03T00:00:00Z')
const seed = generateSeed(TODAY)

const productId = new Map(seed.products.map((p, i) => [p.key, i + 1]))
const shopId = new Map(SHOPS.map((s, i) => [s.slug, i + 1]))

const source: DealSource = {
  today: TODAY,
  products: seed.products.map((p) => ({ id: productId.get(p.key) as number, ratingAvg: p.def.rating, reviewCount: p.def.reviews })),
  offers: seed.offers.map((o) => ({
    productId: productId.get(o.productKey) as number,
    shopId: shopId.get(o.shopSlug) as number,
    price: o.price,
    inStock: o.inStock,
    rawData: o.rawData,
  })),
  points: seed.pricePoints.map((pp) => ({
    productId: productId.get(pp.productKey) as number,
    shopId: shopId.get(pp.shopSlug) as number,
    date: pp.date,
    price: pp.price,
    inStock: pp.inStock,
  })),
}

const deals = computeDeals(source)
const dealOf = new Map(deals.map((d) => [d.productId, d]))
const ofKind = (match: (p: (typeof seed.products)[number]) => boolean): ComputedDeal[] =>
  seed.products.filter(match).map((p) => dealOf.get(productId.get(p.key) as number) as ComputedDeal)

const codes = (d: ComputedDeal) => d.reasons.map((r) => r.code)

describe('модуль скору на тестових даних сиду', () => {
  it('є знижка для кожного товару', () => {
    expect(deals.length).toBe(seed.products.length)
  })

  it('усі справжні знижки визнані справжніми', () => {
    const real = ofKind((p) => p.def.scenario.kind === 'genuine')
    expect(real.length).toBeGreaterThanOrEqual(10)
    for (const d of real) {
      expect(d.status).toBe('real')
      expect(d.discountPercent).toBeGreaterThan(8)
      expect(d.score).toBeGreaterThan(0)
      expect(d.reasons.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('усі фейкові підйоми відсіяні, і причина названа', () => {
    const fakes = ofKind((p) => p.def.scenario.kind === 'fakeSpike')
    expect(fakes.length).toBeGreaterThanOrEqual(5)
    for (const d of fakes) {
      expect(d.status).toBe('fake')
      expect(d.score).toBe(0)
      expect(codes(d)).toContain('recent_price_spike')
    }
  })

  it('нестабільні ціни відсіяні', () => {
    for (const d of ofKind((p) => p.def.scenario.kind === 'yoyo')) {
      expect(d.status).toBe('fake')
      expect(d.score).toBe(0)
    }
  })

  it('постійна «акція» магазину не дає знижки', () => {
    const promos = ofKind((p) => p.def.scenario.kind === 'stable' && p.def.scenario.permanentPromo === true)
    expect(promos.length).toBeGreaterThanOrEqual(3)
    for (const d of promos) {
      expect(d.status).toBe('fake')
      expect(d.claimedPercent).toBeGreaterThan(10)
      expect(codes(d)).toContain('store_claim_not_confirmed')
    }
  })

  it('стабільні та повільно дешевіючі товари не потрапляють у знижки', () => {
    const plain = ofKind((p) => (p.def.scenario.kind === 'stable' && !p.def.scenario.permanentPromo) || p.def.scenario.kind === 'decline')
    for (const d of plain) {
      expect(d.status).toBe('none')
      expect(d.score).toBe(0)
    }
  })

  it('нові товари мають статус «замало даних»', () => {
    const fresh = ofKind((p) => p.def.scenario.kind === 'short')
    expect(fresh.length).toBeGreaterThanOrEqual(2)
    for (const d of fresh) expect(d.status).toBe('insufficient_data')
  })

  it('стрічка за скором складається лише зі справжніх знижок', () => {
    const feed = deals.filter((d) => d.score > 0).sort((a, b) => b.score - a.score)
    expect(feed.length).toBe(ofKind((p) => p.def.scenario.kind === 'genuine').length)
    for (const d of feed) expect(d.status).toBe('real')
    // Скор не вироджується: різні значення, а не одне число
    expect(new Set(feed.map((d) => d.score)).size).toBeGreaterThan(feed.length - 3)
  })

  it('MSI з оцінкою 5.0 і двома відгуками не лідирує завдяки оцінці', () => {
    const msi = seed.products.find((p) => p.def.brand === 'MSI')
    const redmi = seed.products.find((p) => p.def.modelCode === '2312DRA50G')
    const a = dealOf.get(productId.get(msi?.key as string) as number) as ComputedDeal
    const b = dealOf.get(productId.get(redmi?.key as string) as number) as ComputedDeal
    // Знижка в MSI більша (20% проти 16%), але в 2 магазинах і з 2 відгуками
    expect(a.discountPercent).toBeGreaterThan(b.discountPercent)
    expect(a.score).toBeLessThan(b.score)
  })

  it('найкраща ціна береться лише з пропозицій у наявності', () => {
    for (const d of deals) {
      const inStockPrices = source.offers.filter((o) => o.productId === d.productId && o.inStock).map((o) => o.price)
      expect(d.currentPrice).toBe(Math.min(...inStockPrices))
      expect(d.shopsCount).toBe(new Set(source.offers.filter((o) => o.productId === d.productId && o.inStock).map((o) => o.shopId)).size)
    }
  })
})

describe('claimedOldPrice', () => {
  it('дістає закреслену ціну й безпечно ігнорує сміття', () => {
    expect(claimedOldPrice('{"seed":true,"oldPrice":25999}')).toBe(25_999)
    expect(claimedOldPrice('{"seed":true}')).toBeNull()
    expect(claimedOldPrice('{"oldPrice":"25999"}')).toBeNull()
    expect(claimedOldPrice('не json')).toBeNull()
    expect(claimedOldPrice(null)).toBeNull()
  })
})
