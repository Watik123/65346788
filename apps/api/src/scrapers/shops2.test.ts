import { describe, expect, it } from 'vitest'
import type { ListingParse, ParsedProduct } from '../scraping/types'
import { parseArtlineListing } from './artline'
import { parseIspaceListing, partNumberFromSlug } from './ispace'
import { parseJabkoListing } from './jabko'
import { parseTttListing } from './ttt'
import { parseVenconListing } from './vencon'

/**
 * Зразки сторінок Ябка, Vencon, Artline, TTT і iSpace за будовою, яку показала розвідка 9 жовтня 2026 р.
 * (npm run probe -- --deep=... --select=...), скорочено до потрібних елементів.
 */

const productsOf = (r: ListingParse): ParsedProduct[] => r.outcomes.flatMap((o) => (o.kind === 'product' ? [o.product] : []))
const skipsOf = (r: ListingParse) => r.outcomes.flatMap((o) => (o.kind === 'skip' ? [o.reason] : []))

describe('Ябко', () => {
  const ref = { url: 'https://jabko.ua/smartfony/', categorySlug: 'smartfony' }
  const card = (o: { id: string; name: string; brand?: string; price: number; old?: number; soldOut?: boolean; reviews?: number }) => `
    <div class="catalog-product-item"><div class="catalog-product-item--inner">
      <div class="catalog-product-item--img-wrap"><a href="https://jabko.ua/product/p-${o.id}"><img src="https://img.jabko.ua/${o.id}-300x300.png.webp" alt="${o.name}"></a></div>
      <div class="catalog-product-item--rating"><a href="https://jabko.ua/product/p-${o.id}"><div class="catalog-product-item--count"> (${o.reviews ?? 0}) </div></a></div>
      <div class="catalog-product-item--info">
        <a data-price="${o.price}" data-id="${o.id}" data-brand="${o.brand ?? 'Samsung'}" data-category="Смартфони" data-name="${o.name}" class="catalog-product-item--title" href="https://jabko.ua/product/p-${o.id}"> ${o.name} </a>
        <div class="catalog-product-item--set hidden"><span class="old">1 394$</span><span class="current">62 949&nbsp;<span>грн</span></span></div>
        ${
          o.soldOut
            ? '<div class="catalog-product-item--set no-price"><button type="button" class="catalog-product-item--to-cart oos-unavailable-btn" disabled=""> Немає в наявності </button></div>'
            : `<div class="catalog-product-item--set has-price"><button type="button" class="catalog-product-item--to-cart add-to-cart" data-id="${o.id}">Купити</button>
               <div class="catalog-product-item--price">${o.old ? `<span class="old">${o.old.toLocaleString('uk-UA')}&nbsp;<span>грн</span></span>` : ''}<span class="current">${o.price.toLocaleString('uk-UA')}&nbsp;<span>грн</span></span></div></div>`
        }
      </div></div></div>`
  const page = (cards: string, next = '<link rel="next" href="https://jabko.ua/smartfony/?page=2">') => `<html><head>${next}</head><body><div class="product_catalog_">${cards}</div></body></html>`

  it('бере ціну в гривнях (не приховану в доларах), закреслену ціну, бренд і відгуки', () => {
    const r = parseJabkoListing(page(card({ id: '56407', name: 'Samsung Galaxy S26 Ultra 12/512GB (Black) (Standard)', price: 53999, old: 62949, reviews: 3 })), ref)
    expect(productsOf(r)[0]).toMatchObject({
      externalId: '56407',
      url: 'https://jabko.ua/product/p-56407',
      name: 'Samsung Galaxy S26 Ultra 12/512GB (Black) (Standard)',
      brand: 'Samsung',
      price: 53999,
      oldPrice: 62949,
      inStock: true,
      reviewCount: 3,
      imageUrl: 'https://img.jabko.ua/56407-300x300.png.webp',
    })
    expect(r.nextUrl).toBe('https://jabko.ua/smartfony/?page=2')
  })

  it('продані й вживані пропускає; сторінка лише з таких зупиняє обхід', () => {
    const r = parseJabkoListing(page(card({ id: '1', name: 'б/у Samsung Galaxy Flip 7 FE 8/128GB (White) (Хороший стан)', price: 28219, soldOut: true }) + card({ id: '2', name: 'Samsung Galaxy A06 4/64GB', price: 4000, soldOut: true })), ref)
    expect(skipsOf(r)).toEqual(['not_new', 'sold_out'])
    expect(r.nextUrl).toBeNull()
  })
})

