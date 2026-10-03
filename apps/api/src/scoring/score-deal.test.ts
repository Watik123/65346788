import { describe, expect, it } from 'vitest'
import { scoreDeal } from './score-deal'
import type { DailyPrice, DealInput } from './types'

const TODAY = new Date('2026-10-03T00:00:00Z')
const DAY = 86_400_000
const BASE = 20_000

/** Історія за віком: age 1 — вчора, age 90 — найдавніше. priceAt повертає ціну на цей вік. */
function history(priceAt: (age: number) => number, opts: { from?: number; skip?: (age: number) => boolean } = {}): DailyPrice[] {
  const out: DailyPrice[] = []
  for (let age = opts.from ?? 90; age >= 0; age--) {
    if (opts.skip?.(age)) continue
    out.push({ date: new Date(TODAY.getTime() - age * DAY), price: priceAt(age) })
  }
  return out
}

function input(over: Partial<DealInput> = {}): DealInput {
  return {
    today: TODAY,
    series: history(() => BASE),
    currentPrice: BASE,
    rating: 4.7,
    reviewCount: 300,
    shopsCount: 5,
    claimedOldPrice: null,
    ...over,
  }
}

/** Ціна впала на drop (частка) останні days діб, включно із сьогоднішньою */
function withDrop(drop: number, days: number, over: Partial<DealInput> = {}): DealInput {
  const price = Math.round(BASE * (1 - drop))
  return input({ series: history((age) => (age < days ? price : BASE)), currentPrice: price, ...over })
}

const codes = (r: { reasons: { code: string }[] }) => r.reasons.map((x) => x.code)

describe('scoreDeal: справжні знижки', () => {
  it('знижка 15% за стабільної історії справжня, з поясненням', () => {
    const r = scoreDeal(withDrop(0.15, 5))
    expect(r.status).toBe('real')
    expect(r.basePrice).toBe(BASE)
    expect(r.discountPercent).toBe(15)
    expect(r.discountAmount).toBe(3000)
    expect(r.score).toBeGreaterThan(0)
    expect(codes(r)).toEqual(expect.arrayContaining(['below_typical', 'market_low', 'stable_history']))
    expect(r.reasons[0]?.text).toContain('15%')
    expect(r.reasons[0]?.text).toContain('3 000 ₴')
  })

  it('свіже зниження (сьогодні) за стабільної історії — теж справжнє', () => {
    const r = scoreDeal(withDrop(0.12, 1))
    expect(r.status).toBe('real')
    expect(codes(r)).toContain('fresh_drop')
    expect(r.reasons.find((x) => x.code === 'fresh_drop')?.text).toBe('Ціна знизилась сьогодні.')
  })

  it('пропуски в історії (парсер не бачив товар) не заважають', () => {
    const r = scoreDeal(withDrop(0.15, 6, { series: history((age) => (age < 6 ? 17_000 : BASE), { skip: (a) => a > 2 && a % 5 === 0 }) }))
    expect(r.status).toBe('real')
  })

  it('сьогоднішній запис у серії ігнорується, береться currentPrice', () => {
    const r = scoreDeal(withDrop(0.15, 5, { series: history((age) => (age === 0 ? 5_000 : age < 5 ? 17_000 : BASE)) }))
    expect(r.discountPercent).toBe(15)
  })

  it('магазин перебільшує знижку — лишається справжньою, але з приміткою', () => {
    const r = scoreDeal(withDrop(0.12, 4, { claimedOldPrice: 25_000 }))
    expect(r.status).toBe('real')
    expect(r.claimedPercent).toBe(29.6)
    expect(codes(r)).toContain('claim_overstated')
  })

  it('не каже «найнижча», якщо ціна трохи вища за мінімум, а показує на скільки', () => {
    // Знижка 15% тримається 10 діб, у середині була ціна на 100 ₴ нижча, зараз 17 000
    const r = scoreDeal(input({ series: history((age) => (age >= 3 && age <= 5 ? 16_900 : age < 10 ? 17_000 : BASE)), currentPrice: 17_000 }))
    expect(r.status).toBe('real')
    expect(codes(r)).toContain('near_low')
    expect(codes(r)).not.toContain('market_low')
    expect(r.reasons.find((x) => x.code === 'near_low')?.text).toBe('Ціна лише на 0,6% вища за мінімум ринку за 60 днів: 16\u00A0900\u00A0₴.')
  })

  it('найнижча за 60 днів, якщо нижчої ціни за весь період не було', () => {
    const r = scoreDeal(withDrop(0.15, 5))
    expect(r.reasons.find((x) => x.code === 'market_low')?.text).toBe('Це найнижча ціна ринку за останні 60 днів.')
  })

  it('найнижча за 30 днів, якщо нижча ціна була давніше, але ненабагато', () => {
    // 40–45 діб тому було 16 900, зараз 17 000 після зниження: за останні 30 діб дешевше не було
    const r = scoreDeal(input({ series: history((age) => (age >= 40 && age <= 45 ? 16_900 : age < 10 ? 17_000 : BASE)), currentPrice: 17_000 }))
    expect(r.status).toBe('real')
    expect(r.reasons.find((x) => x.code === 'market_low')?.text).toBe('Це найнижча ціна ринку за останні 30 днів.')
  })

  it('не перебільшує період, якщо історія коротша за 60 днів', () => {
    const r = scoreDeal(input({ series: history((age) => (age < 4 ? 17_000 : BASE), { from: 20 }), currentPrice: 17_000 }))
    expect(r.status).toBe('real')
    expect(r.reasons.find((x) => x.code === 'market_low')?.text).toBe('Це найнижча ціна ринку за останні 20 днів.')
  })

  it('мінімуми за 30 і 60 діб враховують поточну ціну', () => {
    const r = scoreDeal(withDrop(0.15, 3))
    expect(r.min30).toBe(17_000)
    expect(r.min60).toBe(17_000)
  })
})

