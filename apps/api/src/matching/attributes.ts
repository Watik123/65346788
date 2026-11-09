import { brandKey } from '../catalog/brands'
import { looksLikeCode, looksLikeSpec } from '../scrapers/model-code'

/**
 * Ознаки товару з назви й коду моделі, за якими вирішуємо, чи це той самий товар.
 * Усе нормалізоване: нижній регістр, уніфіковані кольори й одиниці.
 */
export interface ProductAttributes {
  brand: string
  /** Нормалізовані коди моделі: без пробілів, дефісів і слешів, великими літерами */
  codes: string[]
  /** Числові артикули з назви («(63428)», штрихкод): збіг підтверджує товар, розбіжність нічого не означає */
  articles: string[]
  /**
   * Короткі позначення моделі з цифрами, які не є кодом: «S25», «E4», «2», «428», «65».
   * Якщо в кожного товару є своє, якого немає в іншого («Deco E4» і «Deco X20»), це різні моделі.
   */
  nums: string[]
  ramGb: number | null
  storageGb: number | null
  /** Усі розпізнані кольори назви («Black/Gold» → black, gold), за абеткою */
  colors: string[]
  /** Діагональ екрана в дюймах (телевізори, монітори) */
  diagonal: number | null
  year: number | null
  /** Слова, що змінюють модель: pro, max, ultra, plus, lite, mini, fe, se… */
  variants: string[]
  /** Комплект: «+ навушники», «bundle», «комплект» */
  bundle: boolean
  /** Значущі слова назви для порівняння схожості: без типу товару, бренду, кольору, кодів і характеристик */
  tokens: string[]
  /** Характеристики з одиницями: «10000mah», «46mm», «1.7l». Різні значення однієї одиниці — різні товари */
  specs: string[]
}

export interface MatchInput {
  brand: string
  name: string
  modelCode: string | null
  ean: string | null
}

/** Слово цілком, з урахуванням кирилиці (\\b у JavaScript розуміє лише латиницю) */
const word = (alts: string, flags = 'iu') => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, flags)

const COLOR_DEFS: [string, string][] = [
  ['black|чорн\\p{L}*|midnight|obsidian|graphite|графіт\\p{L}*|onyx|темн\\p{L}*\\s+ніч', 'black'],
  ['white|біл\\p{L}*|ivory|starlight|сяюч\\p{L}*\\s+зірк\\p{L}*', 'white'],
  ['silver|срібл\\p{L}*', 'silver'],
  ['gr[ae]y|сір\\p{L}*', 'gray'],
  ['blue|син\\p{L}*|блакитн\\p{L}*|navy|teal', 'blue'],
  ['green|зелен\\p{L}*|mint|м.ятн\\p{L}*|graygreen', 'green'],
  ['red|червон\\p{L}*', 'red'],
  ['gold|золот\\p{L}*', 'gold'],
  ['purple|violet|lavender|фіолетов\\p{L}*|бузков\\p{L}*', 'purple'],
  ['pink|rose|рожев\\p{L}*', 'pink'],
  ['yellow|жовт\\p{L}*', 'yellow'],
  ['orange|помаранчев\\p{L}*', 'orange'],
  ['beige|бежев\\p{L}*|cream|sand|кремов\\p{L}*', 'beige'],
  ['brown|коричнев\\p{L}*', 'brown'],
]
const COLORS: [RegExp, string][] = COLOR_DEFS.map(([alts, name]) => [word(alts), name])
/** Усі назви кольорів одним виразом: прибираються зі слів назви, бо колір порівнюється окремо */
const ANY_COLOR = word(COLOR_DEFS.map(([alts]) => alts).join('|'), 'giu')

const VARIANT_WORDS = ['pro', 'max', 'ultra', 'plus', 'lite', 'mini', 'fe', 'se', 'neo', 'air', 'edge', 'flip', 'fold', 'prime', 'turbo', 'note', 'slim']

/**
 * Слова, що не допомагають відрізнити модель: тип товару («смартфон», «гарнітура», «бездротові»)
 * і службові. Один магазин пише «Навушники JBL Tune 520BT», інший «Бездротова гарнітура JBL Tune 520BT».
 * Назв аксесуарів («чохол», «фільтр», «батарея») тут немає навмисно: вони відрізняють товар.
 */
