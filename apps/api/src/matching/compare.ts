import type { ProductAttributes } from './attributes'

export type MatchDecision = 'same' | 'review' | 'different'

export interface MatchResult {
  decision: MatchDecision
  /** Схожість назв 0..1 (для сортування спірних пар) */
  score: number
  reasons: string[]
  /** «different» через пряму суперечність (інша пам'ять, колір, код), а не просто через брак збігів */
  conflict?: boolean
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a)
  const B = new Set(b)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}

const differ = <T>(x: T | null, y: T | null) => x !== null && y !== null && x !== y

/**
 * Діагональ: «24″» і «23.8″» — той самий екран, а 27″ і 32″ чи 23.8″ і 27″ — різні.
 */
function diagonalsDiffer(a: number | null, b: number | null): boolean {
  if (a === null || b === null || a === b) return false
  // Ціле число — це округлений запис: 23.8″ пишуть як 24″, 31.5″ як 32″, а 15.3″ як 15″
  if (Number.isInteger(a)) return Math.round(b) !== a && Math.floor(b) !== a
  if (Number.isInteger(b)) return Math.round(a) !== b && Math.floor(a) !== b
  return Math.abs(a - b) > 0.05
}

/** Характеристики суперечать: та сама одиниця в обох товарів, а значення різні («10000mah» і «20000mah») */
function specsConflict(a: string[], b: string[]): string | null {
  const byUnit = (list: string[]) => {
    const m = new Map<string, Set<string>>()
    for (const s of list) {
      const unit = s.replace(/^[\d.]+/, '')
      m.set(unit, (m.get(unit) ?? new Set()).add(s))
    }
    return m
  }
  const B = byUnit(b)
  for (const [unit, values] of byUnit(a)) {
    const other = B.get(unit)
    if (other && ![...values].some((v) => other.has(v))) return `${[...values][0]} і ${[...other][0]}`
  }
  return null
}

/**
 * Позначення моделі x має пару в іншому товарі: таке саме, або записане окремими словами
 * («Watch8» і «Watch 8», «SW83» і «SW 83»).
 */
function numHasPair(x: string, self: ProductAttributes, other: ProductAttributes): boolean {
  if (other.nums.includes(x) || other.articles.includes(x)) return true
  // Повторює частину коду («55» і «K-55XR50», «115QN90F» і «QE115QN90FUXUA», «7M3» і «ILCE7M3»): нічого нового не каже
  const inCode = (c: string) => c.includes(x.replace(/-/g, ''))
  if ((x.length >= 3 || /^\d+$/.test(x)) && (other.codes.some(inCode) || self.codes.some(inCode))) return true
  // Те саме, записане окремо чи скорочено: «Watch8» і «Watch 8», «SW83» і «SW 83», «G2» і «Gen 2»
  const alias = (letters: string, words: string[]) => words.some((w) => w === letters || (letters.length <= 3 && w.startsWith(letters)))
  const parts = (v: string) => v.match(/^(\p{L}+)(\d+)$/u) ?? v.match(/^(\d+)(\p{L}+)$/u)
  const digitsOf = (m: RegExpMatchArray) => (/^\d+$/.test(m[1] as string) ? m[1] : m[2]) as string
  const lettersOf = (m: RegExpMatchArray) => (/^\d+$/.test(m[1] as string) ? m[2] : m[1]) as string
  const split = parts(x)
  if (split && other.nums.includes(digitsOf(split)) && alias(lettersOf(split).toLowerCase(), other.tokens)) return true
  if (/^\d+$/.test(x)) {
    return other.nums.some((y) => {
      const m = parts(y)
      return m !== null && digitsOf(m) === x && alias(lettersOf(m).toLowerCase(), self.tokens)
    })
  }
  return false
}

