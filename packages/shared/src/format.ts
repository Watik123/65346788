const NBSP = ' '

/** 12499 → «12 499» (нерозривний пробіл між тисячами) */
export function formatNumber(n: number): string {
  const grouped = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
  return n < 0 ? `−${grouped}` : grouped
}

/** 12499 → «12 499 ₴». Пробіли нерозривні, щоб ціна не переносилась на інший рядок. */
export function formatPrice(n: number): string {
  return `${formatNumber(n)}${NBSP}₴`
}

/** 17.5 → «17,5%»; 18 → «18%» (за замовчуванням без дробової частини) */
export function formatPercent(n: number, digits = 0): string {
  return `${n.toFixed(digits).replace('.', ',')}%`
}

/** Форма слова за українськими правилами: 1 день, 2 дні, 5 днів, 11 днів, 21 день. */
export function pluralUk(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(n))
  const m10 = abs % 10
  const m100 = abs % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
