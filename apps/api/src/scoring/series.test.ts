import { describe, expect, it } from 'vitest'
import { marketSeries } from './series'

const d = (day: number) => new Date(Date.UTC(2026, 9, day))

describe('marketSeries', () => {
  it('бере найнижчу ціну серед магазинів за кожну добу, від старих до нових', () => {
    const s = marketSeries([
      { date: d(2), price: 120, inStock: true },
      { date: d(1), price: 100, inStock: true },
      { date: d(1), price: 90, inStock: true },
      { date: d(2), price: 110, inStock: true },
    ])
    expect(s.map((p) => [p.date.getUTCDate(), p.price])).toEqual([
      [1, 90],
      [2, 110],
    ])
  })

  it('ігнорує ціни товарів, яких немає в наявності, і пропускає доби без жодної', () => {
    const s = marketSeries([
      { date: d(1), price: 50, inStock: false },
      { date: d(1), price: 100, inStock: true },
      { date: d(2), price: 40, inStock: false },
      { date: d(3), price: 105, inStock: true },
    ])
    expect(s.map((p) => p.price)).toEqual([100, 105])
  })

  it('порожній вхід дає порожню серію', () => {
    expect(marketSeries([])).toEqual([])
  })
})