/** Загальні латинські слова опису, якими назви серій не розрізняються */
const DESCRIPTORS = new Set(
  `wireless wired bluetooth tws anc true stereo usb usb-c type-c rgb mic gaming series inverter global version edition new with and for the
   dual band mesh mu-mimo ofdma wifi wi-fi lte nfc gps cellular smart body kit home original official headset headphones earbuds speaker
   black white edition premium active sport classic kids ips va tn hdr uhd fhd qhd wqhd full ultra pro max plus lite mini`
    .split(/\s+/)
    .filter(Boolean),
)

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min((prev[j] as number) + 1, (cur[j - 1] as number) + 1, (prev[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length] as number
}

/**
 * Назви серій, що суперечать: у кожного товару є своє латинське слово, якого немає в іншого
 * («JBL Live 780NC» і «JBL Tune 780NC», «Willer EV80DR Optima» і «… Grand»). Описки й різне написання
 * («Maveric» і «Maverick», «Jetblack» і «Jet Black») суперечністю не є, кириличні слова опису теж.
 */
function seriesConflict(a: ProductAttributes, b: ProductAttributes): string | null {
  const series = (x: ProductAttributes) => x.tokens.filter((t) => /^[a-z][a-z-]{2,}$/.test(t) && !DESCRIPTORS.has(t))
  const similar = (x: string, y: string) => x === y || x.startsWith(y) || y.startsWith(x) || editDistance(x, y, x.length <= 5 ? 1 : 2) <= (x.length <= 5 ? 1 : 2)
  const A = series(a)
  const B = series(b)
  const ownA = A.filter((x) => !B.some((y) => similar(x, y)))
  const ownB = B.filter((x) => !A.some((y) => similar(x, y)))
  return ownA.length > 0 && ownB.length > 0 ? `${ownA[0]} і ${ownB[0]}` : null
}

/**
 * Чи це той самий товар у двох магазинах.
 *  same      — однаковий EAN, однаковий код моделі чи артикул в одного бренду або однакові назви, і жодних суперечностей;
 *  review    — схоже, але не напевно (частковий збіг коду або дуже схожі назви): на ручну перевірку;
 *  different — інший бренд, обсяг пам'яті, колір, діагональ, рік, модифікація, комплект,
 *              різні артикули конфігурацій чи різні позначення моделі («Deco E4» і «Deco X20»).
 * Автоматично зливаємо лише «same»: краще пропустити збіг, ніж змішати різні товари.
 */
export function compareProducts(a: ProductAttributes & { ean?: string | null }, b: ProductAttributes & { ean?: string | null }): MatchResult {
  const score = jaccard(a.tokens, b.tokens)
  if (a.ean && b.ean) {
    return a.ean === b.ean ? { decision: 'same', score: 1, reasons: ['однаковий штрихкод'] } : { decision: 'different', score, reasons: ['різні штрихкоди'], conflict: true }
  }
  if (a.brand !== b.brand) return { decision: 'different', score, reasons: ['різні бренди'], conflict: true }

  const shared = a.codes.filter((c) => b.codes.includes(c))
  // Довгий спільний код (QE43Q7FAAUXUA, SVC259441NFGO) чи артикул Apple (MD4E4) означає рівно один товар,
  // хай як по-різному магазини його називають; короткий («43E7S», «780NC») буває спільним для кількох моделей
  const strong = shared.some((c) => c.length >= 10) || (a.brand === 'apple' && shared.length > 0)
  const different = (reasons: string[]): MatchResult => ({ decision: 'different', score, reasons, conflict: true })

  const conflicts: string[] = []
  if (differ(a.storageGb, b.storageGb)) conflicts.push(`різна пам'ять: ${a.storageGb} і ${b.storageGb} ГБ`)
  if (differ(a.ramGb, b.ramGb)) conflicts.push(`різна оперативна пам'ять: ${a.ramGb} і ${b.ramGb} ГБ`)
  // «Silver/Blue» і «Silver» не суперечать (магазини по-різному називають двоколірні товари), «Black» і «White» — так
  if (a.colors.length > 0 && b.colors.length > 0 && !a.colors.some((c) => b.colors.includes(c))) conflicts.push(`різний колір: ${a.colors.join('/')} і ${b.colors.join('/')}`)
  if (diagonalsDiffer(a.diagonal, b.diagonal)) conflicts.push(`різна діагональ: ${a.diagonal}″ і ${b.diagonal}″`)
  if (differ(a.year, b.year)) conflicts.push(`різний рік: ${a.year} і ${b.year}`)
  // За довгого спільного коду слово серії («Neo Flow», «Air») один магазин пише, інший ні: це не інша
  // модифікація. За короткого — інша: «Hisense 43E7S» і «43E7S PRO» різні телевізори
  if (!strong && a.variants.join() !== b.variants.join()) conflicts.push(`різна модифікація: ${a.variants.join(' ') || '—'} і ${b.variants.join(' ') || '—'}`)
  if (a.bundle !== b.bundle) conflicts.push('один із них комплект')
  if (conflicts.length > 0) return different(conflicts)

  // Коди, що не мають пари в іншому товарі (ні такого самого, ні того, що містить один одного).
  // Якщо такі є в обох — це різні артикули: різні товари, навіть за спільного коду серії
  // (HP 200 G2i DS9F6ET і DS9G2ET) чи схожих назв. 40F6000 і UE40F6000FUXUA не суперечать.
  const related = (x: string, list: string[]) => list.some((y) => y.includes(x) || x.includes(y))
  // Код має пару: споріднений код в іншого товару або його ж позначення моделі всередині («115QN90F» у «QE115QN90FUXUA»)
  const codeHasPair = (c: string, other: ProductAttributes) => related(c, other.codes) || other.nums.some((n) => n.length >= 3 && c.includes(n.replace(/-/g, '')))
  const ownA = a.codes.filter((c) => !codeHasPair(c, b))
  const ownB = b.codes.filter((c) => !codeHasPair(c, a))
  if (ownA.length > 0 && ownB.length > 0) {
    const linked = ownA.length < a.codes.length
    return different([linked ? `спільний код серії, але різні артикули: ${ownA[0]} і ${ownB[0]}` : `різні коди моделі: ${ownA[0]} і ${ownB[0]}`])
  }

  // Те саме для коротких позначень моделі: «Deco E4 (2-pack)» і «Deco X20 (2-pack)», «Evolve2 65» і
  // «Evolve2 85», «Pulse 428» і «Pulse 430», «MAG 275QF» і «MAG 275F» — різні моделі, хай би що ще збігалося.
  // Виняток — довгий спільний код чи артикул Apple: тоді це різні назви тієї самої моделі
  // («Odyssey G7» і «Odyssey G70F», «iPad 11» і «iPad A16»).
  const numsA = a.nums.filter((x) => !numHasPair(x, a, b))
  const numsB = b.nums.filter((x) => !numHasPair(x, b, a))
  if (!strong && ownA.length + numsA.length > 0 && ownB.length + numsB.length > 0 && numsA.length + numsB.length > 0) {
    return different([`різні позначення моделі: ${numsA[0] ?? ownA[0]} і ${numsB[0] ?? ownB[0]}`])
  }
  const spec = specsConflict(a.specs, b.specs)
  if (spec) return different([`різні характеристики: ${spec}`])

  if (shared.length > 0) {
    // Короткий код буває спільним для різних серій («780NC» у JBL Live і JBL Tune, «EV80DR» у Willer Optima і Grand)
    const series = !strong && shared.every((c) => c.length <= 6) ? seriesConflict(a, b) : null
    if (series) return different([`спільний код ${shared[0]}, але різні серії: ${series}`])
    return { decision: 'same', score: Math.max(score, 0.99), reasons: [`однаковий код моделі ${shared[0]}`] }
  }

  const article = a.articles.find((x) => b.articles.includes(x))
  if (article && score >= 0.3) return { decision: 'same', score: Math.max(score, 0.98), reasons: [`однаковий артикул ${article}`] }

  // Частковий збіг коду: SM-S948B і SM-S948BZKGEUC (суфікс кольору чи регіону)
  for (const x of a.codes) {
    for (const y of b.codes) {
      const [short, long] = x.length <= y.length ? [x, y] : [y, x]
      if (short.length >= 6 && long.startsWith(short) && long.length - short.length <= 6) {
        return { decision: 'review', score: Math.max(score, 0.9), reasons: [`код ${short} — початок коду ${long}`] }
      }
    }
  }

  // Ті самі значущі слова назви (без типу товару, бренду, кольору, кодів), а пам'ять, колір і решта
  // не суперечать: той самий товар. Назва має щось казати про модель: слова «Black» замало.
  // Якщо коди є в обох і спільного немає («27G4ZR» і «Q27G4ZR»), однакових слів замало: на перевірку
  const informative = a.tokens.length + a.specs.length >= 2 || a.tokens.some((t) => /\d/.test(t) || t.length >= 6)
  const codesDisagree = a.codes.length > 0 && b.codes.length > 0
  if (score === 1 && informative && !codesDisagree && a.colors.join() === b.colors.join() && a.specs.slice().sort().join() === b.specs.slice().sort().join()) {
    return { decision: 'same', score, reasons: ['однакові назви'] }
  }
  if (score >= 0.75) return { decision: 'review', score, reasons: [`схожі назви (${Math.round(score * 100)}%)`] }
  return { decision: 'different', score, reasons: ['назви й коди не збігаються'] }
}
