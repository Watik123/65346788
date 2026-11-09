import { describe, expect, it } from 'vitest'
import { extractAttributes, normalizeCode, type MatchInput } from './attributes'
import { compareProducts } from './compare'

const attrs = (name: string, brand: string, modelCode: string | null = null, ean: string | null = null) => ({ ...extractAttributes({ name, brand, modelCode, ean } as MatchInput), ean })
const decide = (a: ReturnType<typeof attrs>, b: ReturnType<typeof attrs>) => compareProducts(a, b).decision

describe('extractAttributes', () => {
  it('пам\'ять, колір, діагональ, рік, модифікації, комплект', () => {
    const s = attrs('Смартфон Samsung Galaxy S26 Ultra 12/512GB Black (SM-S948BZKGEUC)', 'Samsung')
    expect(s).toMatchObject({ brand: 'samsung', ramGb: 12, storageGb: 512, colors: ['black'], variants: ['ultra'], bundle: false })
    expect(s.codes).toEqual(['SMS948BZKGEUC']) // «12/512GB» не код моделі

    expect(attrs('Телевізор LG 55" OLED evo C5 OLED55C56LA 2026', 'LG')).toMatchObject({ diagonal: 55, year: 2026, codes: expect.arrayContaining(['OLED55C56LA']) })
    // Справжні назви ноутбуків KTC: «Ryzen 5 / 150» не плутаємо з пам'яттю
    expect(attrs('Ноутбук Lenovo LOQ 15ARP10E 83S0007GRA Luna Grey - 15.6" IPS 144 Гц / AMD Ryzen 5 / 150 / DDR5 16 ГБ / PCI-E SSD 512 ГБ / GeForce RTX 3050', 'Lenovo')).toMatchObject({ ramGb: 16, storageGb: 512, diagonal: 15.6 })
    expect(attrs('Ноутбук Lenovo ThinkPad T14s G7 21YVS0LC00 Black - 14" IPS 60 Гц / Intel Core Ultra 7 / 355 / DDR5 32 ГБ / PCI-E SSD 1 ТБ / Intel Graphics', 'Lenovo')).toMatchObject({ ramGb: 32, storageGb: 1024, colors: ['black'] })
    expect(attrs('Смартфон Samsung Galaxy A27 5G 8/256 Black (SM-A276BZKCEUC)', 'Samsung')).toMatchObject({ ramGb: 8, storageGb: 256 })
    expect(attrs('Смартфон Apple iPhone 17 256GB Чорний', 'Apple')).toMatchObject({ storageGb: 256, colors: ['black'] })
    expect(attrs('Смартфон Xiaomi 15T + навушники', 'Xiaomi').bundle).toBe(true)
  })

  it('нормалізує коди', () => {
    expect(normalizeCode('sm-s948b zk/geuc')).toBe('SMS948BZKGEUC')
  })
})

