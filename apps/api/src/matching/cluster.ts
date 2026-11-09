import { brandKey } from '../catalog/brands'
import { extractAttributes, type MatchInput, type ProductAttributes } from './attributes'
import { compareProducts, type MatchResult } from './compare'
import type { MatchDecisions } from './decisions'

/**
 * Зіставлення всіх пропозицій разом, у пам'яті: які пропозиції різних магазинів є тим самим товаром.
 * На відміну від запису по одному (ingestProduct), результат не залежить від того, котрий магазин
 * трапився першим: після основного проходу групи, що виявились тим самим товаром, з'єднуються.
 */
export interface ClusterItem {
  /** «магазин:код у магазині» */
  key: string
  shop: string
  /** Група категорій, у межах якої шукаємо збіги (matchGroup) */
  group: string
  fields: MatchInput
}

export interface Cluster<T extends ClusterItem> {
  /** Пропозиції товару в порядку появи; перша дає товару назву */
  members: T[]
}

export interface ReviewPair {
  a: string
  b: string
  score: number
  reasons: string[]
}

interface Node<T extends ClusterItem> {
  members: { item: T; attrs: ProductAttributes & { ean: string | null } }[]
  shops: Set<string>
  dead: boolean
}

type Verdict = { decision: 'same' | 'review'; score: number; reasons: string[] } | null

export function clusterOffers<T extends ClusterItem>(items: readonly T[], decisions: MatchDecisions): { clusters: Cluster<T>[]; reviews: ReviewPair[] } {
  const pools = new Map<string, Node<T>[]>()
  const byKey = new Map<string, Node<T>>()
  const byEan = new Map<string, Node<T>>()
  const reviews: ReviewPair[] = []

  const rejectedBetween = (keysA: string[], keysB: string[]) => keysA.some((a) => keysB.some((b) => decisions.differentFrom(a).has(b)))

  /** Товар проти групи: жодної прямої суперечності з жодною пропозицією групи; найкращий зі збігів */
  const verdict = (attrs: Node<T>['members'], node: Node<T>): Verdict => {
    let best: MatchResult | null = null
    for (const a of attrs) {
      for (const m of node.members) {
        const r = compareProducts(a.attrs, m.attrs)
        if (r.conflict) return null
        if (r.decision === 'different') continue
        if (!best || (r.decision === 'same' && best.decision !== 'same') || (r.decision === best.decision && r.score > best.score)) best = r
      }
    }
    return best as Verdict
  }

  for (const item of items) {
    const attrs = { ...extractAttributes(item.fields), ean: item.fields.ean }
    const self = [{ item, attrs }]
    const poolKey = `${item.group}|${brandKey(item.fields.brand)}`
    const pool = pools.get(poolKey) ?? []
    if (!pools.has(poolKey)) pools.set(poolKey, pool)

    let target: Node<T> | undefined
    // 1. Рішення людини: «цей товар той самий, що й такий-то в іншому магазині»
    for (const other of decisions.sameAs(item.key)) {
      const node = byKey.get(other)
      if (node && !node.shops.has(item.shop)) {
        target = node
        break
      }
    }
    // 2. Однаковий штрихкод
    if (!target && item.fields.ean) {
      const node = byEan.get(item.fields.ean)
      if (node && !node.shops.has(item.shop)) target = node
    }
    // 3. Код моделі, артикул або однакові назви; серед кількох підхожих — найупевненіший збіг
    let pending: { node: Node<T>; v: NonNullable<Verdict> }[] = []
    if (!target) {
      let bestRank = -1
      for (const node of pool) {
        if (node.dead || node.shops.has(item.shop)) continue
        if (rejectedBetween([item.key], node.members.map((m) => m.item.key))) continue
        const v = verdict(self, node)
        if (!v) continue
        if (v.decision === 'same') {
          const rank = v.score * 100 + node.shops.size
          if (rank > bestRank) {
            bestRank = rank
            target = node
          }
        } else pending.push({ node, v })
      }
    }

    if (target) {
      target.members.push(self[0] as Node<T>['members'][number])
      target.shops.add(item.shop)
    } else {
      target = { members: self, shops: new Set([item.shop]), dead: false }
      pool.push(target)
      pending = pending.sort((x, y) => y.v.score - x.v.score).slice(0, 3)
      for (const p of pending) reviews.push({ a: item.key, b: (p.node.members[0] as Node<T>['members'][number]).item.key, score: p.v.score, reasons: p.v.reasons })
    }
    byKey.set(item.key, target)
    if (item.fields.ean && !byEan.has(item.fields.ean)) byEan.set(item.fields.ean, target)
  }

  // Другий прохід: групи, що виявились тим самим товаром уже після того, як їх створили окремо
  // (магазин без коду в назві з'явився раніше за магазин із кодом), з'єднуються
  for (const pool of pools.values()) {
    let merged = true
    while (merged) {
      merged = false
      outer: for (let i = 0; i < pool.length; i++) {
        const a = pool[i] as Node<T>
        if (a.dead) continue
        for (let j = i + 1; j < pool.length; j++) {
          const b = pool[j] as Node<T>
          if (b.dead || [...b.shops].some((s) => a.shops.has(s))) continue
          if (rejectedBetween(a.members.map((m) => m.item.key), b.members.map((m) => m.item.key))) continue
          if (verdict(a.members, b)?.decision !== 'same') continue
          a.members.push(...b.members)
          for (const s of b.shops) a.shops.add(s)
          for (const m of b.members) byKey.set(m.item.key, a)
          b.dead = true
          merged = true
          continue outer
        }
      }
    }
  }

  const order = new Map(items.map((it, i) => [it.key, i]))
  const clusters: Cluster<T>[] = []
  for (const pool of pools.values()) {
    for (const node of pool) {
      if (node.dead) continue
      clusters.push({ members: node.members.map((m) => m.item).sort((x, y) => (order.get(x.key) as number) - (order.get(y.key) as number)) })
    }
  }
  clusters.sort((x, y) => (order.get((x.members[0] as T).key) as number) - (order.get((y.members[0] as T).key) as number))
  // Спірні пари, що після з'єднання опинились в одному товарі, вже не спірні
  const live = reviews.filter((r) => byKey.get(r.a) !== byKey.get(r.b))
  return { clusters, reviews: live }
}
