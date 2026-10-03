import type { DailyPrice } from './types'

export interface PriceObservation {
  date: Date
  price: number
  inStock: boolean
}

/**
 * Зводить записи історії всіх магазинів до однієї серії: за кожну добу береться
 * найнижча ціна серед товарів у наявності. Доби без жодної такої ціни пропускаються.
 */
export function marketSeries(observations: readonly PriceObservation[]): DailyPrice[] {
  const byDay = new Map<number, number>()
  for (const o of observations) {
    if (!o.inStock) continue
    const t = o.date.getTime()
    const cur = byDay.get(t)
    if (cur === undefined || o.price < cur) byDay.set(t, o.price)
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([t, price]) => ({ date: new Date(t), price }))
}