const STOP = new Set(
  `смартфон телефон мобільний планшет телевізор тб монітор ігровий ігрова ігрові ноутбук
   навушники навушник гарнітура наушники бездротові бездротова бездротовий дротові дротова дротовий провідні tws
   смарт-годинник смарт годинник розумний фітнес-браслет браслет фiтнес-браслет
   акустика акустична система колонка колонки портативна портативний портативне саундбар
   консоль приставка фотоапарат фотокамера цифровий камера
   маршрутизатор роутер інтернет iнтернет wi-fi wifi wi-fi-роутер
   павербанк powerbank батарея універсальна зарядна станція генератор електростанція
   пральна машина сушильна холодильник морозильна камера скриня посудомийна плита духова шафа варильна поверхня
   витяжка бойлер водонагрівач мікрохвильова піч кавоварка кавомашина електрочайник чайник блендер міксер
   кухонний кухонна комбайн мультиварка мультипіч аерогриль аерофритюрниця гриль електрогриль тостер соковижималка
   соковитискач хлібопічка хлібопіч пилосос робот робот-пилосос ручний акумуляторний миючий мийний вертикальний
   праска відпарювач парогенератор кондиціонер спліт-система обігрівач конвектор тепловентилятор вентилятор
   зволожувач очищувач очисник повітря фен фен-щітка стайлер плойка випрямляч електробритва тример бритва
   зубна щітка електрична електричний вбудована вбудований вбудовувана
   led qled oled smart tv google android dual sim standard ua eu
   і та з для на до із зі gb гб tb тб`
    .split(/\s+/)
    .filter(Boolean),
)

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
  // «DDR5 16 ГБ / PCI-E SSD 512 ГБ», «1 ТБ»
  const ramMatch = name.match(/(?:lpddr\d+x?|ddr\d)\s*(\d{1,3})\s*(?:gb|гб)/iu)
  const sizes = [...name.matchAll(/(?<![\d.])(\d{1,4})\s*(gb|гб|tb|тб)(?![\p{L}\p{N}])/giu)].map((m) => Number(m[1]) * (/tb|тб/i.test(m[2] as string) ? 1024 : 1))
  const ram = ramMatch ? Number(ramMatch[1]) : null
  const storage = sizes.filter((v) => v >= 64 && v !== ram).sort((a, b) => b - a)[0] ?? null
  return { ram, storage }
}

/** Одиниці виміру: «10000 mAh» і «10000мАг» мають дати те саме слово */
const UNITS: [RegExp, string][] = [
  [/^(mah|мач|маг|ма·год|мaг)$/i, 'mah'],
  [/^(w|вт)$/i, 'w'],
  [/^(kw|квт)$/i, 'kw'],
  [/^(wh|вт·год|втгод|вт\/год|втг)$/i, 'wh'],
  [/^(mm|мм)$/i, 'mm'],
  [/^(cm|см)$/i, 'cm'],
  [/^(kg|кг)$/i, 'kg'],
  [/^(l|л)$/i, 'l'],
  [/^(ml|мл)$/i, 'ml'],
  [/^(hz|гц)$/i, 'hz'],
  [/^(mp|мп)$/i, 'mp'],
  [/^(btu)$/i, 'btu'],
  [/^(gb|гб)$/i, 'gb'],
  [/^(tb|тб)$/i, 'tb'],
]
const unitOf = (w: string) => UNITS.find(([re]) => re.test(w))?.[1]

/**
 * Назва, підготовлена до розбору: «S26+» → «S26 plus», «10 000 mAh» → «10000mah», «1,7 л» → «1.7l»,
 * технологія екрана («Mini LED», «Neo QLED») прибрана, бо один магазин її пише, інший ні.
 */