describe('Vencon', () => {
  const ref = { url: 'https://vencon.ua/ua/catalog/holodilniki', categorySlug: 'kholodylnyky' }
  const card = (o: { id: string; code: string; type: string; model: string; brand: string; price: number; old?: number; inStock?: boolean }) => `
    <li class="product-catalog-card type-plate google-data-layer-item" data-id="${o.id}" data-layer-params="listTitle:Каталог товаров;id:${o.code};name:${o.model};price:${o.price};category:Холодильники;brand:${o.brand};variant:${o.inStock === false ? 'Нет в наличии' : 'В наличии'};position:1">
      <article itemprop="item" itemscope itemtype="https://schema.org/Product"><div class="static-visible-container">
        <div class="top-info-block"><div class="availability-label"><span>${o.inStock === false ? 'Немає в наявності' : 'В наявності'}</span></div><div class="article-number"> Код: ${o.code} </div></div>
        <div class="img-container"><a class="img" href="/ua/products/p-${o.id}"><img class="img-responsive" src="/uploads/goods/${o.id}/main/p.jpg" alt=""></a></div>
        <div class="info-container">
          <a class="product-title black-link" href="/ua/products/p-${o.id}"><span itemprop="name"><span class="product-type">${o.type} </span><span>${o.model}</span></span></a>
          <div class="rating-and-review"><div class="review"><span class="review-link link">Написати відгук</span></div></div>
          <div class="product-price" itemprop="offers" itemscope itemtype="https://schema.org/Offer">
            ${o.old ? `<div class="old-price">${o.old.toLocaleString('uk-UA')} грн</div>` : ''}<span class="actual">${o.price.toLocaleString('uk-UA')} <span class="currency">грн</span></span>
            <meta itemprop="price" content="${o.price}"><meta itemprop="priceCurrency" content="UAH">
            <meta itemprop="availability" content="https://schema.org/${o.inStock === false ? 'OutOfStock' : 'InStock'}">
          </div>
        </div>
      </div></article>
    </li>`
  const page = (cards: string) => `<html><head><link href="https://vencon.ua/ua/catalog/holodilniki?page=2" rel="next"></head><body><ul id="catalog-products-list">${cards}</ul></body></html>`

  it('назва з типом товару, бренд з даних картки, ціна з мікророзмітки, закреслена ціна, повна адреса фото', () => {
    const r = parseVenconListing(page(card({ id: '310896', code: '309218', type: 'Холодильник', model: 'Samsung RB38T600FSA/UA', brand: 'Samsung', price: 23999, old: 27999 })), ref)
    expect(productsOf(r)[0]).toMatchObject({
      externalId: '310896',
      url: 'https://vencon.ua/ua/products/p-310896',
      name: 'Холодильник Samsung RB38T600FSA/UA',
      brand: 'Samsung',
      price: 23999,
      oldPrice: 27999,
      inStock: true,
      imageUrl: 'https://vencon.ua/uploads/goods/310896/main/p.jpg',
    })
    expect(r.nextUrl).toBe('https://vencon.ua/ua/catalog/holodilniki?page=2')
  })

  it('без наявності пропускає й далі не йде', () => {
    const r = parseVenconListing(page(card({ id: '1', code: '1', type: 'Холодильник', model: 'Holmer HTF-050', brand: 'Holmer', price: 4199, inStock: false })), ref)
    expect(skipsOf(r)).toEqual(['sold_out'])
    expect(r.nextUrl).toBeNull()
  })
})

