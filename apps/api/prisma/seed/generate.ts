import { CATEGORIES, PRODUCTS, SHOPS, type Scenario, type SeedProductDef } from './catalog'
import { startOfUtcDay } from '../../src/lib/dates'
import { Rng, hashString } from './prng'

export const HISTORY_DAYS = 90
const DAY_MS = 86_400_000

export interface GeneratedProduct {
  key: string
  def: SeedProductDef
  ean: string | null
}

export interface GeneratedOffer {
  productKey: string
  shopSlug: string
  externalId: string
  price: number
  inStock: boolean
  url: string
  /** JSON-рядок: позначка сиду та закреслена ціна магазину, якщо була */
  rawData: string
  lastSeenAt: Date
}

export interface GeneratedPricePoint {
  productKey: string
  shopSlug: string
  date: Date
  price: number
  inStock: boolean
  isPromo: boolean
}

export interface SeedData {
  today: Date
  products: GeneratedProduct[]
  offers: GeneratedOffer[]
  pricePoints: GeneratedPricePoint[]
}

export { startOfUtcDay }

/** Ціна в "магазинному" вигляді: 12 499, 4 599. Завжди ціле й закінчується на 99. */
export function nice(x: number): number {
  return Math.max(99, Math.round(x / 100) * 100 - 1)
}