function prepare(name: string): string {
  return name
    .toLowerCase()
    .replace(/mini\s*-?\s*led|neo\s*qled|micro\s*(?:rgb|led)|qd-?mini\s*-?led|sqd-?mini\s*-?led/g, ' ')
    // «S26+», «Pro+», «TF+» — модифікація «plus»; «DoorCooling+» чи «RB4011iGS+RM» — ні
    .replace(/(?<=\d)\+(?![\p{L}\p{N}+])/gu, ' plus ')
    .replace(/(?<![\p{L}\p{N}])(\p{L}{1,3}|ultra|lite|mini|note)\+(?![\p{L}\p{N}+])/giu, '$1 plus ')
    .replace(/(?<=\d)[,](?=\d)/g, '.')
    // Комплект із кількох штук: «(2-pack)», «3PK», «2 шт» → «2pack»
    .replace(/(?<![\p{L}\p{N}.])(\d)\s?-?\s?(?:pack|pk|шт)(?![\p{L}\p{N}])/giu, '$1pack')
    // «12/512GB», «8/1TB» → окремі слова з одиницями, як у магазинів, що пишуть «12GB/512GB»
    .replace(/(?<![\d.\p{L}])(\d{1,2})(?:gb|гб)?\/(\d{1,4})\s*(gb|гб|tb|тб)?(?![\d\p{L}])/giu, (_, r: string, st: string, u: string | undefined) => ` ${r}gb ${st}${u && /tb|тб/i.test(u) ? 'tb' : 'gb'} `)
    .replace(/(?<![\d.])(\d{1,3}) (\d{3})(?=\s?(?:mah|мач|маг|вт|w|btu)(?![\p{L}\p{N}]))/giu, '$1$2')
    .replace(/(?<![\p{L}\p{N}.])(\d+(?:\.\d+)?)\s?(?:вт|w)\s?[*·⋅/]?\s?(?:год|h)(?![\p{L}\p{N}])/giu, '$1wh')
    .replace(/(?<![\p{L}\p{N}.])(\d+(?:\.\d+)?)\s?(mah|мач|маг|вт|w|квт|kw|мм|mm|см|cm|кг|kg|л|l|мл|ml|гц|hz|мп|mp|btu|гб|gb|тб|tb)(?![\p{L}\p{N}])/giu, (_, n: string, u: string) => `${n}${unitOf(u) ?? u}`)
}

const clean = (w: string) => w.replace(/[^\p{L}\p{N}.\-]/gu, '').replace(/^[.\-]+|[.\-]+$/g, '')

