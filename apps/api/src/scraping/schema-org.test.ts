import { describe, expect, it } from 'vitest'
import { parseProductPage } from './from-schema-org'
import { extractBreadcrumbs, extractJsonLdProducts, extractMetaProduct, normalizeEan, parseAvailability, parsePrice } from './schema-org'

const ld = (json: unknown) => `<html><head><script type="application/ld+json">${typeof json === 'string' ? json : JSON.stringify(json)}</script></head><body></body></html>`
const ref = { url: 'https://shop.example/p/1', categorySlug: 'televizory' }

describe('parsePrice', () => {
  it.each([
    [12499, 12499],
    [12499.4, 12499],
    ['12499', 12499],
    ['12 499', 12499],
    ['12 499,00', 12499],
    ['12 499.50', 12500],
    ['12,499.00', 12499],
    ['12.499,00', 12499],
    ['12,499', 12499],
    ['1.299', 1299],
    ['4599.99', 4600],
    ['₴ 4 599', 4599],
  ])('%j → %j', (input, expected) => expect(parsePrice(input)).toBe(expected))

  it.each([[0], [-5], ['безкоштовно'], [''], [null], [undefined], [NaN], [{}]])('%j → null', (input) => expect(parsePrice(input)).toBeNull())
})

describe('normalizeEan', () => {
  it('приймає EAN-13 з вірною контрольною цифрою і UPC-A', () => {
    expect(normalizeEan('4006381333931')).toBe('4006381333931')
    expect(normalizeEan(4006381333931)).toBe('4006381333931')
    expect(normalizeEan('036000291452')).toBe('0036000291452')
    expect(normalizeEan('4006-3813-33931')).toBe('4006381333931')
  })
  it('відкидає неправильні коди', () => {
    for (const bad of ['4006381333932', '12345', '', null, undefined, 'abc', '40063813339311']) expect(normalizeEan(bad)).toBeNull()
  })
})

describe('parseAvailability', () => {
  it('розпізнає варіанти schema.org', () => {
    expect(parseAvailability('https://schema.org/InStock')).toBe('in_stock')
    expect(parseAvailability('http://schema.org/LimitedAvailability')).toBe('in_stock')
    expect(parseAvailability('InStock')).toBe('in_stock')
    expect(parseAvailability('https://schema.org/OutOfStock')).toBe('out_of_stock')
    expect(parseAvailability('https://schema.org/PreOrder')).toBe('out_of_stock')
    expect(parseAvailability('щось інше')).toBe('unknown')
    expect(parseAvailability(undefined)).toBe('unknown')
  })
})

describe('extractJsonLdProducts', () => {
  it('читає звичайний Product', () => {
    const { products } = extractJsonLdProducts(
      ld({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Телевізор Samsung QE55Q80D',
        sku: 'S-100',
        mpn: 'QE55Q80DAUXUA',
        gtin13: '4006381333931',
        brand: { '@type': 'Brand', name: 'Samsung' },
        image: ['https://shop.example/1.jpg', 'https://shop.example/2.jpg'],
        aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', reviewCount: '214' },
        offers: { '@type': 'Offer', price: '36 999,00', priceCurrency: 'UAH', availability: 'https://schema.org/InStock', url: 'https://shop.example/p/1', seller: { '@type': 'Organization', name: 'Shop' } },
      }),
    )
    expect(products).toHaveLength(1)
    expect(products[0]).toMatchObject({
      name: 'Телевізор Samsung QE55Q80D',
      sku: 'S-100',
      mpn: 'QE55Q80DAUXUA',
      ean: '4006381333931',
      brand: 'Samsung',
      imageUrl: 'https://shop.example/1.jpg',
      price: 36999,
      currency: 'UAH',
      availability: 'in_stock',
      seller: 'Shop',
      rating: 4.8,
      reviewCount: 214,
    })
  })

  it('знаходить товар у @graph та у вкладених масивах, @type може бути масивом', () => {
    const { products } = extractJsonLdProducts(ld({ '@graph': [{ '@type': 'BreadcrumbList' }, { '@type': ['Product', 'Thing'], name: 'X', offers: { price: 100 } }] }))
    expect(products.map((p) => p.name)).toEqual(['X'])
  })

  it('з кількох пропозицій бере першу в наявності; AggregateOffer дає нижню ціну', () => {
    const several = extractJsonLdProducts(
      ld({ '@type': 'Product', name: 'X', offers: [{ price: 100, availability: 'OutOfStock' }, { price: 120, availability: 'InStock' }] }),
    ).products[0]
    expect(several).toMatchObject({ price: 120, availability: 'in_stock' })

    const aggregate = extractJsonLdProducts(ld({ '@type': 'Product', name: 'X', offers: { '@type': 'AggregateOffer', lowPrice: '99.9', priceCurrency: 'UAH' } })).products[0]
    expect(aggregate?.price).toBe(100)
  })

  it('не вигадує відсутнє: порожні поля дають null', () => {
    const p = extractJsonLdProducts(ld({ '@type': 'Product', name: 'X' })).products[0]
    expect(p).toMatchObject({ brand: null, sku: null, ean: null, price: null, currency: null, rating: null, reviewCount: 0, availability: 'unknown', imageUrl: null })
  })

  it('відкидає некоректну оцінку та хибний штрихкод', () => {
    const p = extractJsonLdProducts(ld({ '@type': 'Product', name: 'X', gtin13: '1234567890123', aggregateRating: { ratingValue: 9, reviewCount: 3 } })).products[0]
    expect(p?.ean).toBeNull()
    expect(p?.rating).toBeNull()
    expect(p?.reviewCount).toBe(3)
  })

  it('зламаний блок не заважає іншим; сирі переноси рядків виправляються', () => {
    const html = `<script type="application/ld+json">{ не json</script>
      <script type="application/ld+json">{"@type":"Product","name":"Рядок
      з переносом","offers":{"price":50}}</script>`
    const r = extractJsonLdProducts(html)
    expect(r.blocks).toBe(2)
    expect(r.invalidBlocks).toBe(1)
    expect(r.products).toHaveLength(1)
    expect(r.products[0]?.price).toBe(50)
  })

  it('сторінка без розмітки дає порожній результат', () => {
    expect(extractJsonLdProducts('<html><body>привіт</body></html>')).toEqual({ products: [], blocks: 0, invalidBlocks: 0 })
  })
})

