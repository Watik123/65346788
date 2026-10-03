import type { ScoringConfig } from './config'

/**
 * Байєсівська оцінка: товар із малою кількістю відгуків «підтягується» до
 * середньої по ринку, тож 5.0 з двома відгуками не обганяє 4.7 з 800.
 */
export function bayesianRating(rating: number | null, reviewCount: number, q: ScoringConfig['quality']): number {
  if (rating === null || reviewCount <= 0) return q.priorRating
  return (reviewCount * rating + q.priorWeight * q.priorRating) / (reviewCount + q.priorWeight)
}

/** Коефіцієнт якості в [minFactor, 1] */
export function qualityFactor(rating: number | null, reviewCount: number, q: ScoringConfig['quality']): number {
  const bayes = bayesianRating(rating, reviewCount, q)
  const t = (bayes - q.floorRating) / (q.topRating - q.floorRating)
  return Math.min(1, Math.max(q.minFactor, t))
}

/** Популярність: log(1 + магазини), нормована так, щоб refShops магазинів давали 1 */
export function popularityFactor(shopsCount: number, p: ScoringConfig['popularity']): number {
  if (shopsCount <= 0) return 0
  return Math.min(1, Math.log(1 + shopsCount) / Math.log(1 + p.refShops))
}
