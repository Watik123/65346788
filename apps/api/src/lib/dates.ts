export const DAY_MS = 86_400_000

/** Північ UTC для дня, якому належить момент d */
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** РРРР-ММ-ДД → північ UTC; кидає помилку на некоректному вводі */
export function parseDay(s: string): Date {
  const d = new Date(`${s}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime())) {
    throw new Error(`Дата має формат РРРР-ММ-ДД, а не "${s}"`)
  }
  return d
}
