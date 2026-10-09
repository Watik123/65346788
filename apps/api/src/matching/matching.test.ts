import { describe, expect, it } from 'vitest'
import { extractAttributes, normalizeCode, type MatchInput } from './attributes'
import { compareProducts } from './compare'

const attrs = (name: string, brand: string, modelCode: string | null = null, ean: string | null = null) => ({ ...extractAttributes({ name, brand, modelCode, ean } as MatchInput), ean })
const decide = (a: ReturnType<typeof attrs>, b: ReturnType<typeof attrs>) => compareProducts(a, b).decision

describe('extractAttributes', () => {
  it('пам\'ять, колір, діагональ, рік, модифікації, комплект', () => {
    const s = attrs('Смартфон Samsung Galaxy S26 Ultra 12/512GB Black (SM-S948BZKGEUC)', 'Samsung')
    expect(s).toMatchObject({ brand: 'samsung', ramGb: 12, storageGb: 512, color: 'black', variants: ['ultra'], bundle: false })
    expect(s.codes).toEqual(['SMS948BZKGEUC']) // «12/512GB» не код моделі

    expect(attrs('Телевізор LG 55" OLED evo C5 OLED55C56LA 2026', 'LG')).toMatchObject({ diagonal: 55, year: 2026, codes: expect.arrayContaining(['OLED55C56LA']) })
    // Справжні назви ноутбуків KTC: «Ryzen 5 / 150» не плутаємо з пам'яттю
    expect(attrs('Ноутбук Lenovo LOQ 15ARP10E 83S0007GRA Luna Grey - 15.6" IPS 144 Гц / AMD Ryzen 5 / 150 / DDR5 16 ГБ / PCI-E SSD 512 ГБ / GeForce RTX 3050', 'Lenovo')).toMatchObject({ ramGb: 16, storageGb: 512, diagonal: 15.6 })
    expect(attrs('Ноутбук Lenovo ThinkPad T14s G7 21YVS0LC00 Black - 14" IPS 60 Гц / Intel Core Ultra 7 / 355 / DDR5 32 ГБ / PCI-E SSD 1 ТБ / Intel Graphics', 'Lenovo')).toMatchObject({ ramGb: 32, storageGb: 1024, color: 'black' })
    expect(attrs('Смартфон Samsung Galaxy A27 5G 8/256 Black (SM-A276BZKCEUC)', 'Samsung')).toMatchObject({ ramGb: 8, storageGb: 256 })
    expect(attrs('Смартфон Apple iPhone 17 256GB Чорний', 'Apple')).toMatchObject({ storageGb: 256, color: 'black' })
    expect(attrs('Смартфон Xiaomi 15T + навушники', 'Xiaomi').bundle).toBe(true)
  })

  it('нормалізує коди', () => {
    expect(normalizeCode('sm-s948b zk/geuc')).toBe('SMS948BZKGEUC')
  })
})

