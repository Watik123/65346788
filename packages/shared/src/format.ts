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

/** 4.8 → «4,8» */
export function formatRating(n: number): string {
  return n.toFixed(1).replace('.', ',')
}

/** 214 → «214 відгуків», 1 → «1 відгук», 0 → «Немає відгуків» */
export function formatReviews(n: number): string {
  return n <= 0 ? 'Немає відгуків' : `${formatNumber(n)} ${pluralUk(n, 'відгук', 'відгуки', 'відгуків')}`
}

/** 6 → «6 магазинів» */
export function formatShops(n: number): string {
  return `${n} ${pluralUk(n, 'магазин', 'магазини', 'магазинів')}`
}

/** «2026-10-03» → «3 жовтня» (без року, якщо рік поточний у межах графіка) */
const MONTHS_GENITIVE = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня']
export function formatDay(isoDay: string): string {
  const [, m, d] = isoDay.split('-')
  return `${Number(d)} ${MONTHS_GENITIVE[Number(m) - 1] ?? ''}`
}
