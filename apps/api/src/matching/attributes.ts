import { brandKey } from '../catalog/brands'
import { looksLikeCode } from '../scrapers/model-code'

/**
 * Ознаки товару з назви й коду моделі, за якими вирішуємо, чи це той самий товар.
 * Усе нормалізоване: нижній регістр, уніфіковані кольори й одиниці.
 */
export interface ProductAttributes {
  brand: string
  /** Нормалізовані коди моделі: без пробілів, дефісів і слешів, великими літерами */
  codes: string[]
  ramGb: number | null
  storageGb: number | null
  color: string | null
  /** Діагональ екрана в дюймах (телевізори, ноутбуки) */
  diagonal: number | null
  year: number | null
  /** Слова, що змінюють модель: pro, max, ultra, plus, lite, mini, fe, se… */
  variants: string[]
  /** Комплект: «+ навушники», «bundle», «комплект» */
  bundle: boolean
  /** Значущі слова назви для порівняння схожості */
  tokens: string[]
}

export interface MatchInput {
  brand: string
  name: string
  modelCode: string | null
  ean: string | null
}

/** Слово цілком, з урахуванням кирилиці (\\b у JavaScript розуміє лише латиницю) */
const word = (alts: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, 'iu')

const COLORS: [RegExp, string][] = [
  [word('black|чорн\\p{L}*|midnight|obsidian|graphite|графіт\\p{L}*|onyx'), 'black'],
  [word('white|біл\\p{L}*|ivory|starlight'), 'white'],
  [word('silver|срібл\\p{L}*'), 'silver'],
  [word('gr[ae]y|сір\\p{L}*'), 'gray'],
  [word('blue|син\\p{L}*|блакитн\\p{L}*|navy|teal'), 'blue'],
  [word('green|зелен\\p{L}*|mint|м.ятн\\p{L}*|graygreen'), 'green'],
  [word('red|червон\\p{L}*'), 'red'],
  [word('gold|золот\\p{L}*'), 'gold'],
  [word('purple|violet|lavender|фіолетов\\p{L}*|бузков\\p{L}*'), 'purple'],
  [word('pink|rose|рожев\\p{L}*'), 'pink'],
  [word('yellow|жовт\\p{L}*'), 'yellow'],
  [word('orange|помаранчев\\p{L}*'), 'orange'],
  [word('beige|бежев\\p{L}*|cream|sand'), 'beige'],
]

const VARIANT_WORDS = ['pro', 'max', 'ultra', 'plus', 'lite', 'mini', 'fe', 'se', 'neo', 'air', 'edge', 'flip', 'fold', 'prime', 'turbo', 'note', 'slim']

/** Слова-категорії та службові, що не допомагають відрізнити модель */
const STOP = new Set([
  'смартфон', 'телевізор', 'ноутбук', 'ігровий', 'пилосос', 'робот', 'робот-пилосос', 'ручний', 'бездротовий', 'акумуляторний',
  'миючий', 'вертикальний', 'холодильник', 'пральна', 'машина', 'led', 'qled', 'oled', 'smart', 'tv', 'wi-fi', 'wifi', 'google',
  'android', 'dual', 'sim', 'standard', 'і', 'та', 'з', 'для', 'gb', 'гб', 'tb', 'тб',
])

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[\s\-_/.]/g, '')
}

function memory(name: string): { ram: number | null; storage: number | null } {
  // Смартфони: «12/512GB», «8/256» — числа через слеш без пробілів
  const pair = name.match(/(?<![\d.])(\d{1,2})(?:gb|гб)?\/(\d{2,4})\s*(gb|гб|tb|тб)?(?![\d])/i)
  if (pair) {
    const ram = Number(pair[1])
    const storage = Number(pair[2]) * (pair[3] && /tb|тб/i.test(pair[3]) ? 1024 : 1)
    if (ram <= 32 && storage >= 16) return { ram, storage }
  }
  // Ноутбуки: «DDR5 16 ГБ / PCI-E SSD 512 ГБ», «1 ТБ»
  const ramMatch = name.match(/(?:lpddr\d+x?|ddr\d)\s*(\d{1,3})\s*(?:gb|гб)/iu)
  const sizes = [...name.matchAll(/(?<![\d.])(\d{1,4})\s*(gb|гб|tb|тб)(?![\p{L}\p{N}])/giu)].map((m) => Number(m[1]) * (/tb|тб/i.test(m[2] as string) ? 1024 : 1))
  const ram = ramMatch ? Number(ramMatch[1]) : null
  const storage = sizes.filter((v) => v >= 64 && v !== ram).sort((a, b) => b - a)[0] ?? null
  return { ram, storage }
}

export function extractAttributes(input: MatchInput): ProductAttributes {
  const name = input.name
  const lower = name.toLowerCase()
  const { ram, storage } = memory(name)

  const color = COLORS.find(([re]) => re.test(name))?.[1] ?? null
  const diag = name.match(/(\d{2}(?:[.,]\d)?)\s*(?:"|''|″|дюйм)/)
  const year = lower.match(/(?<!\d)(20[1-3]\d)(?!\d)/)
  const words = lower.split(/[\s,()/+]+/).map((w) => w.replace(/[^\p{L}\p{N}-]/gu, '')).filter(Boolean)
  // «Mini LED», «Neo QLED», «Micro RGB» — технологія екрана, а не модифікація моделі: один магазин
  // пише її в назві, інший ні, а модель та сама
  const variantWords = lower
    .replace(/mini\s*-?\s*led|neo\s*qled|micro\s*(?:rgb|led)/g, ' ')
    .split(/[\s,()/+]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}-]/gu, ''))
    .filter(Boolean)

  const codes = new Set<string>()
  if (input.modelCode) codes.add(normalizeCode(input.modelCode))
  for (const w of name.split(/[\s,()]+/)) {
    const t = w.replace(/[^A-Za-z0-9\-/.]/g, '').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')
    if (looksLikeCode(t)) codes.add(normalizeCode(t))
  }
  // Apple: до артикулу дописують код регіону (MG8G4 = MG8G4AF/A = MFYU4A…): додаємо основу з 5 знаків
  if (brandKey(input.brand) === 'apple') {
    for (const c of [...codes]) {
      const m = c.match(/^([A-Z][A-Z0-9]{4})[A-Z]{1,2}A?$/)
      if (m) codes.add(m[1] as string)
    }
  }

  return {
    brand: brandKey(input.brand),
    codes: [...codes].filter((c) => c.length >= 5),
    ramGb: ram,
    storageGb: storage,
    color,
    diagonal: diag ? Number((diag[1] as string).replace(',', '.')) : null,
    year: year ? Number(year[1]) : null,
    variants: VARIANT_WORDS.filter((v) => variantWords.includes(v)).sort(),
    bundle: /\+\s*\p{L}|bundle|комплект|набір/iu.test(name),
    // Довгі числа в дужках — здебільшого внутрішні номери магазину («(1191424)» у KTC), не модель
    tokens: words.filter((w) => !STOP.has(w) && w !== input.brand.toLowerCase() && w !== brandKey(input.brand) && w.length > 1 && !/^\d{6,}$/.test(w)),
  }
}