describe('compareProducts', () => {
  it('однаковий EAN: той самий, різні EAN: різні, навіть за однакових назв', () => {
    expect(decide(attrs('A', 'X', null, '4006381333931'), attrs('B', 'X', null, '4006381333931'))).toBe('same')
    expect(decide(attrs('Телевізор LG 55UT80006LA', 'LG', null, '4006381333931'), attrs('Телевізор LG 55UT80006LA', 'LG', null, '0036000291452'))).toBe('different')
  })

  it('однаковий код моделі в одного бренду: той самий, хоч назви записані по-різному', () => {
    const ktc = attrs('Телевізор LED LG 43UA75006LA (Smart TV, Wi-Fi, 3840x2160)', 'LG')
    const other = attrs('Телевізор LG 43" 4K UHD 43UA75006LA', 'LG')
    expect(compareProducts(ktc, other)).toMatchObject({ decision: 'same', reasons: ['однаковий код моделі 43UA75006LA'] })
  })

  it('різна пам\'ять, колір, модифікація, рік чи комплект: різні товари', () => {
    const base = attrs('Смартфон Samsung Galaxy S26 12/256GB Black (SM-S942B)', 'Samsung', 'SM-S942B')
    expect(decide(base, attrs('Смартфон Samsung Galaxy S26 12/512GB Black (SM-S942B)', 'Samsung', 'SM-S942B'))).toBe('different')
    expect(decide(base, attrs('Смартфон Samsung Galaxy S26 12/256GB White (SM-S942B)', 'Samsung', 'SM-S942B'))).toBe('different')
    expect(decide(base, attrs('Смартфон Samsung Galaxy S26 Ultra 12/256GB Black', 'Samsung'))).toBe('different')
    expect(decide(base, attrs('Смартфон Samsung Galaxy S26 12/256GB Black (SM-S942B) + чохол', 'Samsung', 'SM-S942B'))).toBe('different')
    expect(decide(attrs('Телевізор Xiaomi TV A Pro 55 2025', 'Xiaomi'), attrs('Телевізор Xiaomi TV A Pro 55 2026', 'Xiaomi'))).toBe('different')
  })

  it('інший бренд: різні, навіть з однаковим кодом', () => {
    expect(decide(attrs('Пилосос ABC12345', 'Bosch'), attrs('Пилосос ABC12345', 'Siemens'))).toBe('different')
  })

  it('частковий збіг коду (суфікс кольору/регіону) і дуже схожі назви: на ручну перевірку', () => {
    expect(decide(attrs('Samsung Galaxy S26 Ultra 12/512GB (SM-S948B)', 'Samsung'), attrs('Samsung Galaxy S26 Ultra 12/512GB (SM-S948BZKGEUC)', 'Samsung'))).toBe('review')
    expect(decide(attrs('Робот-пилосос Xiaomi Robot Vacuum H50 Pro', 'Xiaomi'), attrs('Робот-пилосос Xiaomi Robot Vacuum H50 Pro EU', 'Xiaomi'))).toBe('review')
  })

  it('однакові назви без кодів, і характеристики не суперечать: той самий', () => {
    expect(decide(attrs('Смартфон XIAOMI REDMI 17 4/256GB Black', 'XIAOMI'), attrs('Смартфон Xiaomi Redmi 17 4/256GB (Black)', 'Xiaomi'))).toBe('same')
    expect(decide(attrs('Смартфон OPPO A6 Pro 4G 8/256GB Stellar Blue', 'OPPO'), attrs('Смартфон OPPO A6 PRO 4G 8/256GB Stellar Blue', 'OPPO'))).toBe('same')
    // Внутрішній номер KTC у дужках і слова-описи («акумуляторний», «ручний бездротовий») не заважають
    expect(decide(attrs('Смартфон Poco X8 Pro 8/256GB Green (1191424)', 'POCO'), attrs('Смартфон POCO X8 Pro 8/256GB Green', 'POCO'))).toBe('same')
    expect(decide(attrs('Акумуляторний пилосос Dyson V16 Piston Animal (492963-01)', 'Dyson'), attrs('Ручний бездротовий пилосос Dyson V16 Piston Animal (492963-01)', 'Dyson'))).toBe('same')
    // Пам'ять різна — ні, хоч решта однакова
    expect(decide(attrs('Смартфон Xiaomi Redmi 17 4/128GB Black', 'Xiaomi'), attrs('Смартфон Xiaomi Redmi 17 4/256GB Black', 'Xiaomi'))).toBe('different')
  })

  it('частковий збіг коду серії, але різні артикули: різні, без ручної перевірки', () => {
    expect(decide(attrs('Ігровий ноутбук ACER Nitro V 15 ANV15-52-75W7 Black (NH.QZ8EU.010)', 'ACER'), attrs('Ноутбук Acer Nitro V 15 ANV15-52 Obsidian Black (NH.QV2EU.00V)', 'Acer'))).toBe('different')
    // Процесор у назві одного магазину не робить його «іншим артикулом»
    expect(decide(attrs('Ноутбук Lenovo IdeaPad Slim 3 15IRH10 i5-13420H 16/512GB (83K100CBRA)', 'Lenovo'), attrs('Ноутбук LENOVO IdeaPad Slim 3 15IRH10 (83K100CBRA)', 'LENOVO'))).toBe('same')
  })

  it('справжні назви з різних магазинів (пробний збір 9 жовтня 2026 р.)', () => {
    // Цитрус пише технологію екрана й рік, Foxtrot лише код
    expect(decide(attrs('Телевізор Samsung 55" Mini LED 4K UE55M70HAUXUA Vision AI 2026', 'Samsung'), attrs('Телевізор SAMSUNG UE55M70HAUXUA', 'SAMSUNG'))).toBe('same')
    expect(decide(attrs('Телевізор Samsung Neo QLED Mini LED 75QN70F (QE75QN70FAUXUA)', 'SAMSUNG', 'QE75QN70FAUXUA'), attrs('Телевізор SAMSUNG QE75QN70FAUXUA', 'SAMSUNG'))).toBe('same')
    expect(decide(attrs('Телевізор Samsung 40F6000 (UE40F6000FUXUA)', 'SAMSUNG', 'UE40F6000FUXUA'), attrs('Телевізор Samsung 40" Full HD UE40F6000FUXUA', 'Samsung'))).toBe('same')
    expect(decide(attrs('Телевізор LED LG 43UA75006LA (Smart TV, Wi-Fi, 3840x2160)', 'LG', '43UA75006LA'), attrs('Телевізор LG 43UA75006LA', 'LG'))).toBe('same')
    // Одна серія ноутбуків, різні конфігурації: спільний код серії не робить їх одним товаром
    expect(decide(attrs('Ноутбук HP 200-G2i Black (DS9F6ET)', 'HP', 'DS9F6ET'), attrs('Ноутбук HP 200-G2i (DS9G2ET)', 'HP', 'DS9G2ET'))).toBe('different')
    expect(decide(attrs('Ноутбук Lenovo IdeaPad Slim 3 16IPH11 Cosmic Blue (83US006RRA)', 'LENOVO', '83US006RRA'), attrs('Ноутбук LENOVO IdeaPad Slim 5 16IPH11 Cosmic Blue (83S6005RRA)', 'LENOVO', '83S6005RRA'))).toBe('different')
    expect(decide(attrs('Ноутбук LENOVO LOQ 17IRX10 Luna Grey (83JH00EJRA)', 'LENOVO', '83JH00EJRA'), attrs('Ноутбук LENOVO LOQ 17IRX10 Luna Grey (83JH003NRA)', 'LENOVO', '83JH003NRA'))).toBe('different')
    // Той самий артикул, хоч в одній назві є ще код серії
    expect(decide(attrs('Ноутбук ASUS Vivobook 16 M1607GA-MB009 (90NB16Z1-M000A0)', 'ASUS', '90NB16Z1-M000A0'), attrs('Ноутбук ASUS M1607GA-MB009 (90NB16Z1-M000A0)', 'ASUS', '90NB16Z1-M000A0'))).toBe('same')
    expect(decide(attrs('Ноутбук ASUS Vivobook 16 M1607GA-MB009 Quiet Blue - 16" IPS 60 Гц / AMD Ryzen AI 7 / 445 / DDR5 16 ГБ / PCI-E SSD 512 ГБ / Radeon Graphics', 'ASUS', 'M1607GA-MB009'), attrs('Ноутбук ASUS M1607GA-MB009 (90NB16Z1-M000A0)', 'ASUS', '90NB16Z1-M000A0'))).toBe('same')
    // PRO окремим словом — інша модель, хоч код той самий
    expect(decide(attrs('Телевізор HISENSE 43E7S PRO', 'HISENSE'), attrs('Телевізор Hisense 43E7S', 'Hisense'))).toBe('different')
  })

  it('зовсім різні моделі одного бренду: різні', () => {
    expect(decide(attrs('Робот-пилосос Xiaomi Robot Vacuum H50 Pro', 'Xiaomi'), attrs('Робот-пилосос Xiaomi Robot Vacuum S40', 'Xiaomi'))).toBe('different')
  })
})
