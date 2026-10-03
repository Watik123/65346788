import { describe, expect, it } from 'vitest'
import { DEFAULT_SCORING_CONFIG as C } from './config'
import { bayesianRating, popularityFactor, qualityFactor } from './rating'

describe('bayesianRating', () => {
  it('без відгуків повертає середню по ринку', () => {
    expect(bayesianRating(null, 0, C.quality)).toBe(C.quality.priorRating)
    expect(bayesianRating(5, 0, C.quality)).toBe(C.quality.priorRating)
  })

  it('мало відгуків — близько до середньої, багато — близько до власної оцінки', () => {
    expect(bayesianRating(5, 2, C.quality)).toBeLessThan(4.4)
    expect(bayesianRating(4.7, 800, C.quality)).toBeGreaterThan(4.65)
    expect(bayesianRating(4.7, 800, C.quality)).toBeGreaterThan(bayesianRating(5, 2, C.quality))
  })
})

describe('qualityFactor', () => {
  it('лежить у [minFactor, 1] і зростає з оцінкою', () => {
    expect(qualityFactor(1, 10_000, C.quality)).toBe(C.quality.minFactor)
    expect(qualityFactor(5, 10_000, C.quality)).toBeCloseTo(1, 1)
    expect(qualityFactor(4.8, 500, C.quality)).toBeGreaterThan(qualityFactor(4.2, 500, C.quality))
  })
})

describe('popularityFactor', () => {
  it('log(1 + n), нормований до refShops', () => {
    expect(popularityFactor(0, C.popularity)).toBe(0)
    expect(popularityFactor(C.popularity.refShops, C.popularity)).toBe(1)
    expect(popularityFactor(100, C.popularity)).toBe(1)
    expect(popularityFactor(1, C.popularity)).toBeCloseTo(Math.log(2) / Math.log(7), 10)
  })
})