export function productKey(def: SeedProductDef): string {
  return `${def.brand}-${def.modelCode}`
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Штрихкод EAN-13 з префіксом 200: діапазон 20–29 зарезервований для
 * внутрішнього використання, тож тестові коди не збігаються з реальними товарами.
 */
export function fakeEan(index: number): string {
  const base = '200' + String(100_000 + index * 7919).padStart(9, '0')
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(base[i]) * (i % 2 === 0 ? 1 : 3)
  return base + String((10 - (sum % 10)) % 10)
}

/** Кусково-стала "хиталка" ціни: змінюється раз на 5–14 діб на ±amp. */
function wanderSeries(rng: Rng, amp: number): number[] {
  const series = new Array<number>(HISTORY_DAYS).fill(0)
  let age = HISTORY_DAYS - 1
  while (age >= 0) {
    const len = rng.int(5, 14)
    const level = rng.range(-amp, amp)
    for (let i = 0; i < len && age >= 0; i++, age--) series[age] = level
  }
  return series
}

/** Фази "високо/низько" для сценарію yoyo. Індекс — вік у добах (0 — сьогодні). */
function yoyoPhases(rng: Rng): boolean[] {
  const high = new Array<boolean>(HISTORY_DAYS).fill(false)
  let age = HISTORY_DAYS - 1
  let isHigh = rng.chance(0.5)
  while (age >= 0) {
    const len = rng.int(2, 5)
    for (let i = 0; i < len && age >= 0; i++, age--) high[age] = isHigh
    isHigh = !isHigh
  }
  // Сьогодні ціна "впала" після кількох діб на високому рівні
  high[0] = false
  high[1] = true
  high[2] = true
  return high
}

interface ShopSeries {
  shopSlug: string
  /** Тривалість історії в добах (1..90) */
  length: number
  priceByAge: number[]
  promoByAge: boolean[]
  /** Закреслена ціна магазину станом на сьогодні */
  oldPrice: number | null
}

function buildProduct(def: SeedProductDef, key: string): ShopSeries[] {
  const rng = new Rng(hashString(key))
  const scenario: Scenario = def.scenario

  const chosen = rng.shuffle(SHOPS).slice(0, def.shops)
  const yoyo = scenario.kind === 'yoyo' ? yoyoPhases(rng) : null
  const yoyoAmp = rng.range(0.1, 0.16)
  const declineTotal = rng.range(0.06, 0.09)
  const spikeLen = rng.int(9, 16)
  const spikeSince = rng.int(2, 5) // скільки діб ціна вже "знижена" назад
  const spikeRise = rng.range(0.17, 0.28)

  return chosen.map((shop, shopIndex) => {
    const length = scenario.kind === 'short' ? scenario.days : HISTORY_DAYS
    const lag = rng.int(0, 2)
    const factor = shop.priceFactor * (1 + rng.range(-0.015, 0.015))
    const wander = wanderSeries(rng, scenario.kind === 'stable' ? 0.008 : 0.006)

    const priceByAge = new Array<number>(length).fill(0)
    const promoByAge = new Array<boolean>(length).fill(false)
    let oldPrice: number | null = null

    for (let age = length - 1; age >= 0; age--) {
      let mult = 1
      let isPromo = false

      switch (scenario.kind) {
        case 'stable':
          isPromo = scenario.permanentPromo === true
          break
        case 'decline':
          mult = 1 - declineTotal * ((HISTORY_DAYS - 1 - age) / (HISTORY_DAYS - 1))
          break
        case 'genuine': {
          const saleShops = scenario.saleShops ?? chosen.length
          const onSale = shopIndex < saleShops
          const saleDays = Math.max(1, scenario.days - lag)
          if (onSale && age < saleDays) {
            mult = 1 - scenario.drop
            isPromo = true
          }
          break
        }
        case 'fakeSpike': {
          const a = age + lag
          const since = Math.max(1, spikeSince - lag)
          if (a >= since && a < since + spikeLen) mult = 1 + spikeRise
          else if (a < since) isPromo = true
          break
        }
        case 'yoyo':
          if (yoyo?.[Math.min(age + (lag > 1 ? 1 : 0), HISTORY_DAYS - 1)]) mult = 1 + yoyoAmp
          break
        case 'short':
          if (age < 2) mult = 0.85
          break
      }

      priceByAge[age] = nice(def.price * factor * mult * (1 + (wander[age] ?? 0)))
      promoByAge[age] = isPromo
    }

    // Закреслена ціна, яку показує магазин
    const today = priceByAge[0] as number
    if (scenario.kind === 'genuine' && promoByAge[0]) {
      oldPrice = nice(def.price * factor)
    } else if (scenario.kind === 'fakeSpike' && promoByAge[0]) {
      oldPrice = nice(def.price * factor * (1 + spikeRise))
    } else if (scenario.kind === 'stable' && scenario.permanentPromo) {
      oldPrice = nice(today * (1.18 + (hashString(key + shop.slug) % 14) / 100))
    }

    return { shopSlug: shop.slug, length, priceByAge, promoByAge, oldPrice }
  })
}

export function generateSeed(today: Date): SeedData {
  const day = startOfUtcDay(today)
  const products: GeneratedProduct[] = []
  const offers: GeneratedOffer[] = []
  const pricePoints: GeneratedPricePoint[] = []

  PRODUCTS.forEach((def, index) => {
    const key = productKey(def)
    products.push({ key, def, ean: index % 2 === 0 ? fakeEan(index) : null })

    const rng = new Rng(hashString(key + ':offers'))
    const series = buildProduct(def, key)

    const cheapestToday = series.reduce((a, b) => ((b.priceByAge[0] as number) < (a.priceByAge[0] as number) ? b : a))

    for (const s of series) {
      for (let age = s.length - 1; age >= 0; age--) {
        // Парсер іноді пропускає добу; останні 3 доби й перший запис не чіпаємо
        if (age > 2 && age < s.length - 1 && rng.chance(0.02)) continue
        pricePoints.push({
          productKey: key,
          shopSlug: s.shopSlug,
          date: new Date(day.getTime() - age * DAY_MS),
          price: s.priceByAge[age] as number,
          inStock: true,
          isPromo: s.promoByAge[age] as boolean,
        })
      }

      // Не в наявності буває лише не найдешевша пропозиція
      const inStock = s === cheapestToday || !rng.chance(0.08)
      if (!inStock) {
        const last = pricePoints[pricePoints.length - 1]
        if (last) last.inStock = false
      }

      offers.push({
        productKey: key,
        shopSlug: s.shopSlug,
        externalId: `${s.shopSlug}-${100_000 + (hashString(key + s.shopSlug) % 900_000)}`,
        price: s.priceByAge[0] as number,
        inStock,
        url: `https://example.com/${s.shopSlug}/p/${key}`,
        rawData: JSON.stringify({ seed: true, ...(s.oldPrice ? { oldPrice: s.oldPrice } : {}) }),
        lastSeenAt: day,
      })
    }
  })

  return { today: day, products, offers, pricePoints }
}

export { CATEGORIES, SHOPS }
