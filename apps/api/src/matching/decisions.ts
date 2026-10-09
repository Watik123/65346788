import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Рішення людини щодо спірних пар: «той самий товар» або «різні». Зберігаються у файловому
 * сховищі (datastore/match-decisions.jsonl), бо базу з файлів збирають наново, а рішення
 * мають пережити це. Товар у магазині позначається ключем «магазин:артикул».
 */
export interface MatchDecisionRecord {
  a: string
  b: string
  decision: 'same' | 'different'
  at: string
}

export const offerKey = (shopSlug: string, externalId: string) => `${shopSlug}:${externalId}`

export class MatchDecisions {
  private same = new Map<string, Set<string>>()
  private diff = new Map<string, Set<string>>()

  constructor(records: MatchDecisionRecord[] = []) {
    // Пізніше рішення скасовує попереднє для тієї самої пари
    for (const r of records) {
      const target = r.decision === 'same' ? this.same : this.diff
      const other = r.decision === 'same' ? this.diff : this.same
      for (const [x, y] of [[r.a, r.b], [r.b, r.a]] as const) {
        other.get(x)?.delete(y)
        if (!target.has(x)) target.set(x, new Set())
        target.get(x)?.add(y)
      }
    }
  }

  sameAs(key: string): string[] {
    return [...(this.same.get(key) ?? [])]
  }

  differentFrom(key: string): Set<string> {
    return this.diff.get(key) ?? new Set()
  }
}

export const decisionsFile = (root: string) => path.join(root, 'match-decisions.jsonl')

export function readDecisions(root: string): MatchDecisionRecord[] {
  const file = decisionsFile(root)
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .flatMap((l) => {
      try {
        const r = JSON.parse(l) as MatchDecisionRecord
        return r.a && r.b && (r.decision === 'same' || r.decision === 'different') ? [r] : []
      } catch {
        return []
      }
    })
}

export function appendDecision(root: string, rec: Omit<MatchDecisionRecord, 'at'>): void {
  mkdirSync(root, { recursive: true })
  appendFileSync(decisionsFile(root), JSON.stringify({ ...rec, at: new Date().toISOString() }) + '\n')
}