describe('compareProducts', () => {
  it('MacBook у різних магазинах: «15″» і «15.3″», українські назви кольорів, ядра процесора не код', () => {
    const ispace = attrs('MacBook Air 15.3" M5 (10C CPU/10C GPU), 16 ГБ, 512 ГБ, Темна ніч', 'Apple', 'MDVH4UA/A')
    expect(ispace).toMatchObject({ colors: ['black'], diagonal: 15.3, codes: ['MDVH4UAA', 'MDVH4'] })
    expect(decide(ispace, attrs('Ноутбук Apple MacBook Air M5 Chip 15" 16/512GB Midnight (MDVH4) 2026', 'Apple'))).toBe('same')
    expect(decide(ispace, attrs("Ноутбук APPLE MacBook Air 15' M5 16GB/512GB Starlight (MDVD4UA/A)", 'APPLE', 'MDVD4UA/A'))).toBe('different')
    expect(attrs('MacBook Air 13.6", 16 ГБ, 512 ГБ, Сяюча зірка', 'Apple').colors).toEqual(['white'])
    // Монітори: 23.8″ пишуть і як 24″ — той самий екран; 23.8″ і 27″ — різні
    expect(decide(attrs('Монітор Dell 23.8" P2425H', 'Dell'), attrs('Монітор 24" DELL P2425H', 'Dell'))).toBe('same')
    expect(decide(attrs('Монітор Dell 23.8" S-series', 'Dell'), attrs('Монітор Dell 27" S-series', 'Dell'))).toBe('different')
  })

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
    expect(decide(attrs('Робот-пилосос Xiaomi Robot Vacuum H50 Pro', 'Xiaomi'), attrs('Робот-пилосос Xiaomi Robot Vacuum H50 Pro Station', 'Xiaomi'))).toBe('review')
    // Позначка версії для ринку («EU», «UA») товару не змінює
    expect(decide(attrs('Робот-пилосос Xiaomi Robot Vacuum H50 Pro', 'Xiaomi'), attrs('Робот-пилосос Xiaomi Robot Vacuum H50 Pro EU', 'Xiaomi'))).toBe('same')
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
    // Apple з кодом регіону і без нього; інший колір — інший артикул
    expect(decide(attrs('Смартфон APPLE iPhone 17 Pro 256GB Silver (MG8G4AF/A)', 'APPLE'), attrs('Apple iPhone 17 Pro 256GB Silver (MG8G4)', 'Apple'))).toBe('same')
    expect(decide(attrs('Смартфон Apple iPhone 17 Pro Max 512GB Deep Blue (MFYU4A)', 'Apple'), attrs('Смартфон APPLE iPhone 17 Pro Max 512GB Deep Blue (MFYU4AF/A)', 'APPLE'))).toBe('same')
    expect(decide(attrs('Apple iPhone 17 Pro 256GB (MG8G4)', 'Apple'), attrs('Apple iPhone 17 Pro 256GB (MG8H4AF/A)', 'Apple'))).toBe('different')
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

describe('помилки склейки, знайдені на зібраних даних (листопад 2026 р.)', () => {
  it('бренд із цифрою в назві не є кодом моделі', () => {
    // Раніше «A4TECH» вважався спільним кодом, і всі гарнітури A4Tech без іншого коду ставали одним товаром
    const a = attrs('Гарнітура A4TECH Bloody M320 Black', 'A4TECH', 'A4TECH')
    expect(a.codes).toEqual([])
    expect(decide(a, attrs('Гарнітура A4tech HU-10 Black', 'A4tech', 'A4TECH'))).toBe('different')
  })

  it('загальні позначення не є кодом: комплект, клас Wi-Fi, тип акумулятора', () => {
    expect(attrs('Маршрутизатор TP-LINK Deco BE22 BE3600 Mesh-cистема Wi-Fi 7 (2-pack)', 'TP-Link', '2-PACK').codes).toEqual([])
    expect(decide(attrs('Інтернет роутер TP-Link Deco E4 (2-pack) White', 'TP-Link'), attrs('Маршрутизатор TP-LINK Deco X20 (2-pack) MESH система WiFi6', 'TP-Link', 'WIFI6'))).toBe('different')
    expect(decide(attrs('Iнтернет роутер Netis NC21 AC1200, 3xFE LAN, 1xFE WAN, MESH', 'Netis', 'AC1200'), attrs('Маршрутизатор Netis N4 AC1200, 2xGE LAN, 1xGE WAN', 'Netis', 'AC1200'))).toBe('different')
    expect(decide(attrs('Зарядна станція Marstek A500Pro 500 Вт 518.4 Вт/год LiFePO4', 'Marstek', 'A500PRO'), attrs('Зарядна станція Marstek Venus-E 2500Вт 5120 Вт/год LiFePO4', 'Marstek', 'LIFEPO4'))).toBe('different')
    // А модель фена Remington — код, хоч і схожа на клас Wi-Fi
    expect(attrs('Фен Remington AC9140', 'Remington').codes).toEqual(['AC9140'])
  })

  it('цифра в назві моделі не губиться', () => {
    expect(decide(attrs('Смарт-годинник KOSPET PULSE SILVER', 'Kospet'), attrs('Смарт-годинник KOSPET PULSE 2 Silver', 'Kospet'))).toBe('different')
    expect(decide(attrs('Робот-пилосос Xiaomi Robot Vacuum 5 (White)', 'Xiaomi'), attrs('Робот-пилосос XIAOMI Robot Vacuum 6 White', 'Xiaomi'))).toBe('different')
    expect(decide(attrs('Монітор 27" MSI MAG 275QF E20', 'MSI'), attrs('Монітор MSI 27" MAG 275F E20', 'MSI'))).toBe('different')
    expect(decide(attrs('Пральна машина Indesit OMTWSE 61293 WK UA', 'Indesit'), attrs('Пральна машина INDESIT OMTWSE 61051 WK UA', 'Indesit'))).toBe('different')
    expect(decide(attrs('Пральна машина Indesit OMTWSE 61293 WK UA', 'Indesit'), attrs('Пральна машина INDESIT OMTWSE 61293 WK UA', 'Indesit'))).toBe('same')
    expect(decide(attrs('Смартфон Samsung Galaxy S26+ 12/256GB Black', 'Samsung'), attrs('Смартфон Samsung Galaxy S26 12/256GB Black', 'Samsung'))).toBe('different')
  })

  it('короткий спільний код не об\'єднує різні моделі', () => {
    expect(decide(attrs('Гарнітура JABRA Evolve2 65 MS USB-A Stereo Black (26599-999-999)', 'Jabra', 'EVOLVE2'), attrs('Гарнітура Jabra Evolve2 85 Link380c MS Stereo Black (28599-999-899)', 'Jabra', 'LINK380C'))).toBe('different')
    expect(decide(attrs('Навушники JBL Live 780NC White', 'JBL', '780NC'), attrs('Навушники JBL Tune 780NC White (JBLT780NCWHT)', 'JBL', 'JBLT780NCWHT'))).toBe('different')
    expect(decide(attrs('Водонагрівач Atlantic Opro Turbo VM 080 D400S-2-B (2500W)', 'Atlantic', 'D400S-2-B'), attrs('Водонагрівач Atlantic Opro Turbo VM 050 D400S-2-B (2500W)', 'Atlantic', 'D400S-2-B'))).toBe('different')
    expect(decide(attrs('Mesh-система Cudy M1300 2-Pack', 'Cudy', 'M1300'), attrs('Маршрутизатор Cudy M1300 (3-Pack)', 'Cudy', 'M1300'))).toBe('different')
    expect(decide(attrs('Монітор AOC 27" (27G4ZR)', 'AOC', '27G4ZR'), attrs('Монітор 27" AOC Q27G4ZR', 'AOC', 'Q27G4ZR'))).not.toBe('same')
  })

  it('довгий спільний код — той самий товар, хоч назви різняться', () => {
    expect(decide(attrs('Монітор 27" Samsung Odyssey G7 (LS27FG706EIXUA)', 'Samsung', 'LS27FG706EIXUA'), attrs('Монітор SAMSUNG Odyssey Gaming G70F Black (LS27FG706EIXUA)', 'Samsung', 'LS27FG706EIXUA'))).toBe('same')
    expect(decide(attrs('Телевізор Sony 55 K-55XR50 (UA)', 'Sony', 'K-55XR50'), attrs('Телевізор SONY Bravia 5 K-55XR50', 'Sony', 'K-55XR50'))).toBe('same')
    expect(decide(attrs('Apple iPad 11 128GB Pink (MD4E4)', 'Apple', 'MD4E4'), attrs('iPad A16, 128 ГБ Wi-Fi 2025, Рожевий', 'Apple', 'MD4E4TY/A'))).toBe('same')
    expect(decide(attrs('Пилосос ручний GORENJE NEO FLOW SVC259441NFGO (V24P01FP2535EU)', 'Gorenje'), attrs('Ручний бездротовий пилосос Gorenje SVC259441NFGO', 'Gorenje'))).toBe('same')
    expect(decide(attrs('Навушники JBL Tune 245NC Black (JBLT245NCTWSBLK)', 'JBL'), attrs('Навушники JBL Tune 245 NC Black (JBLT245NCTWSBLK)', 'JBL'))).toBe('same')
  })

  it('назви без коду й з кодом в іншого магазину', () => {
    expect(decide(attrs('Apple iPhone 17 256GB (Black)', 'Apple'), attrs('Apple iPhone 17 256GB Black (MG6J4)', 'Apple', 'MG6J4'))).toBe('same')
    expect(decide(attrs('Навушники OPPO Enco Air5 Midnight Black', 'OPPO'), attrs('Бездротові навушники OPPO Enco Air5 Midnight black', 'OPPO'))).toBe('same')
    expect(decide(attrs('Навушники Defender Pulse 428 Black (63428)', 'Defender'), attrs('Навушники Defender Pulse 428 (Black) 63428', 'Defender'))).toBe('same')
    // Той самий код, але інший колір
    expect(decide(attrs('Смартфон INFINIX NOTE 60 PRO X6878 8/256GB Solar Orange', 'Infinix', 'X6878'), attrs('Смартфон Infinix Note 60 Pro X6878 8/256GB Mocha Brown', 'Infinix', 'X6878'))).toBe('different')
  })
})
