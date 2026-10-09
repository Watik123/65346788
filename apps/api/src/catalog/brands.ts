/**
 * Однакове написання бренду для всіх магазинів: «SAMSUNG», «Samsung» і «samsung» мають бути
 * одним пунктом у фільтрі. Відомі бренди пишемо як вони самі, інші ВЕЛИКИМИ ЛІТЕРАМИ
 * (довші за 3 символи) переводимо в «Звичайний» запис, короткі абревіатури (LG, HP) лишаємо.
 */
const KNOWN = [
  'AEG', 'Acer', 'Aiwa', 'Apple', 'ASUS', 'Beko', 'Bosch', 'Bravis', 'Candy', 'Dell', 'Dreame', 'Dyson', 'Ecovacs', 'Electrolux', 'Ergo',
  'Eufy', 'Gigabyte', 'Google', 'Gorenje', 'Haier', 'Hisense', 'Honor', 'Hotpoint', 'HP', 'Huawei', 'Indesit', 'Infinix', 'iRobot', 'Kärcher',
  'Kivi', 'Lenovo', 'LG', 'Liebherr', 'Miele', 'Motorola', 'MSI', 'Nothing', 'Nubia', 'OnePlus', 'OPPO', 'Panasonic', 'Philips', 'POCO',
  'realme', 'Roborock', 'Rowenta', 'Samsung', 'Sencor', 'Sharp', 'Siemens', 'Snaige', 'Sony', 'TCL', 'Tecno', 'Tefal', 'Thomas', 'Vivo',
  'Whirlpool', 'Xiaomi', 'Zelmer', 'ZTE', '2E',
]
const BY_KEY = new Map(KNOWN.map((b) => [key(b), b]))
const ALIASES = new Map([['karcher', 'Kärcher']])

function key(brand: string): string {
  return brand.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

/** Ключ для порівняння брендів: «KARCHER» і «Kärcher» дають той самий */
export function brandKey(raw: string): string {
  return key(canonicalBrand(raw))
}

export function canonicalBrand(raw: string): string {
  const brand = raw.replace(/\s+/g, ' ').trim()
  const k = key(brand)
  const known = BY_KEY.get(k) ?? ALIASES.get(k)
  if (known) return known
  if (brand.length > 3 && brand === brand.toUpperCase() && /\p{Lu}/u.test(brand)) {
    return brand.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
  }
  return brand
}