export function extractAttributes(input: MatchInput): ProductAttributes {
  const name = input.name
  const lower = name.toLowerCase()
  const brand = brandKey(input.brand)
  // Слова бренду («Bang & Olufsen» → bang, olufsen): один магазин пише бренд у назві, інший ні
  const brandWords = new Set(input.brand.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2))
  const isBrand = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '') === brand || brandWords.has(t.toLowerCase())
  const { ram, storage } = memory(name)

  const colors = [...new Set(COLORS.filter(([re]) => re.test(name)).map(([, c]) => c))].sort()
  const diag = name.match(/(\d{2}(?:[.,]\d)?)\s*(?:"|''|″|дюйм)/)
  const year = lower.match(/(?<!\d)(20[1-3]\d)(?!\d)/)

  // Коди моделі: з поля магазину і зі слів назви. Бренд із цифрою («A4Tech») і загальні позначення
  // («2-pack», «AC1200») кодом не є, навіть якщо магазин записав їх у поле коду
  const codes = new Set<string>()
  const codeWords = new Set<string>()
  const addCode = (raw: string): boolean => {
    const t = raw.replace(/[^A-Za-z0-9\-/._]/g, '').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')
    // Артикул виробника з цифр через дефіс чи крапку: «010-03393-31», «108.0606.107», «1604-1200»
    const numeric = /^\d+(?:[.\-]\d+)+$/.test(t) && t.replace(/\D/g, '').length >= 7
    if (!numeric && (!looksLikeCode(t) || isBrand(t))) return false
    codes.add(normalizeCode(t))
    return true
  }
  // «AS25FL-B/1U25MEHFRA-1» (внутрішній і зовнішній блоки): кожна частина теж код, якщо схожа на код.
  // «FC9733/09» так не ділимо: «09» кодом не є, а «FC9733» без суфікса — це вже інша модифікація
  const addAll = (raw: string): boolean => {
    const whole = addCode(raw)
    const parts = raw.split('/')
    if (parts.length > 1 && parts.every((x) => looksLikeCode(x.replace(/[^A-Za-z0-9\-._]/g, '')))) parts.forEach(addCode)
    return whole
  }
  if (input.modelCode) addAll(input.modelCode)
  // Слова-коди прибираємо з назви: далі вона ділиться на слова дрібніше, і шматки коду («MJXT4AF», «A»)
  // не повинні стати окремими словами
  for (const w of name.split(/[\s,()]+/)) {
    if (w && addAll(w)) codeWords.add(w)
  }
  const rest = name
    .split(/([\s,()]+)/)
    .map((part) => (codeWords.has(part) ? ' ' : part))
    .join('')
  // Числа в дужках: артикул виробника, штрихкод або внутрішній номер магазину («(1191424)»)
  const parenNums = new Set([...name.matchAll(/\(([^()]*)\)/g)].flatMap((m) => (m[1] as string).split(/[\s,]+/)).filter((w) => /^\d{5,}$/.test(w)))
  // Apple: до артикулу дописують код регіону (MG8G4 = MG8G4AF/A = MFYU4A…): додаємо основу з 5 знаків
  if (brand === 'apple') {
    for (const c of [...codes]) {
      const m = c.match(/^([A-Z][A-Z0-9]{4})[A-Z]{1,2}A?$/)
      if (m) codes.add(m[1] as string)
    }
  }
  const codeList = [...codes].filter((c) => c.length >= 5)

  const words = prepare(rest).replace(ANY_COLOR, ' ').split(/[\s,()/+;|⁄{}[\]«»"'″\\]+/).map(clean).filter(Boolean)
  const variantWords = prepare(name).split(/[\s,()/+]+/).map(clean)

  const articles = new Set<string>()
  const nums = new Set<string>()
  const tokens = new Set<string>()
  const specs = new Set<string>()
  for (const w of words) {
    if (STOP.has(w) || isBrand(w)) continue
    const flat = w.replace(/[.\-]/g, '')
    if (/^\d+$/.test(flat)) {
      // Довге число одним словом. У дужках — артикул, штрихкод чи номер магазину: збіг підтверджує товар,
      // розбіжність нічого не означає. Просто в назві («OMTWSE 61293 WK») — це номер моделі
      if (flat.length >= 5 && flat === w) {
        if (flat.length <= 14 && !flat.endsWith('00')) articles.add(flat)
        if (!parenNums.has(w)) nums.add(flat)
        continue
      }
      if (year && flat === year[1]) continue
      // Дробові («6.7», «2.4») — розміри й частоти, а не номер моделі
      if (!w.includes('.')) nums.add(w)
      tokens.add(w)
      continue
    }
    if (/\d/.test(w)) {
      if (codeList.includes(normalizeCode(w))) continue
      if (/^\d+(\.\d+)?(mah|w|kw|wh|mm|cm|kg|l|ml|hz|mp|btu|gb|tb|pack)$/.test(w)) {
        specs.add(w)
        continue
      }
      // Число з описом («1501мбіт», «5ghz») і загальні позначення («AC1200», «wifi7», «5g») — не позначення
      // моделі, але слово назви: «Galaxy A17» і «Galaxy A17 5G» за самими назвами не зливаємо
      if (!(looksLikeSpec(w) || /^\d+(\.\d+)?(\p{L}{3,}|\p{Script=Cyrillic}+)$/u.test(w))) nums.add(flat.toUpperCase())
    } else if (/^\p{Script=Cyrillic}$/u.test(w)) continue
    tokens.add(w)
  }

  return {
    brand,
    codes: codeList,
    articles: [...articles],
    nums: [...nums],
    ramGb: ram,
    storageGb: storage,
    colors,
    diagonal: diag ? Number((diag[1] as string).replace(',', '.')) : null,
    year: year ? Number(year[1]) : null,
    variants: VARIANT_WORDS.filter((v) => variantWords.includes(v)).sort(),
    bundle: /\s\+\s+\p{L}{3,}|bundle|комплект|набір/iu.test(name),
    tokens: [...tokens],
    specs: [...specs],
  }
}
