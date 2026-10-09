/**
 * Код моделі з назви товару, коли розмітка його не дає. Потрібен для зіставлення
 * однакових товарів у різних магазинах. Правила прості й передбачувані:
 *  1. Код у дужках наприкінці: «… Black (SM-S948BZKGEUC)» → SM-S948BZKGEUC;
 *  2. інакше найдовше «слово» з літер і цифр, що не схоже на характеристику
 *     (512GB, 3840x2160, 12/512, 5G, Wi-Fi): «LG 43UA75006LA (Smart TV…)» → 43UA75006LA.
 * Немає впевненого кандидата → null (краще нічого, ніж хибний код).
 */
const SPEC = [
  /^\d+(gb|tb|гб|тб|mb|мб|hz|гц|w|вт|mah|мач|mp|мп|"|'')$/i,
  /^\d+x\d+$/i,
  /^\d+[/\\]\d+(gb|tb|гб|тб)?$/i,
  /^[2-6]g$/i,
  /^(wi-?fi|usb-?c|ddr\d|lpddr\d+x?|nvme|pci-e|ips|oled|qled|led|uhd|fhd|hdr10\+?|ssd|rtx|gtx)$/i,
  /^(19|20)\d{2}$/,
]

const looksLikeCode = (t: string) => /[a-z]/i.test(t) && /\d/.test(t) && t.length >= 5 && t.length <= 25 && !SPEC.some((re) => re.test(t))

export function extractModelCode(name: string): string | null {
  const paren = name.match(/\(([^()]+)\)\s*$/)
  if (paren) {
    const inside = (paren[1] as string).trim()
    if (!/\s/.test(inside) && looksLikeCode(inside)) return inside.toUpperCase()
  }
  const withoutParens = name.replace(/\([^()]*\)/g, ' ')
  const tokens = withoutParens.split(/[\s,;]+/).map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean)
  const candidates = tokens.filter((t) => /^[a-z0-9][a-z0-9\-./]*$/i.test(t) && looksLikeCode(t))
  if (candidates.length === 0) return null
  return candidates.reduce((best, t) => (t.length > best.length ? t : best)).toUpperCase()
}
