import { mergeConfig, type ScoringOverrides } from './config'
import { reasons } from './explain'
import { popularityFactor, qualityFactor } from './rating'
import { countSwings, median, round1, round2 } from './stats'
import type { DealInput, DealResult, DealStatus, Reason } from './types'

const DAY_MS = 86_400_000

/**
 * Оцінює знижку на товар.
 *
 * База порівняння — типова (медіанна) ціна ринку за baselineDays діб, а не
 * закреслена ціна магазину. Знижка справжня, якщо одночасно:
 *   1. вона не менша за поріг (minDiscountPercent);
 *   2. історії достатньо (minHistoryDays);
 *   3. ціна не стрибала нещодавно вгору-вниз (нестабільна історія);
 *   4. ціна зараз на «дні»: не вища за мінімум періоду більш ніж на atLowTolerance.
 *
 * Фейк = знижка, яку бачить покупець (порівняно з нещодавньою ціною чи
 * закресленою ціною магазину), але яка зникає порівняно з типовою ціною.
 */
export function scoreDeal(input: DealInput, overrides: ScoringOverrides = {}): DealResult {
  const cfg = mergeConfig(overrides)
  const now = input.currentPrice
  const todayMs = input.today.getTime()

  // Історія до сьогодні, від найстаріших до найновіших
  const hist = input.series
    .map((p) => ({ age: Math.round((todayMs - p.date.getTime()) / DAY_MS), price: p.price }))
    .filter((p) => p.age >= 1 && p.age <= cfg.baselineDays)
    .sort((a, b) => b.age - a.age)

  const quality = qualityFactor(input.rating, input.reviewCount, cfg.quality)
  const popularity = popularityFactor(input.shopsCount, cfg.popularity)

  const prices = hist.map((p) => p.price)
  const min60 = Math.min(now, ...prices)
  const min30 = Math.min(now, ...hist.filter((p) => p.age <= 30).map((p) => p.price))

  const claimedPercent =
    input.claimedOldPrice !== null && input.claimedOldPrice > now
      ? round1(((input.claimedOldPrice - now) / input.claimedOldPrice) * 100)
      : null

  const result = (status: DealStatus, extra: Partial<DealResult> & { reasons: Reason[] }): DealResult => ({
    status,
    currentPrice: now,
    min30,
    min60,
    basePrice: null,
    discountPercent: 0,
    discountAmount: 0,
    claimedPercent,
    quality,
    popularity,
    score: 0,
    ...extra,
  })

  // 1. Замало історії: не робимо висновків
  const span = hist.length > 0 ? (hist[0]?.age ?? 0) : 0
  if (hist.length < cfg.minHistoryDays || span < cfg.minHistoryDays) {
    return result('insufficient_data', { reasons: [reasons.insufficientHistory(span, cfg.minHistoryDays)] })
  }

  // 2. Знижка від типової ціни
  const basePrice = Math.round(median(prices))
  const percent = round1(Math.max(0, ((basePrice - now) / basePrice) * 100))
  const amount = Math.max(0, basePrice - now)

  // 3. Ознаки фейку
  const recent = hist.filter((p) => p.age <= cfg.recentDays).map((p) => p.price)
  const recentMax = recent.length > 0 ? Math.max(...recent) : 0
  const spiked = recentMax >= basePrice * (1 + cfg.spikeThreshold)
  const apparentDropPercent = recentMax > 0 ? ((recentMax - now) / recentMax) * 100 : 0

  const swingSeries = [...hist.filter((p) => p.age <= cfg.swingWindowDays).map((p) => p.price), now]
  const swings = countSwings(swingSeries, cfg.swingThreshold)
  const unstable = swings >= cfg.maxSwings

  const minPrev = Math.min(...prices)
  const atLow = now <= minPrev * (1 + cfg.atLowTolerance)
  const aboveLowPercent = (now / minPrev - 1) * 100

  const firstHigher = hist.filter((p) => p.price > now * 1.02).reduce((min, p) => Math.min(min, p.age), Infinity)
  const daysAtLevel = Number.isFinite(firstHigher) ? firstHigher : span + 1

  const base = { basePrice, discountPercent: percent, discountAmount: amount }

  // 4. Рішення
  if (percent >= cfg.minDiscountPercent) {
    if (unstable) {
      return result('fake', { ...base, reasons: [reasons.unstablePrices(swings, cfg.swingWindowDays)] })
    }
    if (!atLow) {
      return result('none', { ...base, reasons: [reasons.aboveRecentLow(aboveLowPercent, cfg.baselineDays)] })
    }

    const why: Reason[] = [reasons.belowTypical(percent, amount, basePrice, cfg.baselineDays)]
    // «Найнижча» кажемо лише тоді, коли це правда: інакше чесно показуємо, наскільки ціна вища за дно
    const minPrev30 = hist.filter((p) => p.age <= 30).reduce((m, p) => Math.min(m, p.price), Infinity)
    // Спершу сильніше твердження; період не перебільшуємо, якщо історія коротша за вікно
    if (now <= minPrev) why.push(reasons.marketLow(Math.min(span, cfg.baselineDays)))
    else if (now <= minPrev30) why.push(reasons.marketLow(30))
    else why.push(reasons.nearLow(aboveLowPercent, minPrev, Math.min(span, cfg.baselineDays)))
    if (!spiked && swings <= 2) why.push(reasons.stableHistory())
    if (daysAtLevel <= cfg.freshDays) why.push(reasons.freshDrop(daysAtLevel))
    if (claimedPercent !== null && claimedPercent - percent >= cfg.claimOverstatedGap) {
      why.push(reasons.claimOverstated(claimedPercent, percent))
    }

    return result('real', { ...base, score: round2(percent * quality * popularity), reasons: why })
  }

  // Знижки від типової ціни немає. Чи є «видимість» знижки?
  const fakeWhy: Reason[] = []
  if (spiked && apparentDropPercent >= cfg.minDiscountPercent) {
    fakeWhy.push(reasons.recentPriceSpike(cfg.recentDays, recentMax, ((recentMax - basePrice) / basePrice) * 100))
  }
  if (unstable && apparentDropPercent >= cfg.minDiscountPercent) {
    fakeWhy.push(reasons.unstablePrices(swings, cfg.swingWindowDays))
  }
  if (claimedPercent !== null && claimedPercent >= cfg.claimThresholdPercent) {
    fakeWhy.push(reasons.storeClaimNotConfirmed(claimedPercent, percent, cfg.baselineDays))
  }
  if (fakeWhy.length > 0) return result('fake', { ...base, reasons: fakeWhy })

  return result('none', { ...base, reasons: [reasons.belowThreshold(percent, cfg.minDiscountPercent)] })
}