describe('scoreDeal: відсів фейків', () => {
  it('«підняли, потім знизили»: ціну накрутили, потім повернули до звичайної', () => {
    const spiked = Math.round(BASE * 1.22)
    const r = scoreDeal(input({ series: history((age) => (age >= 3 && age <= 14 ? spiked : BASE)), claimedOldPrice: spiked }))
    expect(r.status).toBe('fake')
    expect(r.score).toBe(0)
    expect(r.discountPercent).toBeLessThan(1)
    expect(codes(r)).toEqual(expect.arrayContaining(['recent_price_spike', 'store_claim_not_confirmed']))
    expect(r.reasons.find((x) => x.code === 'recent_price_spike')?.text).toContain('24 400 ₴')
  })

  it('накрутка без закресленої ціни теж розпізнається', () => {
    const spiked = Math.round(BASE * 1.2)
    const r = scoreDeal(input({ series: history((age) => (age >= 2 && age <= 12 ? spiked : BASE)) }))
    expect(r.status).toBe('fake')
    expect(codes(r)).toContain('recent_price_spike')
  })

  it('нестабільна історія: ціна стрибає вгору-вниз, сьогодні «падіння»', () => {
    const r = scoreDeal(input({ series: history((age) => (Math.floor(age / 3) % 2 === 1 ? 23_000 : BASE)), currentPrice: BASE }))
    expect(r.status).toBe('fake')
    expect(codes(r)).toContain('unstable_prices')
  })

  it('нестабільна історія не рятує навіть велику знижку від типової ціни', () => {
    // Ціна гойдається 20 000 ↔ 14 000, сьогодні 14 000: медіана 17 000, але стрибки частіші за поріг
    const r = scoreDeal(
      input({ series: history((age) => (Math.floor(age / 2) % 2 === 0 ? 14_000 : 20_000), { from: 60 }), currentPrice: 14_000 }),
    )
    expect(r.status).toBe('fake')
    expect(r.score).toBe(0)
  })

  it('постійна «акція» магазину: закреслена ціна є, знижки немає', () => {
    const r = scoreDeal(input({ claimedOldPrice: 25_000 }))
    expect(r.status).toBe('fake')
    expect(r.claimedPercent).toBe(20)
    expect(r.discountPercent).toBe(0)
    expect(codes(r)).toEqual(['store_claim_not_confirmed'])
    expect(r.reasons[0]?.text).toContain('знижки немає')
  })

  it('акція закінчується: ціна вже відскочила від мінімуму — не справжня', () => {
    const low = Math.round(BASE * 0.85)
    const r = scoreDeal(input({ series: history((age) => (age >= 8 && age <= 12 ? low : age < 8 ? Math.round(low * 1.08) : BASE)), currentPrice: Math.round(low * 1.08) }))
    expect(r.status).toBe('none')
    expect(codes(r)).toEqual(['above_recent_low'])
  })
})

