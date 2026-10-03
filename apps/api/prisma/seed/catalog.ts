/**
 * Каталог тестових даних. Бренди й моделі реальні, але ціни, оцінки,
 * кількість відгуків і наявність у магазинах ВИГАДАНІ, а магазини умовні
 * (Альфа, Бета…), щоб не приписувати вигадані дані справжнім компаніям.
 */

export interface SeedShopDef {
  slug: string
  name: string
  baseUrl: string
  rating: number
  /** Множник типової ціни магазину відносно ринку */
  priceFactor: number
}

export const SHOPS: SeedShopDef[] = [
  { slug: 'alfa', name: 'Магазин Альфа', baseUrl: 'https://example.com/alfa', rating: 4.5, priceFactor: 1.0 },
  { slug: 'beta', name: 'Магазин Бета', baseUrl: 'https://example.com/beta', rating: 4.4, priceFactor: 1.01 },
  { slug: 'hama', name: 'Магазин Гама', baseUrl: 'https://example.com/hama', rating: 4.3, priceFactor: 1.02 },
  { slug: 'delta', name: 'Магазин Дельта', baseUrl: 'https://example.com/delta', rating: 4.6, priceFactor: 0.99 },
  { slug: 'epsilon', name: 'Магазин Епсілон', baseUrl: 'https://example.com/epsilon', rating: 4.4, priceFactor: 1.0 },
  { slug: 'zeta', name: 'Магазин Зета', baseUrl: 'https://example.com/zeta', rating: 4.5, priceFactor: 0.985 },
]

export interface SeedCategoryDef {
  slug: string
  name: string
  parent?: string
}

export const CATEGORIES: SeedCategoryDef[] = [
  { slug: 'elektronika', name: 'Електроніка' },
  { slug: 'pobutova-tekhnika', name: 'Побутова техніка' },
  { slug: 'televizory', name: 'Телевізори', parent: 'elektronika' },
  { slug: 'noutbuky', name: 'Ноутбуки', parent: 'elektronika' },
  { slug: 'smartfony', name: 'Смартфони', parent: 'elektronika' },
  { slug: 'pralni-mashyny', name: 'Пральні машини', parent: 'pobutova-tekhnika' },
  { slug: 'kholodylnyky', name: 'Холодильники', parent: 'pobutova-tekhnika' },
  { slug: 'pylososy', name: 'Пилососи', parent: 'pobutova-tekhnika' },
]

/**
 * Сценарій цінової історії. Саме він задає, що має знайти модуль скору:
 *  - stable      ціна стабільна, знижки немає (permanentPromo: магазин
 *                постійно показує закреслену ціну, "знижка" фальшива);
 *  - decline     повільне здешевлення, справжня, але мала знижка;
 *  - genuine     ціна впала на `drop` останні `days` діб (справжня знижка);
 *                `saleShops`: скільки магазинів знизили ціну;
 *  - fakeSpike   ціну підняли на 2–3 тижні, потім "знизили" до звичайної;
 *  - yoyo        ціна стрибає вгору-вниз, сьогодні "падіння" (нестабільна історія);
 *  - short       новий товар, історія лише `days` діб.
 */
export type Scenario =
  | { kind: 'stable'; permanentPromo?: boolean }
  | { kind: 'decline' }
  | { kind: 'genuine'; drop: number; days: number; saleShops?: number }
  | { kind: 'fakeSpike' }
  | { kind: 'yoyo' }
  | { kind: 'short'; days: number }

export interface SeedProductDef {
  category: string
  brand: string
  name: string
  modelCode: string
  /** Типова ринкова ціна, грн */
  price: number
  /** Середня оцінка, null якщо відгуків немає */
  rating: number | null
  reviews: number
  /** У скількох магазинах продається (1–6) */
  shops: number
  scenario: Scenario
}

const stable: Scenario = { kind: 'stable' }
const promo: Scenario = { kind: 'stable', permanentPromo: true }
const decline: Scenario = { kind: 'decline' }
const fakeSpike: Scenario = { kind: 'fakeSpike' }
const yoyo: Scenario = { kind: 'yoyo' }
const genuine = (drop: number, days: number, saleShops?: number): Scenario =>
  saleShops === undefined ? { kind: 'genuine', drop, days } : { kind: 'genuine', drop, days, saleShops }
const short = (days: number): Scenario => ({ kind: 'short', days })

const p = (
  category: string,
  brand: string,
  name: string,
  modelCode: string,
  price: number,
  rating: number | null,
  reviews: number,
  shops: number,
  scenario: Scenario,
): SeedProductDef => ({ category, brand, name, modelCode, price, rating, reviews, shops, scenario })