describe('Artline', () => {
  const ref = { url: 'https://artline.ua/uk/catalog/noutbuki', categorySlug: 'noutbuky' }
  const card = (o: { id: string; name: string; brand: string; price: number; old?: number; preOrder?: boolean; reviews?: number; stars?: number }) => `
    <div class="goods-card" data-id="${o.id}" data-name="${o.name}" data-price="${o.price}" data-brand="${o.brand}">
      <a class="goods-card__img" href="https://artline.ua/uk/product/p-${o.id}"><img class="goods-card__image" src="https://img-artline.example/${o.id}.webp" alt=""></a>
      <div class="goods-card__rating" data-rev="${o.reviews ?? 0}"><div class="rating-stars__inner"><div class="rating-stars" style="--percent: calc(${o.stars ?? 0}/5*100%);"></div></div></div>
      <a href="https://artline.ua/uk/product/p-${o.id}" class="goods-card__title"><span>${o.name}</span></a>
      <div class="goods-card__price"><span class="goods-card__price-price"><div class="goods-card__old-price">${o.old ? `<del>${o.old} ₴</del>` : ' '}</div><span class="price-regular">${o.price}</span> ₴</span>
        <a class="goods-card__price-basket" :class="{ 'in-basket': isInBasket(${o.id}), 'pre-order': ${o.preOrder ? 1 : 0}, 'btn-disabled': 0 }" data-id="${o.id}" data-pre-order="${o.preOrder ? 1 : 0}"></a></div>
    </div>`
  const pagination = '<div class="pagin"><a href="https://artline.ua/uk/catalog/noutbuki/page=2" class="pagin__indicator">2</a></div>'

  it('дані з атрибутів картки, закреслена ціна, оцінка з зірок, код моделі з назви', () => {
    const r = parseArtlineListing(card({ id: '1', name: 'Ноутбук HP 200 G2i (DU9Z6ET)', brand: 'HP', price: 37999, old: 39999, reviews: 4, stars: 4.5 }) + pagination, ref)
    expect(productsOf(r)[0]).toMatchObject({
      externalId: '1',
      url: 'https://artline.ua/uk/product/p-1',
      name: 'Ноутбук HP 200 G2i (DU9Z6ET)',
      brand: 'HP',
      modelCode: 'DU9Z6ET',
      price: 37999,
      oldPrice: 39999,
      rating: 4.5,
      reviewCount: 4,
    })
    expect(r.nextUrl).toBe('https://artline.ua/uk/catalog/noutbuki/page=2')
  })

  it('передзамовлення не рахує наявністю; сторінка 2 веде на 3, лише якщо є посилання', () => {
    const r = parseArtlineListing(card({ id: '2', name: 'Ноутбук HP 15', brand: 'HP', price: 30000, preOrder: true }), ref)
    expect(skipsOf(r)).toEqual(['sold_out'])
    const one = card({ id: '3', name: 'Ноутбук HP 15', brand: 'HP', price: 30000 })
    expect(parseArtlineListing(one + '<a href="https://artline.ua/uk/catalog/noutbuki/page=3">3</a>', { ...ref, url: 'https://artline.ua/uk/catalog/noutbuki/page=2' }).nextUrl).toBe('https://artline.ua/uk/catalog/noutbuki/page=3')
    expect(parseArtlineListing(one, ref).nextUrl).toBeNull()
  })
})

