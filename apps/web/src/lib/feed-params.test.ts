import { describe, expect, it } from 'vitest'
import { activeFilterCount, parseFeedSearch, toApiParams, toSearchParams, PAGE_SIZE } from './feed-params'

const parse = (q: string) => parseFeedSearch(new URLSearchParams(q))

describe('parseFeedSearch', () => {
  it('порожнє посилання дає значення за замовчуванням', () => {
    expect(parse('')).toEqual({
      category: undefined,
      shops: [],
      minDiscount: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      minRating: undefined,
      sort: 'score',
      order: undefined,
      page: 1,
    })
  })

  it('читає всі параметри', () => {
    const f = parse('category=smartfony&shop=comfy,moyo&minDiscount=15&minPrice=5000&maxPrice=30000&minRating=4.5&sort=price&order=desc&page=3')
    expect(f).toMatchObject({
      category: 'smartfony',
      shops: ['comfy', 'moyo'],
      minDiscount: 15,
      minPrice: 5000,
      maxPrice: 30000,
      minRating: 4.5,
      sort: 'price',
      order: 'desc',
      page: 3,
    })
  })

  it('відкидає сміття замість того, щоб ламати сторінку', () => {
    const f = parse('sort=hack&order=sideways&minDiscount=abc&minPrice=-5&minRating=9&page=0&shop=,,comfy,comfy')
    expect(f.sort).toBe('score')
    expect(f.order).toBeUndefined()
    expect(f.minDiscount).toBeUndefined()
    expect(f.minPrice).toBeUndefined()
    expect(f.minRating).toBeUndefined()
    expect(f.page).toBe(1)
    expect(f.shops).toEqual(['comfy'])
  })
})

describe('toSearchParams', () => {
  it('не записує значення за замовчуванням', () => {
    expect(toSearchParams(parse('')).toString()).toBe('')
    expect(toSearchParams(parse('sort=score&page=1&minDiscount=0')).toString()).toBe('')
  })

  it('туди й назад дає те саме', () => {
    const q = 'category=pylososy&shop=comfy%2Cmoyo&minDiscount=10&maxPrice=20000&minRating=4.5&sort=discount&page=2'
    const f = parse(q)
    expect(parse(toSearchParams(f).toString())).toEqual(f)
  })
})

describe('toApiParams', () => {
  it('додає розмір сторінки й міняє місцями переплутані межі цін', () => {
    const p = toApiParams(parse('minPrice=30000&maxPrice=10000'))
    expect(p.limit).toBe(PAGE_SIZE)
    expect(p.minPrice).toBe(10000)
    expect(p.maxPrice).toBe(30000)
  })

  it('порожній список магазинів не потрапляє у запит', () => {
    expect(toApiParams(parse('')).shop).toBeUndefined()
  })
})

describe('activeFilterCount', () => {
  it('рахує фільтри, але не сортування й сторінку', () => {
    expect(activeFilterCount(parse('sort=price&page=2'))).toBe(0)
    expect(activeFilterCount(parse('category=x&shop=a,b&minDiscount=10&minPrice=1&maxPrice=2&minRating=4'))).toBe(6)
  })
})
