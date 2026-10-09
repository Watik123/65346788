import { describe, expect, it } from 'vitest'
import type { ProductDetailResponse } from './api'
import { decodeProduct, encodeProduct, productBucket, PRODUCT_BUCKETS, splitProducts } from './static'

const product = (id: number): ProductDetailResponse => ({
  id,
  name: `Товар ${id}`,
  brand: 'LG',
  modelCode: null,
  ean: null,
  imageUrl: null,
  rating: null,
  reviewCount: 0,
  category: { slug: 'televizory', name: 'Телевізори', parent: null },
  deal: null,
  offers: [],
  history: {
    market: [
      { date: '2026-09-29', price: 15999 },
      { date: '2026-09-30', price: 15499 },
      { date: '2026-10-03', price: 14999 },
    ],
    shops: [{ slug: 'ktc', name: 'KTC', points: [{ date: '2026-10-02', price: 15999 }] }],
  },
})

describe('стисла історія цін', () => {
  it('розпаковується без втрат, з пропущеними днями і через місяць', () => {
    const p = product(1)
    const stored = encodeProduct(p)
    expect(stored.history.market).toEqual({ start: '2026-09-29', prices: [15999, 15499, null, null, 14999] })
    expect(decodeProduct(JSON.parse(JSON.stringify(stored)))).toEqual(p)
  })

  it('порожня історія лишається порожньою', () => {
    const p = { ...product(2), history: { market: [], shops: [] } }
    expect(decodeProduct(encodeProduct(p))).toEqual(p)
  })

  it('товари розкладаються по файлах за id', () => {
    const files = splitProducts([product(1), product(1 + PRODUCT_BUCKETS), product(5)])
    expect([...files.keys()].sort((a, b) => a - b)).toEqual([1, 5])
    expect(Object.keys(files.get(productBucket(1)) ?? {})).toEqual(['1', String(1 + PRODUCT_BUCKETS)])
  })
})