describe('TTT', () => {
  const ref = { url: 'https://www.ttt.ua/ua/shop/category/telefony-mp3-gps/mobilnye-telefony/smartfony', categorySlug: 'smartfony' }
  const card = (o: { id: string; name: string; brand?: string; price: number; old?: number; preOrder?: boolean; reviews?: number; stars?: number }) => `
    <article class="product-cut product-cut--with-effect " data-product-scope="" data-gtm-name="${o.name}" data-gtm-id="${o.id}" data-gtm-price="${o.preOrder ? 0 : o.price}" data-gtm-brand="${o.brand ?? 'Apple'}" data-gtm-category="Смартфоны">
      <div class="product-photo__item" data-product-photo-href="https://www.ttt.ua/ua/shop/product/p-${o.id}"><img class="product-photo__img" src="data:image/gif;base64,R0lGOD" data-original="https://www.ttt.ua/uploads/shop/products/medium/${o.id}.jpg"></div>
      <div class="product-cut__row"><a class="product-cut__title link link--main" href="https://www.ttt.ua/ua/shop/product/p-${o.id}">${o.name} </a></div>
      <div class="star-rating"><ul class="star-rating__stars">${'<li class="star-rating__star" title="' + (o.stars ?? 0) + ' з 5 зірок"></li>'.repeat(5)}</ul>
        <div class="star-rating__votes"><a class="star-rating__link" href="#tab=comments-list"> ${o.reviews ?? 0} відгуків </a></div></div>
      <div class="product-cut__id"><span class="product-cut__id-code" data-product-number=""> 258509 </span></div>
      <div class="product-cut__row ${o.preOrder ? 'hidden' : ''}" data-product-price-section="">
        ${o.preOrder ? '<div class="product-cut__row soon"><p class="soon__body"><span class="soon__text">Передзамовлення</span></p></div>' : '<div class="product-cut__row available" data-product-available="available"><p class="available__body"><span class="available__text">В наявності</span></p></div>'}
        <div class="product-price"><ul class="product-price__list">
          ${o.old ? `<li class="product-price__item"><div class="product-price__old"><span class="product-price__value" data-product-price--origin="data-product-price--origin">${o.old.toLocaleString('uk-UA')}</span><span>грн.</span></div></li>` : ''}
          <li class="product-price__item"><div class="product-price__main"><span class="product-price__value" data-product-price--main="data-product-price--main">${o.preOrder ? 0 : o.price.toLocaleString('uk-UA')}</span><span>грн.</span></div></li>
        </ul></div>
      </div>
    </article>`
  const pages = (offsets: number[], path = '/ua/shop/category/telefony-mp3-gps/mobilnye-telefony/smartfony') =>
    offsets.map((n) => `<a href="https://www.ttt.ua${path}?per_page=${n}">${n / 24 + 1}</a>`).join('')

  it('дані з атрибутів картки, ціна з блоку ціни, закреслена ціна, оцінка, фото з data-original', () => {
    const r = parseTttListing(card({ id: '175167', name: 'Смартфон Apple iPhone 18 Pro 256GB (MJRQ4AF/A) Silver', price: 77999, old: 84999, reviews: 3, stars: 4 }) + pages([24, 48]), ref)
    expect(productsOf(r)[0]).toMatchObject({
      externalId: '175167',
      url: 'https://www.ttt.ua/ua/shop/product/p-175167',
      name: 'Смартфон Apple iPhone 18 Pro 256GB (MJRQ4AF/A) Silver',
      brand: 'Apple',
      price: 77999,
      oldPrice: 84999,
      inStock: true,
      rating: 4,
      reviewCount: 3,
      imageUrl: 'https://www.ttt.ua/uploads/shop/products/medium/175167.jpg',
    })
    expect(r.nextUrl).toBe(`${ref.url}?per_page=24`)
  })

  it('передзамовлення (прихований блок ціни, ціна 0) пропускає; наступна сторінка — найближчий більший зсув з посилань', () => {
    const r = parseTttListing(card({ id: '1', name: 'Смартфон Apple iPhone Duo 512GB', price: 69999, old: 69999, preOrder: true }), ref)
    expect(skipsOf(r)).toEqual(['sold_out'])
    expect(r.nextUrl).toBeNull()
    const one = card({ id: '2', name: 'Смартфон Apple iPhone 17 256GB', price: 50000 })
    const second = { ...ref, url: `${ref.url}?per_page=24` }
    expect(parseTttListing(one + pages([0, 48, 72]), second).nextUrl).toBe(`${ref.url}?per_page=48`)
    expect(parseTttListing(one + pages([0]), second).nextUrl).toBeNull()
    // Посилання на інший розділ не рахується
    expect(parseTttListing(one + pages([48], '/ua/shop/category/foto-video-audio-i-tv/televizory'), second).nextUrl).toBeNull()
  })
})

