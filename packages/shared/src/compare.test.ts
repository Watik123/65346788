import { describe, expect, it } from 'vitest'
import { queryCompare, toCompareItem, type CompareItemDto, type CompareSource } from './compare'

const shop = (slug: string, name = slug.toUpperCase()) => ({ slug, name })
const product = (id: number, offers: CompareSource['offers'], category = { slug: 'pylososy', name: 'Пилососи', parent: { slug: 'pobutova-tekhnika', name: 'Побутова техніка' } }): CompareSource => ({
  id,
  name: `Товар ${id}`,
  brand: 'AENO',
  imageUrl: null,
  rating: null,
  reviewCount: 0,
  category,
  offers,
})

describe('toCompareItem', () => {
  it('«знижка на папері»: двоє показують −72%, третій продає за ту саму ціну без знижки (AENO RC3S, 9 жовтня)', () => {
    const item = toCompareItem(
      product(1, [
        { shop: shop('citrus', 'Цитрус'), price: 4999, inStock: true, oldPrice: 17599 },
        { shop: shop('ktc', 'KTC'), price: 4999, inStock: true, oldPrice: null },
        { shop: shop('moyo', 'MOYO'), price: 4999, inStock: true, oldPrice: 17599 },
      ]),
    ) as CompareItemDto
    expect(item).toMatchObject({ minPrice: 4999, maxPrice: 4999, spreadAmount: 0, spreadPercent: 0 })
    expect(item.paper).toEqual({ shop: shop('citrus', 'Цитрус'), price: 4999, oldPrice: 17599, claimedPercent: 71.6, plainShop: shop('ktc', 'KTC'), plainPrice: 4999 })
  })

  it('знижка не «на папері», якщо без знижки продають лише дорожче або знижка мала', () => {
    const pricier = toCompareItem(
      product(2, [
        { shop: shop('a'), price: 9000, inStock: true, oldPrice: 12000 },
        { shop: shop('b'), price: 9500, inStock: true, oldPrice: null },
      ]),
    )
    expect(pricier?.paper).toBeNull()
    const small = toCompareItem(
      product(3, [
        { shop: shop('a'), price: 9500, inStock: true, oldPrice: 9999 },
        { shop: shop('b'), price: 9500, inStock: true, oldPrice: null },
      ]),
    )
    expect(small?.paper).toBeNull()
  })

  it('різниця цін; товари без наявності не рахуються; один магазин — не порівняння', () => {
    const item = toCompareItem(
      product(4, [
        { shop: shop('ktc'), price: 60999, inStock: true, oldPrice: null },
        { shop: shop('moyo'), price: 41499, inStock: true, oldPrice: null },
        { shop: shop('foxtrot'), price: 30000, inStock: false, oldPrice: null },
      ]),
    ) as CompareItemDto
    expect(item.prices.map((p) => p.shop.slug)).toEqual(['moyo', 'ktc'])
    expect(item).toMatchObject({ spreadAmount: 19500, spreadPercent: 32 })
    expect(toCompareItem(product(5, [{ shop: shop('ktc'), price: 100, inStock: true, oldPrice: null }]))).toBeNull()
  })
})

describe('queryCompare', () => {
  const items = [
    toCompareItem(product(1, [{ shop: shop('a'), price: 5000, inStock: true, oldPrice: 17600 }, { shop: shop('b'), price: 5000, inStock: true, oldPrice: null }])),
    toCompareItem(product(2, [{ shop: shop('a'), price: 41499, inStock: true, oldPrice: null }, { shop: shop('b'), price: 60999, inStock: true, oldPrice: null }], { slug: 'noutbuky', name: 'Ноутбуки', parent: { slug: 'elektronika', name: 'Електроніка' } })),
    toCompareItem(product(3, [{ shop: shop('a'), price: 9999, inStock: true, oldPrice: null }, { shop: shop('b'), price: 9999, inStock: true, oldPrice: null }])),
  ] as CompareItemDto[]

  it('сортування, фільтр «на папері», батьківська категорія й підсумок', () => {
    expect(queryCompare(items, { sort: 'spread', page: 1, limit: 10 }).items.map((i) => i.id)).toEqual([2, 1, 3])
    expect(queryCompare(items, { sort: 'paper', page: 1, limit: 10 }).items[0]?.id).toBe(1)
    expect(queryCompare(items, { sort: 'price', page: 1, limit: 10 }).items.map((i) => i.id)).toEqual([1, 3, 2])
    expect(queryCompare(items, { sort: 'spread', paperOnly: true, page: 1, limit: 10 }).items.map((i) => i.id)).toEqual([1])
    const electronics = queryCompare(items, { sort: 'spread', category: 'elektronika', page: 1, limit: 10 })
    expect(electronics.items.map((i) => i.id)).toEqual([2])
    expect(queryCompare(items, { sort: 'spread', page: 1, limit: 10 }).summary).toEqual({ products: 3, samePrice: 2, paper: 1 })
    expect(queryCompare(items, { sort: 'spread', page: 2, limit: 2 })).toMatchObject({ total: 3, pages: 2, items: [{ id: 3 }] })
  })
})
