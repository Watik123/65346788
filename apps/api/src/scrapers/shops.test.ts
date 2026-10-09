import { describe, expect, it } from 'vitest'
import type { ListingParse, ParsedProduct } from '../scraping/types'
import { parseCitrusListing } from './citrus'
import { parseFoxtrotListing } from './foxtrot'
import { isNotNew } from './listing-utils'
import { parseMoyoListing } from './moyo'

/**
 * Зразки сторінок відтворюють будову розмітки, яку показала розвідка 9 жовтня 2026 р.
 * (npm run probe -- --deep=... --select=...), скорочено до потрібних елементів.
 */

const productsOf = (r: ListingParse): ParsedProduct[] => r.outcomes.flatMap((o) => (o.kind === 'product' ? [o.product] : []))
const skipsOf = (r: ListingParse) => r.outcomes.flatMap((o) => (o.kind === 'skip' ? [o.reason] : []))

describe('MOYO', () => {
  const ref = { url: 'https://www.moyo.ua/ua/comp-and-periphery/notebooks/', categorySlug: 'noutbuky' }
  const b64 = (s: string) => Buffer.from(s).toString('base64')
  const card = (o: { id: string; name: string; brand?: string; price: number; old?: number; status?: string; reviews?: number; stars?: number }) => `
    <div class="product-card goods-item add-data ga-item ${o.price === 0 ? 'not-available' : ''}" data-id="${o.id}" data-product_id="${o.id}" data-price="${o.price}" data-name="${o.name}" data-img="https://i.moyo.ua/img/products/${o.id}_96.jpg" data-brand="${o.brand ?? 'HP'}" data-category="Ноутбуки" data-status-product="${o.status ?? 'В наличии'}">
      <div class="product-card_header"><p class="product-card_id">${o.id}</p></div>
      <a href="https://www.moyo.ua/ua/noutbuk_${o.id}/${o.id}.html" class="product-card_image no-colors"><img class="first-image lazy-intersection" src="https://www.moyo.ua/images/bx_loader.gif" data-srcset-hash="${b64(`https://i.moyo.ua/img/products/${o.id}_200.jpg`)}"></a>
      <a href="https://www.moyo.ua/ua/noutbuk_${o.id}/${o.id}.html?utm_source=x#reviews" class="product-card_title gtm-link-product"><span>${o.name}</span></a>
      <div class="product-card_reviews"><div class="reviews-rate"><div class="rate-star_container">${'<div class="rate-star active-start"></div>'.repeat(o.stars ?? 0)}</div></div><div class="reviews-count hash_links"><span class="icon"></span><span class="link link--dashed">${o.reviews ?? 0}</span></div></div>
      <div class="product-card_bottom-block"><div class="product-card_price-block">
        ${o.old ? `<div class="product-card_price_oldprice"> ${o.old.toLocaleString('uk-UA')}₴ </div>` : ''}
        <div class="product-card_price_current sale"> ${o.price.toLocaleString('uk-UA')}₴ </div>
      </div></div>
    </div>`
  const page = (cards: string, next = '<link rel="next" href="/ua/comp-and-periphery/notebooks/?page=2">') => `<html><head>${next}</head><body>
    <div class="catalog_product-block"><div class="catalog_products js-products-list">${cards}</div></div>
    <div class="recommended">${card({ id: '999', name: 'Ноутбук з блоку рекомендацій', price: 1000 })}</div></body></html>`

  it('бере дані з атрибутів картки, закреслену ціну, оцінку, справжнє фото; лише основний список', () => {
    const r = parseMoyoListing(page(card({ id: '734732', name: 'Ноутбук ASUS TUF Gaming A15 FA506NCQ-HN065 (90NR0QE7-M003K0)', brand: 'ASUS', price: 49999, old: 64999, reviews: 8, stars: 5 }) + card({ id: '821007', name: 'Ноутбук HP 15-fc0331ua (DM8F9EA)', price: 38999, reviews: 3, stars: 4 })), ref)
    const [asus, hp] = productsOf(r)
    expect(asus).toMatchObject({
      externalId: '734732',
      url: 'https://www.moyo.ua/ua/noutbuk_734732/734732.html',
      brand: 'ASUS',
      modelCode: '90NR0QE7-M003K0',
      categorySlug: 'noutbuky',
      price: 49999,
      oldPrice: 64999,
      inStock: true,
      rating: 5,
      reviewCount: 8,
      imageUrl: 'https://i.moyo.ua/img/products/734732_200.jpg',
    })
    expect(hp).toMatchObject({ externalId: '821007', oldPrice: null, rating: 4, reviewCount: 3 })
    expect(productsOf(r).map((p) => p.externalId)).not.toContain('999')
    expect(r.nextUrl).toBe('https://www.moyo.ua/ua/comp-and-periphery/notebooks/?page=2')
  })

  it('«Заканчивается» означає, що товар ще продається', () => {
    const r = parseMoyoListing(page(card({ id: '640679', name: 'Телевізор Samsung Neo QLED Mini LED 100QN80F (QE100QN80FUXUA)', brand: 'SAMSUNG', price: 179999, old: 199999, status: 'Заканчивается' })), ref)
    expect(productsOf(r)[0]).toMatchObject({ externalId: '640679', price: 179999, oldPrice: 199999, inStock: true })
  })

  it('товари без наявності пропускає; сторінка з самих таких зупиняє обхід', () => {
    const sold = card({ id: '660083', name: 'Ноутбук HP OmniBook 5', price: 0, status: 'Нет в наличии' })
    const r = parseMoyoListing(page(sold + sold.replaceAll('660083', '660084')), ref)
    expect(skipsOf(r)).toEqual(['sold_out', 'sold_out'])
    expect(r.nextUrl).toBeNull()
  })

  it('однакові відгуки й зірки на всіх картках вважає заглушкою', () => {
    const cards = Array.from({ length: 6 }, (_, i) => card({ id: String(100 + i), name: `Ноутбук HP ${i}`, price: 20000 + i, reviews: 8, stars: 5 })).join('')
    expect(productsOf(parseMoyoListing(page(cards), ref)).every((p) => p.rating === null && p.reviewCount === 0)).toBe(true)
  })

  it('не йде в іншу категорію і не вигадує сторінок', () => {
    const one = card({ id: '1', name: 'Ноутбук HP 1', price: 20000 })
    expect(parseMoyoListing(page(one, '<link rel="next" href="/ua/telecommunication/smart/?page=2">'), ref).nextUrl).toBeNull()
    expect(parseMoyoListing(page(one, ''), ref).nextUrl).toBeNull()
  })
})

describe('Foxtrot', () => {
  const ref = { url: 'https://www.foxtrot.com.ua/uk/shop/stiralki.html', categorySlug: 'pralni-mashyny' }
  const card = (o: { code: string; title: string; brand?: string; price: number; old?: number; variant?: string; rating?: string; reviews?: number; type?: string }) => `
    <div class="product-card" data-id="5042" data-class-id="139" data-code="${o.code}" data-type="${o.type ?? 'Product'}" data-brand="${o.brand ?? 'BEKO'}" data-title="${o.title}" data-variant="${o.variant ?? 'InStock'}" data-price="${o.price}">
      <div class="product-card__image"><div itemscope itemtype="https://schema.org/ImageObject"><meta itemprop="thumbnailUrl" content="https://files.foxtrot.com.ua/PhotoNew/${o.code}_Small.jpg">
        <a href="/uk/shop/item-${o.code}.html" class="images"><picture class="product-card__img"><img src="https://files.foxtrot.com.ua/PhotoNew/${o.code}_Small.jpg" alt="Купити ${o.title}"></picture></a></div></div>
      <div class="product-card-wrap-color"><div class="info-article">Код: ${o.code}</div></div>
      <div class="info"><a data-ecom href="/uk/shop/item-${o.code}.html"><div class="product-card__title"><span class="product-card__title-img"><img src="x.png" alt="Акція"></span> ${o.title} </div></a>
        <div class="info-row"><div class="info-col">
          ${o.rating ? `<div class="product-rate"><i class="icon-fox-full-star"></i><span>${o.rating}</span></div>` : ''}
          ${o.reviews ? `<span class="product-reviews"><span class="product-reviews-text">${o.reviews} <span>відгуків</span></span></span>` : ''}
        </div></div></div>
      <div class="product-prices"><div class="prices-block">
        ${o.old ? `<div class="price--old">${o.old.toLocaleString('uk-UA')} ₴</div><div class="price--discount">-10%</div>` : ''}
        <div class="price-group"><span class="price--current">${o.price.toLocaleString('uk-UA')} ₴</span></div>
      </div></div>
    </div>`
  const pagination = '<div class="listing__pagination"><a href="/uk/shop/stiralki.html?page=2">2</a><a href="/uk/shop/stiralki.html?page=3">3</a><a href="/ru/shop/stiralki.html?page=2">рус</a></div>'

  it('бере код, бренд, ціну з атрибутів; закреслену ціну, оцінку й відгуки з картки', () => {
    const r = parseFoxtrotListing(card({ code: '7251312', title: 'Пральна машина HISENSE WF3S8045BW3/UA (WF3S8045BW3)', brand: 'HISENSE', price: 15799, old: 17999, rating: '4.8', reviews: 28 }) + pagination, ref)
    expect(productsOf(r)[0]).toMatchObject({
      externalId: '7251312',
      url: 'https://www.foxtrot.com.ua/uk/shop/item-7251312.html',
      name: 'Пральна машина HISENSE WF3S8045BW3/UA (WF3S8045BW3)',
      brand: 'HISENSE',
      modelCode: 'WF3S8045BW3',
      categorySlug: 'pralni-mashyny',
      price: 15799,
      oldPrice: 17999,
      inStock: true,
      rating: 4.8,
      reviewCount: 28,
      imageUrl: 'https://files.foxtrot.com.ua/PhotoNew/7251312_Small.jpg',
    })
    expect(r.nextUrl).toBe('https://www.foxtrot.com.ua/uk/shop/stiralki.html?page=2')
  })

  it('друга сторінка веде на третю; остання нікуди', () => {
    const one = card({ code: '1', title: 'Пральна машина BEKO A1', price: 10000 })
    expect(parseFoxtrotListing(one + pagination, { ...ref, url: `${ref.url}?page=2` }).nextUrl).toBe('https://www.foxtrot.com.ua/uk/shop/stiralki.html?page=3')
    expect(parseFoxtrotListing(one + pagination, { ...ref, url: `${ref.url}?page=3` }).nextUrl).toBeNull()
  })

  it('без наявності, не новий, не товар: пропускає з причиною', () => {
    const r = parseFoxtrotListing(
      card({ code: '1', title: 'Пральна машина BEKO A1', price: 10000, variant: 'OutOfStock' }) +
        card({ code: '2', title: 'Пральна машина BEKO A2 (уцінка)', price: 9000 }) +
        card({ code: '3', title: 'Набір BEKO', price: 9000, type: 'Set' }) +
        pagination,
      ref,
    )
    expect(skipsOf(r)).toEqual(['sold_out', 'not_new', 'not_a_product'])
  })
})

describe('Цитрус', () => {
  const ref = { url: 'https://citrus.ua/smartfony/', categorySlug: 'smartfony' }
  const item = (o: { id: number; name: string; price: number; old?: number; status?: string; brand?: string | null; vitrina?: boolean; rating?: number; comments?: number }) => ({
    id: o.id,
    url: `/smartfony/item-${o.id}.html`,
    name: o.name,
    status: { id: 1, type: o.status ?? 'CAN_BUY', description: 'Є в наявності' },
    reviews: { rating: o.rating ?? 0, commentsCount: o.comments ?? 0, likes: 0 },
    preview: [{ name: o.name, src: `https://cdn.citrus.ua/imgcache/size_180/uploads/shop/${o.id}-01.webp` }],
    brand: o.brand === null ? null : { id: 5, name: o.brand ?? 'Samsung' },
    prices: { price: o.price, old: o.old ?? 0, sale: 0, bonus: 0 },
    image: `/_next/image/?url=${encodeURIComponent(`https://cdn.citrus.ua/imgcache/size_180/uploads/shop/${o.id}-01.webp`)}&w=256&q=60`,
    isVitrina: o.vitrina ?? false,
  })
  const page = (products: unknown[], links = '<a href="/smartfony/page_2/">2</a><a href="/smartfony/page_36/">36</a>') =>
    `<html><body>${links}<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { data: { products } } } })}</script></body></html>`

  it('бере товари з вбудованого JSON: ціна, закреслена ціна, оцінка, справжня адреса фото', () => {
    const r = parseCitrusListing(page([item({ id: 752183, name: 'Apple iPhone 16 128GB Black (MYE73)', brand: 'Apple', price: 40499, old: 50999, rating: 4, comments: 6 })]), ref)
    expect(productsOf(r)[0]).toMatchObject({
      externalId: '752183',
      url: 'https://citrus.ua/smartfony/item-752183.html',
      brand: 'Apple',
      modelCode: 'MYE73',
      price: 40499,
      oldPrice: 50999,
      inStock: true,
      rating: 4,
      reviewCount: 6,
      imageUrl: 'https://cdn.citrus.ua/imgcache/size_180/uploads/shop/752183-01.webp',
    })
    expect(r.nextUrl).toBe('https://citrus.ua/smartfony/page_2/')
  })

  it('оцінку без відгуків не бере; old=0 означає «без закресленої ціни»', () => {
    const [p] = productsOf(parseCitrusListing(page([item({ id: 1, name: 'Samsung Galaxy A27', price: 9999, rating: 3, comments: 0 })]), ref))
    expect(p).toMatchObject({ rating: null, reviewCount: 0, oldPrice: null })
  })

  it('пропускає вітринні зразки, товари без наявності й без бренду', () => {
    const r = parseCitrusListing(page([item({ id: 1, name: 'A', price: 100, vitrina: true }), item({ id: 2, name: 'B', price: 100, status: 'OUT_OF_STOCK' }), item({ id: 3, name: 'C', price: 100, brand: null })]), ref)
    expect(skipsOf(r)).toEqual(['not_new', 'sold_out', 'missing_data'])
  })

  it('сторінки: page_2 → page_3, лише якщо на неї є посилання; немає JSON = немає товарів', () => {
    const one = [item({ id: 1, name: 'Samsung Galaxy A27', price: 9999 })]
    expect(parseCitrusListing(page(one, '<a href="/smartfony/page_3/">3</a>'), { ...ref, url: 'https://citrus.ua/smartfony/page_2/' }).nextUrl).toBe('https://citrus.ua/smartfony/page_3/')
    expect(parseCitrusListing(page(one, ''), ref).nextUrl).toBeNull()
    expect(parseCitrusListing('<html></html>', ref)).toEqual({ outcomes: [], nextUrl: null })
  })
})

describe('isNotNew', () => {
  it('впізнає вживані, уцінені, відновлені, вітринні', () => {
    for (const n of ['Смартфон Apple iPhone 15 б/в', 'Ноутбук (уцінка)', 'Пилосос Уцінений товар', 'iPhone 14 Відновлений', 'Як новий iPhone 13', 'Apple iPhone 12 Refurbished']) expect(isNotNew(n), n).toBe(true)
    for (const n of ['Смартфон Samsung Galaxy S26', 'Пральна машина Bosch WGB244']) expect(isNotNew(n), n).toBe(false)
  })
})