describe('scoreDeal: інші стани', () => {
  it('стабільна ціна: знижки немає', () => {
    const r = scoreDeal(input())
    expect(r.status).toBe('none')
    expect(r.score).toBe(0)
    expect(r.reasons[0]?.text).toBe('Ціна на типовому рівні, знижки немає.')
  })

  it('знижка нижча за поріг (3%) не вважається помітною', () => {
    const r = scoreDeal(withDrop(0.03, 5))
    expect(r.status).toBe('none')
    expect(r.discountPercent).toBe(3)
    expect(r.reasons[0]?.text).toContain('3%')
  })

  it('замало історії: навіть велике падіння ціни не дає знижки', () => {
    const r = scoreDeal(input({ series: history((age) => (age < 2 ? 17_000 : BASE), { from: 9 }), currentPrice: 17_000 }))
    expect(r.status).toBe('insufficient_data')
    expect(r.score).toBe(0)
    expect(r.basePrice).toBeNull()
    expect(r.reasons[0]?.text).toContain('Замало даних')
  })

  it('багато записів, але охоплення менше за мінімум — теж замало', () => {
    const dense = Array.from({ length: 30 }, (_, i) => ({ date: new Date(TODAY.getTime() - (1 + (i % 9)) * DAY), price: BASE }))
    expect(scoreDeal(input({ series: dense })).status).toBe('insufficient_data')
  })

  it('ціна вища за типову не дає від\'ємної знижки', () => {
    const r = scoreDeal(input({ currentPrice: 24_000 }))
    expect(r.status).toBe('none')
    expect(r.discountPercent).toBe(0)
    expect(r.discountAmount).toBe(0)
  })

  it('усі пороги беруться з конфігу', () => {
    expect(scoreDeal(withDrop(0.15, 5), { minDiscountPercent: 20 }).status).toBe('none')
    expect(scoreDeal(withDrop(0.03, 5), { minDiscountPercent: 2 }).status).toBe('real')
    expect(scoreDeal(withDrop(0.15, 5), { minHistoryDays: 100 }).status).toBe('insufficient_data')
  })
})

describe('scoreDeal: скор і сортування', () => {
  it('більша знижка дає вищий скор за інших рівних', () => {
    expect(scoreDeal(withDrop(0.2, 5)).score).toBeGreaterThan(scoreDeal(withDrop(0.1, 5)).score)
  })

  it('оцінка 5.0 з 2 відгуками не обганяє 4.7 з 800', () => {
    const lucky = scoreDeal(withDrop(0.15, 5, { rating: 5.0, reviewCount: 2 }))
    const proven = scoreDeal(withDrop(0.15, 5, { rating: 4.7, reviewCount: 800 }))
    expect(proven.score).toBeGreaterThan(lucky.score)
    expect(proven.quality).toBeGreaterThan(lucky.quality)
  })

  it('товар без відгуків отримує середню якість, а не нуль', () => {
    const none = scoreDeal(withDrop(0.15, 5, { rating: null, reviewCount: 0 }))
    expect(none.status).toBe('real')
    expect(none.score).toBeGreaterThan(0)
    expect(none.quality).toBeGreaterThan(scoreDeal(withDrop(0.15, 5, { rating: 3.2, reviewCount: 500 })).quality)
  })

  it('більше магазинів — вищий скор, але нерівно (логарифм)', () => {
    const s = (n: number) => scoreDeal(withDrop(0.15, 5, { shopsCount: n })).score
    expect(s(1)).toBeLessThan(s(2))
    expect(s(2)).toBeLessThan(s(6))
    expect(s(6) - s(5)).toBeLessThan(s(2) - s(1))
    expect(s(12)).toBe(s(6)) // стеля популярності
  })

  it('фейкова й відсутня знижки мають нульовий скор', () => {
    expect(scoreDeal(input({ claimedOldPrice: 25_000 })).score).toBe(0)
    expect(scoreDeal(input()).score).toBe(0)
  })
})
