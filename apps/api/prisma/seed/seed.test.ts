import { describe, expect, it } from 'vitest'
import { CATEGORIES } from './catalog'
import { HISTORY_DAYS, fakeEan, generateSeed, nice, type SeedData } from './generate'

const TODAY = new Date('2026-10-03T00:00:00Z')
const data = generateSeed(TODAY)

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2
}

/** Найкраща ціна ринку по добах (мінімум по магазинах), від старих до нових */
function marketDaily(d: SeedData, productKey: string): number[] {
  const byDay = new Map<number, number>()
  for (const pp of d.pricePoints) {
    if (pp.productKey !== productKey) continue
    const t = pp.date.getTime()
    byDay.set(t, Math.min(byDay.get(t) ?? Infinity, pp.price))
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, price]) => price)
}

function discountVsMedian(d: SeedData, productKey: string): number {
  const days = marketDaily(d, productKey)
  const today = days[days.length - 1] as number
  return (1 - today / median(days.slice(-61, -1))) * 100
}

function storeClaim(d: SeedData, productKey: string): number {
  const offers = d.offers.filter((o) => o.productKey === productKey)
  const claims = offers
    .map((o) => (JSON.parse(o.rawData) as { oldPrice?: number }).oldPrice)
    .filter((x): x is number => typeof x === 'number')
  if (claims.length === 0) return 0
  const best = Math.min(...offers.map((o) => o.price))
  return (1 - best / Math.min(...claims)) * 100
}

const byKind = (kind: string) => data.products.filter((p) => p.def.scenario.kind === kind)

describe('сид: каталог', () => {
  it('містить 40–60 товарів у 5–6 листових категоріях', () => {
    expect(data.products.length).toBeGreaterThanOrEqual(40)
    expect(data.products.length).toBeLessThanOrEqual(60)
    const leaves = new Set(data.products.map((p) => p.def.category))
    expect(leaves.size).toBeGreaterThanOrEqual(5)
    expect(leaves.size).toBeLessThanOrEqual(6)
    for (const slug of leaves) expect(CATEGORIES.some((c) => c.slug === slug)).toBe(true)
  })

  it('має унікальні ключі, назви та EAN з коректною контрольною цифрою', () => {
    expect(new Set(data.products.map((p) => p.key)).size).toBe(data.products.length)
    expect(new Set(data.products.map((p) => p.def.name)).size).toBe(data.products.length)

    const eans = data.products.map((p) => p.ean).filter((e): e is string => e !== null)
    expect(eans.length).toBeGreaterThan(10)
    expect(new Set(eans).size).toBe(eans.length)
    for (const ean of eans) {
      expect(ean).toMatch(/^200\d{10}$/)
      const sum = [...ean.slice(0, 12)].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0)
      expect(Number(ean[12])).toBe((10 - (sum % 10)) % 10)
    }
    expect(fakeEan(0)).toBe(fakeEan(0))
  })

  it('генерується детерміновано', () => {
    expect(generateSeed(TODAY)).toEqual(data)
  })
})

describe('сид: ціни й історія', () => {
  it('усі ціни цілі, магазинного вигляду й правдоподібні', () => {
    for (const pp of data.pricePoints) {
      expect(Number.isInteger(pp.price)).toBe(true)
      expect(pp.price % 100).toBe(99)
      expect(pp.price).toBeGreaterThan(2000)
      expect(pp.price).toBeLessThan(100_000)
    }
    expect(nice(12_480)).toBe(12_499)
  })

  it('історія: 90 діб для звичайних товарів, коротша для нових, без дублів', () => {
    const seen = new Set<string>()
    for (const pp of data.pricePoints) {
      const k = `${pp.productKey}|${pp.shopSlug}|${pp.date.toISOString()}`
      expect(seen.has(k)).toBe(false)
      seen.add(k)
    }
    for (const p of data.products) {
      const days = marketDaily(data, p.key)
      const scenario = p.def.scenario
      if (scenario.kind === 'short') {
        expect(days.length).toBeGreaterThanOrEqual(scenario.days - 2)
        expect(days.length).toBeLessThanOrEqual(scenario.days)
      } else {
        expect(days.length).toBeGreaterThanOrEqual(HISTORY_DAYS - 6)
        expect(days.length).toBeLessThanOrEqual(HISTORY_DAYS)
      }
    }
  })

  it('поточна ціна пропозиції збігається з останнім записом історії', () => {
    for (const offer of data.offers) {
      const points = data.pricePoints
        .filter((pp) => pp.productKey === offer.productKey && pp.shopSlug === offer.shopSlug)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
      const last = points[points.length - 1]
      expect(last?.date.getTime()).toBe(TODAY.getTime())
      expect(last?.price).toBe(offer.price)
      expect(last?.inStock).toBe(offer.inStock)
    }
  })

  it('у кожного товару найдешевша пропозиція є в наявності', () => {
    for (const p of data.products) {
      const offers = data.offers.filter((o) => o.productKey === p.key)
      expect(offers.length).toBeGreaterThanOrEqual(1)
      const cheapest = offers.reduce((a, b) => (b.price < a.price ? b : a))
      expect(cheapest.inStock).toBe(true)
    }
  })

  it('різна кількість магазинів: є товари в 1–2 і в 5–6 магазинах', () => {
    const counts = data.products.map((p) => data.offers.filter((o) => o.productKey === p.key).length)
    expect(Math.min(...counts)).toBeLessThanOrEqual(2)
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(5)
  })
})

