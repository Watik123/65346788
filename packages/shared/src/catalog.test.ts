import { describe, expect, it } from 'vitest'
import { decodeCatalog, encodeCatalog, queryCatalog, searchKey, toCatalogItem, type CatalogItemDto } from './catalog'

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