describe('extractMetaProduct', () => {
  it('читає Open Graph і product:*', () => {
    const html = `<meta property="og:title" content="Пилосос"><meta property="og:image" content="https://shop.example/i.jpg">
      <meta property="product:price:amount" content="4 299"><meta property="product:price:currency" content="UAH"><meta property="product:availability" content="in stock">`
    expect(extractMetaProduct(html)).toMatchObject({ name: 'Пилосос', price: 4299, currency: 'UAH', availability: 'in_stock', imageUrl: 'https://shop.example/i.jpg' })
  })
})

describe('parseProductPage', () => {
  const product = (over: Record<string, unknown> = {}, offer: Record<string, unknown> = {}) =>
    ld({ '@type': 'Product', name: 'Пральна машина Bosch WAN24100UA', sku: 'B-1', brand: 'Bosch', offers: { price: 18999, priceCurrency: 'UAH', availability: 'InStock', ...offer }, ...over })

  it('збирає товар, готовий до запису', () => {
    const out = parseProductPage(product(), ref)
    expect(out).toMatchObject({ kind: 'product', product: { externalId: 'B-1', name: 'Пральна машина Bosch WAN24100UA', brand: 'Bosch', price: 18999, inStock: true, categorySlug: 'televizory', url: ref.url, oldPrice: null } })
  })

  it('чужого продавця маркетплейсу пропускає, власного бере', () => {
    const html = product({}, { seller: { name: 'ТОВ Сторонній' } })
    expect(parseProductPage(html, ref, { ownSellerNames: ['Shop'] })).toMatchObject({ kind: 'skip', reason: 'third_party_seller', detail: 'ТОВ Сторонній' })
    expect(parseProductPage(product({}, { seller: { name: 'shop' } }), ref, { ownSellerNames: ['Shop'] }).kind).toBe('product')
    expect(parseProductPage(html, ref).kind).toBe('product')
  })

  it('пропускає чужу валюту, відсутню ціну, відсутню розмітку', () => {
    expect(parseProductPage(product({}, { priceCurrency: 'USD' }), ref)).toMatchObject({ kind: 'skip', reason: 'wrong_currency' })
    expect(parseProductPage(product({}, { price: undefined }), ref)).toMatchObject({ kind: 'skip', reason: 'no_price' })
    expect(parseProductPage('<html></html>', ref)).toMatchObject({ kind: 'skip', reason: 'not_a_product' })
  })

  it('не вгадує бренд: без нього пропускає, якщо модуль не підказав, як його знайти', () => {
    const html = product({ brand: undefined, name: 'Samsung Galaxy S24' })
    expect(parseProductPage(html, ref)).toMatchObject({ kind: 'skip', reason: 'missing_data', detail: 'немає бренду' })
    const out = parseProductPage(html, ref, { brandFromName: (n) => (n.includes('Samsung') ? 'Samsung' : null) })
    expect(out).toMatchObject({ kind: 'product', product: { brand: 'Samsung' } })
  })

  it('без sku бере ідентифікатор з адреси, якщо модуль так вміє', () => {
    const html = product({ sku: undefined })
    expect(parseProductPage(html, ref)).toMatchObject({ kind: 'skip', reason: 'missing_data', detail: 'немає sku' })
    const out = parseProductPage(html, ref, { externalIdFromUrl: (u) => u.split('/').pop() ?? null })
    expect(out).toMatchObject({ kind: 'product', product: { externalId: '1' } })
  })

  it('запасний варіант: ціна з мета-тегів', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'X', sku: 's', brand: 'B' })}</script><meta property="product:price:amount" content="777">`
    expect(parseProductPage(html, ref)).toMatchObject({ kind: 'product', product: { price: 777 } })
  })
})

describe('extractBreadcrumbs', () => {
  it('читає крихти в порядку position, з адресами в різних формах', () => {
    const html = ld({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 3, name: 'Телевізори', item: 'https://shop.example/tv/' },
        { '@type': 'ListItem', position: 1, name: 'КТС', item: { '@id': 'https://shop.example/' } },
        { '@type': 'ListItem', position: 2, item: { '@id': 'https://shop.example/home/', name: 'Техніка для дому' } },
      ],
    })
    expect(extractBreadcrumbs(html)).toEqual([
      { name: 'КТС', url: 'https://shop.example/' },
      { name: 'Техніка для дому', url: 'https://shop.example/home/' },
      { name: 'Телевізори', url: 'https://shop.example/tv/' },
    ])
  })

  it('без розмітки крихт повертає порожній список', () => {
    expect(extractBreadcrumbs(ld({ '@type': 'Product', name: 'X' }))).toEqual([])
  })
})