describe('сид: сценарії знижок (еталон для модуля скору)', () => {
  it('справжні знижки: 8% і більше від типової ціни за 60 діб', () => {
    expect(byKind('genuine').length).toBeGreaterThanOrEqual(10)
    for (const p of byKind('genuine')) expect(discountVsMedian(data, p.key)).toBeGreaterThan(8)
  })

  it('стабільні товари: знижки немає', () => {
    for (const p of byKind('stable')) expect(Math.abs(discountVsMedian(data, p.key))).toBeLessThan(2)
  })

  it('фейкові підйоми: магазин обіцяє 12%+, реально ціна на звичайному рівні', () => {
    expect(byKind('fakeSpike').length).toBeGreaterThanOrEqual(5)
    for (const p of byKind('fakeSpike')) {
      expect(Math.abs(discountVsMedian(data, p.key))).toBeLessThan(2.5)
      expect(storeClaim(data, p.key)).toBeGreaterThan(12)
    }
  })

  it('постійна "акція" магазину: закреслена ціна є, знижки немає', () => {
    const promos = data.products.filter((p) => p.def.scenario.kind === 'stable' && p.def.scenario.permanentPromo)
    expect(promos.length).toBeGreaterThanOrEqual(3)
    for (const p of promos) {
      expect(storeClaim(data, p.key)).toBeGreaterThan(10)
      expect(Math.abs(discountVsMedian(data, p.key))).toBeLessThan(2)
    }
  })

  it('нестабільна історія (yoyo): сьогодні ціна впала, але проти типової знижки немає', () => {
    expect(byKind('yoyo').length).toBeGreaterThanOrEqual(3)
    for (const p of byKind('yoyo')) {
      const days = marketDaily(data, p.key)
      const today = days[days.length - 1] as number
      const lastWeekMax = Math.max(...days.slice(-8, -1))
      expect(1 - today / lastWeekMax).toBeGreaterThan(0.07)
      expect(Math.abs(discountVsMedian(data, p.key))).toBeLessThan(3)
    }
  })

  it('повільне здешевлення дає малу знижку (2–5%)', () => {
    for (const p of byKind('decline')) {
      const d = discountVsMedian(data, p.key)
      expect(d).toBeGreaterThan(1.5)
      expect(d).toBeLessThan(5)
    }
  })

  it('нові товари мають замало історії', () => {
    expect(byKind('short').length).toBeGreaterThanOrEqual(2)
    for (const p of byKind('short')) expect(marketDaily(data, p.key).length).toBeLessThan(14)
  })

  it('є випадки для байєсівського згладжування оцінки: 5.0 з 2 відгуками, 4.7 з 800+, без відгуків', () => {
    const defs = data.products.map((p) => p.def)
    expect(defs.some((d) => d.rating === 5 && d.reviews <= 3)).toBe(true)
    expect(defs.some((d) => d.rating !== null && d.rating >= 4.7 && d.reviews >= 800)).toBe(true)
    expect(defs.some((d) => d.rating === null && d.reviews === 0)).toBe(true)
  })
})
