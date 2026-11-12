import { describe, expect, it } from 'vitest'
import { dayChange, decodeCatalog, encodeCatalog, queryCatalog, searchKey, toCatalogItem, type CatalogItemDto } from './catalog'

const category = { slug: 'smartfony', name: 'Смартфони', parent: { slug: 'elektronika', name: 'Електроніка' } }
const item = (id: number, name: string, over: Partial<CatalogItemDto> = {}): CatalogItemDto => ({
  ...toCatalogItem({ id, name, brand: 'Apple', imageUrl: `https://img.example/${id}.jpg`, category, deal: { status: 'none', bestPrice: 40000 + id, shopsCount: id, discountPercent: 0 } }),
  ...over,
})

const ALL: CatalogItemDto[] = [
  item(1, 'Apple iPhone 17 256GB Black (MG6J4)'),
  item(2, 'Смартфон APPLE iPhone 17 Pro 256GB Silver', { status: 'real', discountPercent: 12 }),
  item(3, 'Apple iPhone 16e 128GB White', { bestPrice: null, shopsCount: 0, status: null }),
  item(4, "Чайник De'Longhi KBOC 2001", { brand: "De'Longhi", category: { slug: 'elektrochainyky', name: 'Електрочайники', parentSlug: 'kukhnia' } }),
]
const ids = (r: { items: CatalogItemDto[] }) => r.items.map((i) => i.id)
const q = { sort: 'popular', page: 1, limit: 24 } as const

describe('queryCatalog', () => {
  it('пошук: усі слова запиту мають бути в назві чи бренді, регістр і розділові знаки не важать', () => {
    expect(ids(queryCatalog(ALL, { ...q, q: 'iphone 17 256' }))).toEqual([2, 1])
    expect(ids(queryCatalog(ALL, { ...q, q: 'IPHONE-17 pro' }))).toEqual([2])
    expect(ids(queryCatalog(ALL, { ...q, q: 'delonghi kboc' }))).toEqual([4])
    expect(queryCatalog(ALL, { ...q, q: 'такого немає' }).total).toBe(0)
    expect(searchKey("De’Longhi  KBOC-2001")).toBe('delonghi kboc 2001')
  })

  it('категорія (і батьківська), сортування; товари без наявності завжди наприкінці', () => {
    expect(ids(queryCatalog(ALL, { ...q, category: 'elektronika' }))).toEqual([2, 1, 3])
    expect(ids(queryCatalog(ALL, { ...q, category: 'elektrochainyky' }))).toEqual([4])
    expect(ids(queryCatalog(ALL, { ...q, sort: 'price_asc' }))).toEqual([1, 2, 4, 3])
    expect(ids(queryCatalog(ALL, { ...q, sort: 'price_desc' }))).toEqual([4, 2, 1, 3])
    expect(ids(queryCatalog(ALL, { ...q, sort: 'discount' }))[0]).toBe(2)
  })

  it('обране: лише вибрані товари; «подешевшали за добу» — від найбільшого падіння', () => {
    expect(ids(queryCatalog(ALL, { ...q, ids: [4, 1, 999] }))).toEqual([4, 1])
    const moved = ALL.map((i) => (i.id === 1 ? { ...i, dayChangePercent: -3 } : i.id === 4 ? { ...i, dayChangePercent: -12.5 } : i))
    expect(ids(queryCatalog(moved, { ...q, sort: 'drop' })).slice(0, 2)).toEqual([4, 1])
  })

  it('зміна за добу рахується лише між останньою добою з даними і попередньою', () => {
    const market = [
      { date: '2026-11-08', price: 10000 },
      { date: '2026-11-09', price: 9200 },
    ]
    expect(dayChange(market, '2026-11-09')).toBe(-8)
    // Товару сьогодні вже немає, або вчора його не було: порівнювати нема з чим
    expect(dayChange(market, '2026-11-10')).toBe(0)
    expect(dayChange([{ date: '2026-11-07', price: 10000 }, { date: '2026-11-09', price: 9200 }], '2026-11-09')).toBe(0)
    expect(dayChange([], '2026-11-09')).toBe(0)
    // Найдешевший магазин учора товар не продавав: це повернувся продавець, а не знизилась ціна
    expect(dayChange(market, '2026-11-09', [{ date: '2026-11-09', price: 9200 }])).toBe(0)
    expect(dayChange(market, '2026-11-09', [{ date: '2026-11-08', price: 9900 }, { date: '2026-11-09', price: 9200 }])).toBe(-8)
    const p = { id: 1, name: 'A', brand: 'B', imageUrl: null, category: { slug: 'c', name: 'C', parent: null }, deal: { status: 'none' as const, bestPrice: 9200, shopsCount: 1, discountPercent: 0 } }
    expect(toCatalogItem({ ...p, history: { market }, dataDay: '2026-11-09' }).dayChangePercent).toBe(-8)
    expect(toCatalogItem(p).dayChangePercent).toBe(0)
  })

  it('сторінки', () => {
    const r = queryCatalog(ALL, { ...q, limit: 3, page: 2 })
    expect(r).toMatchObject({ total: 4, pages: 2, page: 2 })
    expect(ids(r)).toEqual([3])
  })
})

describe('стислий каталог для сайту без сервера', () => {
  it('туди й назад: усе, крім фото, а фото окремо по категоріях', () => {
    const { catalog, images } = encodeCatalog(ALL)
    expect(decodeCatalog(JSON.parse(JSON.stringify(catalog)))).toEqual(ALL.map((i) => ({ ...i, imageUrl: null })))
    expect(Object.keys(images.get('smartfony') ?? {})).toEqual(['1', '2', '3'])
    expect(images.get('elektrochainyky')).toEqual({ '4': 'https://img.example/4.jpg' })
  })
})
