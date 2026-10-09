import type { ProductAttributes } from './attributes'

export type MatchDecision = 'same' | 'review' | 'different'

export interface MatchResult {
  decision: MatchDecision
  /** Схожість назв 0..1 (для сортування спірних пар) */
  score: number
  reasons: string[]
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
 * Чи це той самий товар у двох магазинах.
 *  same      — однаковий EAN, однаковий код моделі в одного бренду або однакові назви, і жодних суперечностей;
 *  review    — схоже, але не напевно (частковий збіг коду або дуже схожі назви): на ручну перевірку;
 *  different — інший бренд, обсяг пам'яті, колір, діагональ, рік, модифікація, комплект
 *              або різні артикули конфігурацій за спільного коду серії.
 * Автоматично зливаємо лише «same»: краще пропустити збіг, ніж змішати різні товари.
 */
export function compareProducts(a: ProductAttributes & { ean?: string | null }, b: ProductAttributes & { ean?: string | null }): MatchResult {
  const score = jaccard(a.tokens, b.tokens)
  if (a.ean && b.ean) {
    return a.ean === b.ean ? { decision: 'same', score: 1, reasons: ['однаковий штрихкод'] } : { decision: 'different', score, reasons: ['різні штрихкоди'] }
  }
  if (a.brand !== b.brand) return { decision: 'different', score, reasons: ['різні бренди'] }

  const conflicts: string[] = []
  if (differ(a.storageGb, b.storageGb)) conflicts.push(`різна пам'ять: ${a.storageGb} і ${b.storageGb} ГБ`)
  if (differ(a.ramGb, b.ramGb)) conflicts.push(`різна оперативна пам'ять: ${a.ramGb} і ${b.ramGb} ГБ`)
  if (differ(a.color, b.color)) conflicts.push(`різний колір: ${a.color} і ${b.color}`)
  if (differ(a.diagonal, b.diagonal)) conflicts.push(`різна діагональ: ${a.diagonal}″ і ${b.diagonal}″`)
  if (differ(a.year, b.year)) conflicts.push(`різний рік: ${a.year} і ${b.year}`)
  if (a.variants.join() !== b.variants.join()) conflicts.push(`різна модифікація: ${a.variants.join(' ') || '—'} і ${b.variants.join(' ') || '—'}`)
  if (a.bundle !== b.bundle) conflicts.push('один із них комплект')
  if (conflicts.length > 0) return { decision: 'different', score, reasons: conflicts }

  // Коди, що не мають пари в іншому товарі (ні такого самого, ні того, що містить один одного).
  // Якщо такі є в обох — це різні артикули: різні товари, навіть за спільного коду серії
  // (HP 200 G2i DS9F6ET і DS9G2ET) чи схожих назв. 40F6000 і UE40F6000FUXUA не суперечать.
  const related = (x: string, list: string[]) => list.some((y) => y.includes(x) || x.includes(y))
  const ownA = a.codes.filter((c) => !related(c, b.codes))
  const ownB = b.codes.filter((c) => !related(c, a.codes))
  if (ownA.length > 0 && ownB.length > 0) {
    const linked = ownA.length < a.codes.length
    return { decision: 'different', score, reasons: [linked ? `спільний код серії, але різні артикули: ${ownA[0]} і ${ownB[0]}` : `різні коди моделі: ${ownA[0]} і ${ownB[0]}`] }
  }

  const shared = a.codes.filter((c) => b.codes.includes(c))
  if (shared.length > 0) return { decision: 'same', score: Math.max(score, 0.99), reasons: [`однаковий код моделі ${shared[0]}`] }

  // Частковий збіг коду: SM-S948B і SM-S948BZKGEUC (суфікс кольору чи регіону)
  for (const x of a.codes) {
    for (const y of b.codes) {
      const [short, long] = x.length <= y.length ? [x, y] : [y, x]
      if (short.length >= 6 && long.startsWith(short) && long.length - short.length <= 6) {
        return { decision: 'review', score: Math.max(score, 0.9), reasons: [`код ${short} — початок коду ${long}`] }
      }
    }
  }

  // Ті самі значущі слова назви, а бренд, пам'ять, колір і решта не суперечать: той самий товар
  if (score >= 0.95) return { decision: 'same', score, reasons: ['однакові назви'] }
  if (score >= 0.8) return { decision: 'review', score, reasons: [`схожі назви (${Math.round(score * 100)}%)`] }
  return { decision: 'different', score, reasons: ['назви й коди не збігаються'] }
}
