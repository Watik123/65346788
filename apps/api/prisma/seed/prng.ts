/** Детермінований генератор випадкових чисел: той самий seed дає ті самі дані. */
export class Rng {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  /** mulberry32, число в [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next()
  }

  /** Ціле в [min, max] включно */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1))
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  shuffle<T>(items: readonly T[]): T[] {
    const a = [...items]
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(0, i)
      ;[a[i], a[j]] = [a[j] as T, a[i] as T]
    }
    return a
  }
}

/** FNV-1a: стабільний числовий seed з рядка */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
