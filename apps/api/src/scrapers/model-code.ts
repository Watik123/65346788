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
  /^\d+(gb|гб)?[/\\]\d+(gb|tb|гб|тб)$/i,
  /^[2-6]g$/i,
  /^(wi-?fi|usb-?c|ddr\d|lpddr\d+x?|nvme|pci-e|ips|oled|qled|led|uhd|fhd|hdr10\+?|ssd|rtx|gtx)$/i,
  /^(19|20)\d{2}$/,
  // Процесори й відео: i5-13420H, R7-7735HS, 10GPU; роздільність 1080p. Самих «7520U» чи «275F» тут немає:
  // так називаються й моделі (монітор MSI MAG 275F)
  /^(i[3579]|r[3579]|ultra[3579]?)-?\d{3,5}[a-z]{0,2}$/i,
  /^\d+(gpu|cpu|core|cores)$/i,
  // «(10C CPU/10C GPU)» у назвах MacBook: кількість ядер, не код
  /^(\d+c?[/\\]?)?(cpu|gpu)([/\\]?\d+c?)?$/i,
  /^\d{3,4}p$/i,
  // Комплекти й загальні позначення, однакові в багатьох різних моделей: «(2-pack)», клас Wi-Fi
  // (AC1200, AX3000, BE3600, N300), «WiFi6», тип акумулятора, захист, порти
  /^\d+-?(pack|pk|шт|in|в)-?\d*$/i,
  // Лише справжні класи Wi-Fi: «AC9140» у Remington — це модель фена
  /^ac(600|750|900|1000|1200|1300|1350|1750|1900|2100|2200|2300|2600|3000|3100|3150|3200|4000|5300|5400)$/i,
  /^axe?(1500|1800|3000|3200|4200|4800|5400|5700|6000|6600|7800|10000|11000)$/i,
  /^be(3600|5000|6500|7200|9300|9700|11000|13000|19000|22000|24000|33000)$/i,
  /^n(150|300|450|600)$/i,
  /^wi-?fi-?\d[a-z]?$/i,
  /^(lifepo\d?|li-?ion|li-?pol?)$/i,
  /^ip[x\d]\d?$/i,
  /^(usb|hdmi|bt|bluetooth|dp|type-?c)-?\d(\.\d)?$/i,
  /^\d(\.\d)?-?(ghz|gz|ггц|mhz|мгц)([/\\]\d(\.\d)?-?(ghz|gz|ггц))*$/i,
  /^[2-8]k$/i,
  /^\d+(\.\d+)?(mm|мм|cm|см|kg|кг|l|л|ml|мл|btu|kw|квт|v|в|а|a|rpm|bar|бар|pa|па|db|дб|wh|втгод|kwh|mbps|gbps)$/i,
  /^\d+x(fe|ge|lan|wan|usb|hdmi|sfp)\+?$/i,
  /^\d+x\d+(\.\d+)?(dbi|дбі|mimo)?$/i,
]

/** Схоже на код моделі, а не на характеристику (512GB, 3840x2160, 12/512, 5G, Wi-Fi) */
export const looksLikeCode = (t: string) => /[a-z]/i.test(t) && /\d/.test(t) && t.length >= 5 && t.length <= 25 && !SPEC.some((re) => re.test(t))

/** Характеристика чи загальне позначення, а не частина назви моделі: 5G, 4K, AC1200, 2-pack, 10000mAh */
export const looksLikeSpec = (t: string) => SPEC.some((re) => re.test(t))

const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

/**
 * Код моделі з назви. brand — щоб не прийняти за код сам бренд із цифрою в назві
 * («A4Tech», «1MORE», «70mai»): інакше всі товари бренду мали б «однаковий код».
 */
export function extractModelCode(name: string, brand?: string): string | null {
  const brandKey = brand ? squash(brand) : ''
  const notBrand = (t: string) => brandKey === '' || squash(t) !== brandKey
  const paren = name.match(/\(([^()]+)\)\s*$/)
  if (paren) {
    const inside = (paren[1] as string).trim()
    if (!/\s/.test(inside) && looksLikeCode(inside) && notBrand(inside)) return inside.toUpperCase()
  }
  const withoutParens = name.replace(/\([^()]*\)/g, ' ')
  const tokens = withoutParens.split(/[\s,;]+/).map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean)
  const candidates = tokens.filter((t) => /^[a-z0-9][a-z0-9\-./]*$/i.test(t) && looksLikeCode(t) && notBrand(t))
  if (candidates.length === 0) return null
  return candidates.reduce((best, t) => (t.length > best.length ? t : best)).toUpperCase()
}
