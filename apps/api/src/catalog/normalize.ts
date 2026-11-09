import { extractModelCode, looksLikeCode } from '../scrapers/model-code'
import type { ParsedProduct } from '../scraping/types'
import { canonicalBrand } from './brands'

/**
 * Приведення запису магазину до ладу перед зіставленням і записом у базу. Сховище (datastore/) зберігає
 * дані такими, якими їх показав магазин; правила тут можна змінювати, і вони застосуються до всієї історії.
 * Повертає null, якщо запис не треба брати: аксесуар, товар разом із платною послугою тощо.
 */

/** Аксесуари й витратні матеріали, що трапляються в розділах техніки: назва починається з цих слів */
const ACCESSORY =
  /^(?:оригінальний\s+|вугільний\s+|змінн\p{L}+\s+|додатков\p{L}+\s+|комплект\s+|набір\s+)?(?:чохол|чехол|кейс|футляр|плівка|скло|кабель|адаптер|перехідник|фільтр\p{L}*|hepa-фільтр|нера-фільтр|мішк\p{L}+|мішок|щітка для|насадк\p{L}+|амбушюр\p{L}*|ремінець|кронштейн|кріплення|підставка|пульт|сумка|акумулятор(?!н)|батарея розширення|батарея до|панель для|форма для|картридж\p{L}*|подушечки|морська сіль|пов.язка|маска для сну|маска|окуляри|смарт окуляри|мікрофон\p{L}*|спікерфон|світлов\p{L}+ (?:пристрій|проектор)|датчик|інвертор|автоматичне введення резерву|блок автоматики|сонячна панель|запасн\p{L}+)(?![\p{L}])/iu

/** «Додаткова батарея EcoFlow…», «Батарея розширення ємності…» — приладдя до зарядних станцій, не самі станції */
const EXTRA_BATTERY = /^(?:додаткова батарея|батарея розширення|додатковий акумулятор)/iu

/** Товар явно з іншої нашої категорії, ніж розділ магазину, де він лежить */
const RECLASSIFY: { from: string[]; test: RegExp; to: string }[] = [
  { from: ['pylososy'], test: /^(?:робот[- ]пилосос|пилосос[- ]робот|робот[- ]мийник|робот для (?:миття )?вікон)/iu, to: 'roboty-pylososy' },
  { from: ['prasky'], test: /^(?:вертикальний\s+|ручний\s+)?(?:відпарювач|парогенератор)/iu, to: 'vidparyuvachi' },
  { from: ['multivarky'], test: /^(?:мультипіч|аерофритюрниця|аерогриль)/iu, to: 'aerohryli' },
  { from: ['kukhonni-kombainy'], test: /^(?:міксер|планетарний міксер|ручний міксер)/iu, to: 'miksery' },
]

/** Розділ очищувачів повітря у магазинів наполовину з фільтрів і приладдя: беремо лише самі прилади */
const AIR_PURIFIER = /^(?:очищувач|очисник|очиститель|кліматичний комплекс|бризер|мийка повітря|іонізатор|озонатор|комбінований|зволожувач)/iu

const APPLE_WORDS = /\b(?:apple|iphone|ipad|airpods|earpods|macbook|imac|homepod|airtag)\b/i
/** Бренди з кількох слів у назвах iSpace */
const MULTIWORD_BRANDS = ['Bang & Olufsen', 'Harman Kardon', 'Audio-Technica']

/** Бренд із початку назви: «CANYON TWS-11 …» → Canyon, «Навушники Marshall Major V» → Marshall */
export function brandFromName(name: string): string | null {
  const rest = name.replace(/^[\p{Script=Cyrillic}\s'’-]+/u, '').trim()
  for (const b of MULTIWORD_BRANDS) if (rest.toLowerCase().startsWith(b.toLowerCase())) return b
  const first = rest.match(/^[A-Za-z][A-Za-z0-9&-]*/)?.[0]
  return first && first.length >= 2 ? canonicalBrand(first.toUpperCase()) : null
}

/** Слова з адреси товару після тих, що вже є в назві: «…/monitor-samsung-27-odyssey-g5-ls27fg502sixua-ua» → «ODYSSEY G5 LS27FG502SIXUA» */
function slugTail(url: string, name: string): string {
  const slug = url.replace(/[?#].*$/, '').replace(/\/$/, '').split('/').pop() ?? ''
  const known = new Set(name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))
  const digits = name.replace(/[^\d]/g, '')
  return slug
    .split('-')
    .filter((w) => w && !known.has(w) && w !== digits && !/^(monitor|igrovyi|igrovoj|ua)$/.test(w))
    .join(' ')
    .toUpperCase()
}

export function normalizeRecord(shopSlug: string, p: ParsedProduct): ParsedProduct | null {
  let { name, brand, categorySlug, oldPrice, modelCode } = p

  if (shopSlug === 'jabko') {
    // «(Ultra)» у Ябка — той самий товар разом із платним пакетом обслуговування: з цінами інших
    // магазинів не порівнюється. «(Standard)» — звичайний товар, позначку прибираємо
    if (/\(Ultra\)/i.test(name)) return null
    name = name.replace(/\s*\(Standard\)/gi, '').trim()
    // Назва, обрізана на лапках діагоналі («Монітор Samsung 27\»): решту беремо з адреси товару
    if (name.endsWith('\\')) name = `${name.slice(0, -1)}" ${slugTail(p.url, name)}`.trim()
  }
  if (shopSlug === 'ispace') {
    // iSpace продає й чужі бренди (навушники Marshall, Canyon…), а бренду в картці не має
    name = name.replace(/\s*\{[^{}]*\}\s*/g, ' ').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim()
    if (!APPLE_WORDS.test(name)) brand = brandFromName(name) ?? brand
  }

  if (ACCESSORY.test(name) || EXTRA_BATTERY.test(name)) return null
  if (categorySlug === 'ochyshchuvachi' && !AIR_PURIFIER.test(name)) return null
  for (const r of RECLASSIFY) {
    if (r.from.includes(categorySlug) && r.test.test(name)) {
      categorySlug = r.to
      break
    }
  }

  // Закреслена ціна вдесятеро вища за поточну — помилка розмітки магазину («15 999 00»), а не знижка 90%+
  if (oldPrice !== null && oldPrice > p.price * 10) oldPrice = null

  // Код, записаний старими правилами: бренд («A4TECH») чи загальне позначення («2-PACK», «AC1200»)
  if (modelCode !== null && (!looksLikeCode(modelCode) || modelCode.toLowerCase().replace(/[^a-z0-9]/g, '') === brand.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
    modelCode = extractModelCode(name, brand)
  }

  if (name === p.name && brand === p.brand && categorySlug === p.categorySlug && oldPrice === p.oldPrice && modelCode === p.modelCode) return p
  return { ...p, name, brand, categorySlug, oldPrice, modelCode }
}