describe('iSpace', () => {
  const ref = { url: 'https://ispace.ua/category/macbook-air', categorySlug: 'noutbuky' }
  const card = (o: { slug: string; name: string; price: number; old?: number; button?: 'add-to-cart' | 'preorder' | 'notify-me' }) => `
    <div class="carousel-product" type="product"><div><div><div class="entity-card">
      <a href="/product/${o.slug}" class="entity-card_image-wrapper"><img src="https://cdn.example/${o.slug}.webp" class="entity-card_image" alt="${o.name}"></a>
      <a href="/product/${o.slug}" class="entity-card_name" data-title="${o.name.replace(/"/g, '&quot;')}"><span class="entity-card_name-text">${o.name}</span></a>
    </div></div></div>
    <div class="carousel-product_price-wrapper">
      ${o.old ? `<p class="carousel-product_action-price"><!--[-->${o.old.toLocaleString('uk-UA')} ₴<!--]--></p>` : '<!---->'}
      <p class="carousel-product_price"><span class="carousel-product_price-value${o.old ? ' carousel-product_price-value__discount' : ''}"><!--[-->${o.price.toLocaleString('uk-UA')} ₴<!--]--></span>${o.old ? `<span class="carousel-product_discount">-${(o.old - o.price).toLocaleString('uk-UA')} ₴</span>` : ''}</p>
      <button class="button carousel-product_button" data-test="carousel-product-${o.button ?? 'add-to-cart'}-button">У кошик</button>
    </div></div>`
  const page = (cards: string, pages = '<a href="/category/macbook-air">1</a><a href="/category/macbook-air?page=2" class="pagination_button">2</a>') =>
    `<html><body><div class="products-grid_grid">${cards}</div><div class="pagination">${pages}</div></body></html>`

  it('артикул з адреси, ціна зі знижкою й стара ціна, бренд Apple', () => {
    const r = parseIspaceListing(page(card({ slug: 'macbook-air-153-m5-10c-cpu10c-gpu-16-gb-512-gb-temnaia-noc-mdvh4ua-a', name: 'MacBook Air 15.3" M5 (10C CPU/10C GPU), 16 ГБ, 512 ГБ, Темна ніч', price: 86999, old: 92599 })), ref)
    expect(productsOf(r)[0]).toMatchObject({
      externalId: 'macbook-air-153-m5-10c-cpu10c-gpu-16-gb-512-gb-temnaia-noc-mdvh4ua-a',
      url: 'https://ispace.ua/product/macbook-air-153-m5-10c-cpu10c-gpu-16-gb-512-gb-temnaia-noc-mdvh4ua-a',
      name: 'MacBook Air 15.3" M5 (10C CPU/10C GPU), 16 ГБ, 512 ГБ, Темна ніч',
      brand: 'Apple',
      modelCode: 'MDVH4UA/A',
      price: 86999,
      oldPrice: 92599,
      inStock: true,
    })
    expect(r.nextUrl).toBe('https://ispace.ua/category/macbook-air?page=2')
    expect(partNumberFromSlug('iphone-15-256-gb-rozovyi-mtp73rx-a')).toBe('MTP73RX/A')
    expect(partNumberFromSlug('apple-tv-4k')).toBeNull()
  })

  it('передзамовлення й «повідомити мене» не наявні; сторінка лише з них зупиняє обхід', () => {
    const r = parseIspaceListing(
      page(card({ slug: 'macbook-air-a-mdvu4ua-a', name: 'MacBook Air 15.3"', price: 124499, button: 'preorder' }) + card({ slug: 'iphone-15-mtp73rx-a', name: 'iPhone 15, 256 ГБ, Рожевий', price: 40899, button: 'notify-me' })),
      ref,
    )
    expect(skipsOf(r)).toEqual(['sold_out', 'sold_out'])
    expect(r.nextUrl).toBeNull()
  })
})
