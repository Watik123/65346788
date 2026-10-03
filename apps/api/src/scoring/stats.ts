export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2
}

export function round1(x: number): number {
  return Math.round(x * 10) / 10
}

export function round2(x: number): number {
  return Math.round(x * 100) / 100
}

/** Скільки разів ціна між сусідніми записами змінилась на threshold (частка) і більше */
export function countSwings(prices: readonly number[], threshold: number): number {
  let swings = 0
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1] as number
    if (prev > 0 && Math.abs((prices[i] as number) - prev) / prev >= threshold) swings++
  }
  return swings
}
