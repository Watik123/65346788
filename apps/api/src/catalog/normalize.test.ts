import { describe, expect, it } from 'vitest'
import type { ParsedProduct } from '../scraping/types'
import { brandFromName, normalizeRecord } from './normalize'

const p = (over: Partial<ParsedProduct>): ParsedProduct => ({
  externalId: '1',
  url: 'https://shop.example/product/1',
  name: 'Телевізор Samsung QE55Q7FAAUXUA',
  brand: 'Samsung',
  modelCode: null,
  ean: null,
  categorySlug: 'televizory',
  imageUrl: null,
  price: 20000,
  oldPrice: null,
  inStock: true,
  rating: null,
  reviewCount: 0,
  raw: null,
  ...over,
})

describe('normalizeRecord', () => {
  it('звичайний запис не змінюється (той самий об\'єкт)', () => {
    const rec = p({})
    expect(normalizeRecord('foxtrot', rec)).toBe(rec)
  })

  it('Ябко: «(Ultra)» — товар із платним пакетом, не беремо; «(Standard)» прибираємо з назви', () => {
    expect(normalizeRecord('jabko', p({ name: 'Samsung Galaxy S26 12/256GB (Black) (Ultra)' }))).toBeNull()
    expect(normalizeRecord('jabko', p({ name: 'Samsung Galaxy S26 12/256GB (Black) (Standard)' }))?.name).toBe('Samsung Galaxy S26 12/256GB (Black)')
    // Модель «Ultra» в інших магазинів — це не позначка Ябка
    expect(normalizeRecord('foxtrot', p({ name: 'Смартфон Samsung Galaxy S26 Ultra 12/256GB Black' }))).not.toBeNull()
  })

  it('Ябко: назву, обрізану на лапках, доповнюємо з адреси товару', () => {
    const r = normalizeRecord('jabko', p({ name: 'Монітор Samsung 27\\', brand: 'Samsung', categorySlug: 'monitory', url: 'https://jabko.ua/product/monitor-samsung-27-odyssey-g5-oled-180hz-ls27fg502sixua-ua' }))
    expect(r?.name).toBe('Монітор Samsung 27" ODYSSEY G5 OLED 180HZ LS27FG502SIXUA')
  })

  it('iSpace: бренд чужих товарів беремо з назви, шаблонні дужки прибираємо', () => {
    const r = normalizeRecord('ispace', p({ name: 'CANYON TWS-11 {Бездротове} Гарнітура, Зелений', brand: 'Apple', categorySlug: 'navushnyky' }))
    expect(r).toMatchObject({ brand: 'Canyon', name: 'CANYON TWS-11 Гарнітура, Зелений' })
    expect(normalizeRecord('ispace', p({ name: 'Навушники BANG & OLUFSEN Beoplay HX Timber (1224002)', brand: 'Apple' }))?.brand).toBe('Bang & Olufsen')
    expect(normalizeRecord('ispace', p({ name: 'iPhone 17, 256 ГБ, Black', brand: 'Apple' }))?.brand).toBe('Apple')
    expect(brandFromName('Навушники Marshall Major V Black')).toBe('Marshall')
  })

  it('аксесуари й приладдя не беремо, техніку з подібними словами — беремо', () => {
    const skip = (name: string, categorySlug = 'navushnyky') => normalizeRecord('moyo', p({ name, categorySlug }))
    expect(skip('Змінні амбушюри до навушників 2E SVOЇ Mix Сірі 1 пара (2E-OECSMGR)')).toBeNull()
    expect(skip('Фільтр LG HEPA-класу H13 для очисника повітря', 'ochyshchuvachi')).toBeNull()
    expect(skip('Подушечки для очищувача', 'ochyshchuvachi')).toBeNull()
    expect(skip('Акумулятор до кондиціонера EcoFlow Wave 2', 'kondytsionery')).toBeNull()
    expect(skip('Додаткова батарея EcoFLow DELTA Pro 3 Extra Battery', 'zaryadni-stantsii')).toBeNull()
    expect(skip('Автоматичне введення резерву ENERSOL EPG-5500SEA', 'heneratory')).toBeNull()
    expect(skip('Мікрофон JBL PartyBox Wireless Mic Black', 'portatyvna-akustyka')).toBeNull()
    expect(skip('Акумуляторний пилосос Philips XC3133/01', 'pylososy')).not.toBeNull()
    expect(skip('Батарея універсальна Choetech B659 10000mAh', 'powerbanky')).not.toBeNull()
    expect(skip('Очищувач повітря Sharp UA-KCP100E-W', 'ochyshchuvachi')).not.toBeNull()
  })

  it('товар з іншого розділу отримує свою категорію', () => {
    expect(normalizeRecord('ttt', p({ name: 'Робот-пилосос Dreame X60 Ultra', categorySlug: 'pylososy' }))?.categorySlug).toBe('roboty-pylososy')
    expect(normalizeRecord('foxtrot', p({ name: 'Відпарювач Tefal DT2020E1', categorySlug: 'prasky' }))?.categorySlug).toBe('vidparyuvachi')
    expect(normalizeRecord('foxtrot', p({ name: 'Праска Tefal FV5697', categorySlug: 'prasky' }))?.categorySlug).toBe('prasky')
  })

  it('неправдоподібна закреслена ціна відкидається, звичайна лишається', () => {
    expect(normalizeRecord('foxtrot', p({ price: 9999, oldPrice: 1_599_900 }))?.oldPrice).toBeNull()
    expect(normalizeRecord('foxtrot', p({ price: 9999, oldPrice: 15_999 }))?.oldPrice).toBe(15_999)
  })

  it('«код моделі», що насправді бренд чи загальне позначення, перечитується з назви', () => {
    expect(normalizeRecord('foxtrot', p({ name: 'Гарнітура A4TECH Bloody M320 Black', brand: 'A4TECH', modelCode: 'A4TECH' }))?.modelCode).toBeNull()
    expect(normalizeRecord('ttt', p({ name: 'Маршрутизатор TP-LINK Deco BE22 BE3600 (2-pack)', brand: 'TP-Link', modelCode: '2-PACK' }))?.modelCode).toBeNull()
    expect(normalizeRecord('foxtrot', p({ modelCode: 'QE55Q7FAAUXUA' }))?.modelCode).toBe('QE55Q7FAAUXUA')
  })
})