export const PRODUCTS: SeedProductDef[] = [
  // Телевізори
  p('televizory', 'Samsung', 'Телевізор Samsung 55" QLED 4K QE55Q80DAUXUA', 'QE55Q80DAUXUA', 36999, 4.8, 214, 6, genuine(0.18, 5)),
  p('televizory', 'LG', 'Телевізор LG 55" OLED 4K OLED55C46LA', 'OLED55C46LA', 54999, 4.9, 163, 5, genuine(0.22, 3)),
  p('televizory', 'Sony', 'Телевізор Sony 55" LED 4K KD-55X75WL', 'KD-55X75WL', 24999, 4.6, 342, 6, promo),
  p('televizory', 'Samsung', 'Телевізор Samsung 50" LED 4K UE50DU7100UXUA', 'UE50DU7100UXUA', 17999, 4.6, 530, 6, fakeSpike),
  p('televizory', 'LG', 'Телевізор LG 55" LED 4K 55UT80006LA', '55UT80006LA', 19999, 4.5, 288, 5, stable),
  p('televizory', 'Hisense', 'Телевізор Hisense 55" LED 4K 55A6K', '55A6K', 16499, 4.4, 641, 6, decline),
  p('televizory', 'TCL', 'Телевізор TCL 55" QLED 4K 55C655', '55C655', 21499, 4.5, 412, 5, genuine(0.13, 9)),
  p('televizory', 'Philips', 'Телевізор Philips 50" LED 4K 50PUS7609/12', '50PUS7609/12', 17499, 4.3, 97, 4, yoyo),
  p('televizory', 'Hisense', 'Телевізор Hisense 55" ULED 4K 55U7KQ', '55U7KQ', 29999, 4.7, 58, 3, short(9)),

  // Ноутбуки
  p('noutbuky', 'Apple', 'Ноутбук Apple MacBook Air 13" M3 8/256GB', 'MRXN3', 47999, 4.9, 724, 6, genuine(0.11, 2)),
  p('noutbuky', 'Lenovo', 'Ноутбук Lenovo IdeaPad Slim 3 15IAH8 16/512GB', '15IAH8', 25999, 4.5, 376, 5, stable),
  p('noutbuky', 'ASUS', 'Ноутбук ASUS Vivobook 15 X1504ZA 16/512GB', 'X1504ZA', 21499, 4.4, 502, 6, fakeSpike),
  p('noutbuky', 'ASUS', 'Ноутбук ASUS TUF Gaming F15 FX507ZC4 16/512GB', 'FX507ZC4', 36999, 4.7, 289, 4, genuine(0.15, 7, 2)),
  p('noutbuky', 'Acer', 'Ноутбук Acer Aspire 5 A515-58M 16/512GB', 'A515-58M', 27499, 4.4, 233, 5, decline),
  p('noutbuky', 'HP', 'Ноутбук HP 255 G10 8/512GB', '255 G10', 18999, 4.2, 121, 4, promo),
  p('noutbuky', 'Dell', 'Ноутбук Dell Inspiron 15 3520 16/512GB', 'Inspiron 3520', 24999, 4.3, 144, 4, stable),
  p('noutbuky', 'MSI', 'Ноутбук MSI Thin 15 B13UC 16/512GB', 'B13UC', 33999, 5.0, 2, 2, genuine(0.2, 4, 1)),
  p('noutbuky', 'Lenovo', 'Ноутбук Lenovo LOQ 15IRX9 16/512GB', '15IRX9', 44999, 4.8, 188, 5, genuine(0.14, 12)),

  // Смартфони
  p('smartfony', 'Samsung', 'Смартфон Samsung Galaxy S24 8/256GB', 'SM-S921B', 28999, 4.8, 1180, 6, genuine(0.17, 6)),
  p('smartfony', 'Samsung', 'Смартфон Samsung Galaxy A55 5G 8/256GB', 'SM-A556B', 17999, 4.7, 860, 6, stable),
  p('smartfony', 'Samsung', 'Смартфон Samsung Galaxy A35 5G 8/256GB', 'SM-A356B', 13999, 4.6, 1020, 6, fakeSpike),
  p('smartfony', 'Apple', 'Смартфон Apple iPhone 15 128GB', 'A3090', 31999, 4.9, 2140, 6, decline),
  p('smartfony', 'Apple', 'Смартфон Apple iPhone 16 128GB', 'A3081', 37999, 4.9, 1270, 6, stable),
  p('smartfony', 'Xiaomi', 'Смартфон Xiaomi Redmi Note 13 Pro 8/256GB', '2312DRA50G', 12999, 4.7, 830, 6, genuine(0.16, 10)),
  p('smartfony', 'Xiaomi', 'Смартфон Xiaomi Redmi 13C 4/128GB', '23108RN04Y', 4599, 4.4, 2310, 6, promo),
  p('smartfony', 'Xiaomi', 'Смартфон Xiaomi 14T 12/256GB', '2407FPN8EG', 21999, 4.8, 74, 3, short(7)),
  p('smartfony', 'Motorola', 'Смартфон Motorola Moto G84 5G 12/256GB', 'XT2347-2', 10999, 4.5, 215, 4, yoyo),

  // Пральні машини
  p('pralni-mashyny', 'Bosch', 'Пральна машина Bosch WAN24100UA', 'WAN24100UA', 18999, 4.8, 310, 5, stable),
  p('pralni-mashyny', 'Samsung', 'Пральна машина Samsung WW80AGAS21AE/UA', 'WW80AGAS21AE', 20499, 4.7, 255, 5, genuine(0.19, 4)),
  p('pralni-mashyny', 'LG', 'Пральна машина LG F2WV3S7S0E', 'F2WV3S7S0E', 17999, 4.7, 198, 5, genuine(0.14, 1)),
  p('pralni-mashyny', 'Indesit', 'Пральна машина Indesit BWSA 61051 WWV', 'BWSA 61051', 9999, 4.3, 876, 6, fakeSpike),
  p('pralni-mashyny', 'Beko', 'Пральна машина Beko WUE 6511 XWW', 'WUE 6511', 10499, 4.5, 654, 6, promo),
  p('pralni-mashyny', 'Whirlpool', 'Пральна машина Whirlpool FFB 7238 BV EE', 'FFB 7238 BV', 13999, 4.6, 143, 4, decline),
  p('pralni-mashyny', 'Candy', 'Пральна машина Candy CS4 1061DE/1-S', 'CS4 1061DE', 9499, 4.4, 412, 5, genuine(0.21, 8, 1)),
  p('pralni-mashyny', 'Haier', 'Пральна машина Haier HW60-BP12959A', 'HW60-BP12959A', 11499, 4.3, 66, 3, yoyo),
  p('pralni-mashyny', 'Siemens', 'Пральна машина Siemens WM12N200UA', 'WM12N200', 19999, 4.8, 121, 3, stable),

  // Холодильники
  p('kholodylnyky', 'Samsung', 'Холодильник Samsung RB38C603DS9/UA', 'RB38C603DS9', 38999, 4.8, 176, 4, stable),
  p('kholodylnyky', 'LG', 'Холодильник LG GBB72PZVCN1', 'GBB72PZVCN1', 29999, 4.7, 392, 5, genuine(0.13, 6)),
  p('kholodylnyky', 'Bosch', 'Холодильник Bosch KGN39VL316', 'KGN39VL316', 33499, 4.8, 227, 5, fakeSpike),
  p('kholodylnyky', 'Indesit', 'Холодильник Indesit ITR 4200 W', 'ITR 4200 W', 13999, 4.2, 764, 6, stable),
  p('kholodylnyky', 'Beko', 'Холодильник Beko RCSA270K30W', 'RCSA270K30W', 12499, 4.5, 521, 6, genuine(0.15, 3)),
  p('kholodylnyky', 'Gorenje', 'Холодильник Gorenje RK4181PS4', 'RK4181PS4', 17999, 4.6, 246, 5, decline),
  p('kholodylnyky', 'Haier', 'Холодильник Haier HDW3620DNPK', 'HDW3620DNPK', 27499, 4.5, 133, 4, stable),
  p('kholodylnyky', 'Liebherr', 'Холодильник Liebherr CNef 4313', 'CNef 4313', 36999, null, 0, 2, stable),
  p('kholodylnyky', 'Whirlpool', 'Холодильник Whirlpool W7X 82O K', 'W7X 82O K', 24999, 4.6, 39, 2, short(11)),

  // Пилососи
  p('pylososy', 'Dyson', 'Пилосос Dyson V15 Detect Absolute', 'SV47', 29999, 4.9, 304, 5, genuine(0.16, 5)),
  p('pylososy', 'Dyson', 'Пилосос Dyson V8 Absolute', 'SV25', 17999, 4.7, 188, 4, decline),
  p('pylososy', 'Xiaomi', 'Робот-пилосос Xiaomi Robot Vacuum S10', 'B106GL', 8999, 4.5, 697, 6, genuine(0.18, 11)),
  p('pylososy', 'Roborock', 'Робот-пилосос Roborock Q7 Max', 'Q7 Max', 12999, 4.6, 412, 5, promo),
  p('pylososy', 'Roborock', 'Робот-пилосос Roborock S8 Pro Ultra', 'S8 Pro Ultra', 44999, 4.8, 92, 4, genuine(0.12, 2)),
  p('pylososy', 'Philips', 'Пилосос Philips PowerPro Expert FC9733/09', 'FC9733/09', 8499, 4.4, 305, 5, fakeSpike),
  p('pylososy', 'Samsung', 'Пилосос Samsung Jet 75 VS20T7536T5', 'VS20T7536T5', 15999, 4.5, 143, 4, stable),
  p('pylososy', 'Bosch', 'Пилосос Bosch BGC05AAA1', 'BGC05AAA1', 4299, 4.3, 538, 6, stable),
  p('pylososy', 'Kärcher', 'Пилосос Kärcher WD 3 V-12/4/18/C', 'WD 3', 4999, 4.6, 782, 6, fakeSpike),
]
