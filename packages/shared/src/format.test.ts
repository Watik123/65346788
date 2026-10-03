import { describe, expect, it } from 'vitest'
import { formatNumber, formatPercent, formatPrice, pluralUk } from './format'

describe('formatPrice', () => {
  it('форматує як «12 499 ₴» з нерозривними пробілами', () => {
    expect(formatPrice(12499)).toBe('12 499 ₴')
    expect(formatPrice(4599)).toBe('4 599 ₴')
    expect(formatPrice(129999)).toBe('129 999 ₴')
    expect(formatPrice(999)).toBe('999 ₴')
    expect(formatPrice(1000000)).toBe('1 000 000 ₴')
  })

  it('округлює до гривні й не ламається на нулі', () => {
    expect(formatPrice(12498.6)).toBe('12 499 ₴')
    expect(formatPrice(0)).toBe('0 ₴')
    expect(formatNumber(-6600)).toBe('−6 600')
  })
})

describe('formatPercent', () => {
  it('використовує кому як десятковий роздільник', () => {
    expect(formatPercent(18)).toBe('18%')
    expect(formatPercent(17.46)).toBe('17%')
    expect(formatPercent(17.46, 1)).toBe('17,5%')
  })
})

describe('pluralUk', () => {
  const days = (n: number) => pluralUk(n, 'день', 'дні', 'днів')
  it('обирає правильну форму', () => {
    expect(days(1)).toBe('день')
    expect(days(2)).toBe('дні')
    expect(days(4)).toBe('дні')
    expect(days(5)).toBe('днів')
    expect(days(11)).toBe('днів')
    expect(days(12)).toBe('днів')
    expect(days(14)).toBe('днів')
    expect(days(21)).toBe('день')
    expect(days(22)).toBe('дні')
    expect(days(60)).toBe('днів')
    expect(days(0)).toBe('днів')
  })
})

describe('підписи для інтерфейсу', () => {
  it('рейтинг, відгуки, магазини, дати', async () => {
    const { formatRating, formatReviews, formatShops, formatDay } = await import('./format')
    expect(formatRating(4.8)).toBe('4,8')
    expect(formatRating(5)).toBe('5,0')
    expect(formatReviews(214)).toBe('214 відгуків')
    expect(formatReviews(1)).toBe('1 відгук')
    expect(formatReviews(1270)).toBe('1 270 відгуків')
    expect(formatReviews(23)).toBe('23 відгуки')
    expect(formatReviews(0)).toBe('Немає відгуків')
    expect(formatShops(1)).toBe('1 магазин')
    expect(formatShops(3)).toBe('3 магазини')
    expect(formatShops(6)).toBe('6 магазинів')
    expect(formatDay('2026-10-03')).toBe('3 жовтня')
    expect(formatDay('2026-01-21')).toBe('21 січня')
  })
})
