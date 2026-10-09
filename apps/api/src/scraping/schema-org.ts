import * as cheerio from 'cheerio'

/** Дані про товар зі сторінки, як їх віддає розмітка. Нічого не вигадується: чого немає, те null. */
export interface ExtractedProduct {
  name: string | null
  brand: string | null
  sku: string | null
  mpn: string | null
  ean: string | null
  imageUrl: string | null
  price: number | null
  currency: string | null
  availability: 'in_stock' | 'out_of_stock' | 'unknown'
  url: string | null
  seller: string | null
  rating: number | null
  reviewCount: number
  /** Вузол розмітки як є, для налагодження */
  raw: unknown
}

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const asArray = <T>(v: T | T[] | undefined | null): T[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v])

/**
 * «12 499,00» → 12499, «12,499.50» → 12500, «12499» → 12499.
 * Ціни тримаємо в цілих гривнях. Нуль, від'ємні й сміття дають null.
 */
export function parsePrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value) : null
  if (typeof value !== 'string') return null

  let s = value.replace(/[\s  ]/g, '').replace(/[^\d.,]/g, '')
  if (!/\d/.test(s)) return null
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) {
    // Останній роздільник десятковий, інший це розділювач тисяч
    const decimalSep = lastDot > lastComma ? '.' : ','
    const thousandSep = decimalSep === '.' ? ',' : '.'
    s = s.split(thousandSep).join('').replace(decimalSep, '.')
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.'
    const parts = s.split(sep)
    const isThousands = parts.length > 2 || (parts.length === 2 && (parts[1] as string).length === 3 && (parts[0] as string).length <= 3 && parts[0] !== '0')
    s = isThousands ? parts.join('') : `${parts[0]}.${parts.slice(1).join('')}`
  }
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

/** Лишає штрихкод лише якщо він справжній EAN-13 (з вірною контрольною цифрою) */
export function normalizeEan(value: unknown): string | null {
  const digits = (typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '').replace(/\D/g, '')
  const code = digits.length === 12 ? `0${digits}` : digits // UPC-A це EAN-13 з нулем попереду
  if (code.length !== 13) return null
  const sum = [...code.slice(0, 12)].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0)
  return (10 - (sum % 10)) % 10 === Number(code[12]) ? code : null
}

const IN_STOCK = /^(InStock|LimitedAvailability|OnlineOnly|InStoreOnly)$/i
const OUT_OF_STOCK = /^(OutOfStock|SoldOut|Discontinued|PreOrder|PreSale|BackOrder)$/i

export function parseAvailability(value: unknown): ExtractedProduct['availability'] {
  if (typeof value !== 'string') return 'unknown'
  const tail = value.trim().split('/').pop() ?? ''
  if (IN_STOCK.test(tail)) return 'in_stock'
  if (OUT_OF_STOCK.test(tail)) return 'out_of_stock'
  return 'unknown'
}

function text(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number') return String(v)
  if (isObj(v)) return text(v['name'])
  return null
}

function firstImage(v: unknown): string | null {
  for (const item of asArray(v)) {
    if (typeof item === 'string' && item) return item
    if (isObj(item) && typeof item['url'] === 'string') return item['url']
  }
  return null
}

function typeIncludes(node: Json, wanted: string[]): boolean {
  return asArray(node['@type']).some((t) => typeof t === 'string' && wanted.includes(t))
}

/** Усі вузли розмітки, у тому числі всередині @graph і вкладені */
function* walk(node: unknown): Generator<Json> {
  if (Array.isArray(node)) {
    for (const n of node) yield* walk(n)
  } else if (isObj(node)) {
    yield node
    for (const key of ['@graph', 'mainEntity', 'itemListElement', 'hasVariant']) if (key in node) yield* walk(node[key])
  }
}

function pickOffer(offers: unknown): Json | null {
  const list = asArray(offers).filter(isObj)
  // AggregateOffer: беремо нижню ціну; кілька пропозицій: першу в наявності, інакше першу
  const flat = list.flatMap((o) => (typeIncludes(o, ['AggregateOffer']) && o['offers'] ? asArray(o['offers']).filter(isObj).concat(o) : [o]))
  return flat.find((o) => parseAvailability(o['availability']) === 'in_stock') ?? flat[0] ?? null
}

function fromProductNode(node: Json): ExtractedProduct {
  const offer = pickOffer(node['offers'])
  const rating = isObj(node['aggregateRating']) ? node['aggregateRating'] : null
  const price = offer ? (parsePrice(offer['price']) ?? parsePrice(offer['lowPrice'])) : null

  const reviewCountRaw = rating ? (rating['reviewCount'] ?? rating['ratingCount']) : 0
  const ratingValue = rating ? Number(rating['ratingValue']) : NaN

  return {
    name: text(node['name']),
    brand: text(node['brand']),
    sku: text(node['sku']),
    mpn: text(node['mpn']),
    ean: normalizeEan(node['gtin13'] ?? node['gtin'] ?? node['gtin12'] ?? node['gtin14'] ?? node['gtin8']),
    imageUrl: firstImage(node['image']),
    price,
    currency: offer ? text(offer['priceCurrency']) : null,
    availability: offer ? parseAvailability(offer['availability']) : 'unknown',
    url: offer ? (text(offer['url']) ?? text(node['url'])) : text(node['url']),
    seller: offer ? text(offer['seller']) : null,
    rating: Number.isFinite(ratingValue) && ratingValue > 0 && ratingValue <= 5 ? ratingValue : null,
    reviewCount: Math.max(0, Math.round(Number(reviewCountRaw) || 0)),
    raw: node,
  }
}

export interface JsonLdResult {
  products: ExtractedProduct[]
  /** Скільки блоків ld+json було на сторінці і скільки з них не вдалося прочитати */
  blocks: number
  invalidBlocks: number
}

/** Знаходить товари в <script type="application/ld+json">. Зламаний блок не валить розбір решти. */
export function extractJsonLdProducts(html: string): JsonLdResult {
  const $ = cheerio.load(html)
  const result: JsonLdResult = { products: [], blocks: 0, invalidBlocks: 0 }

  $('script[type="application/ld+json"]').each((_, el) => {
    result.blocks++
    const source = $(el).text().trim()
    let parsed: unknown
    try {
      parsed = JSON.parse(source)
    } catch {
      try {
        // Часта вада: сирі переноси рядків усередині рядків
        parsed = JSON.parse(source.replace(/[\u0000-\u001F]+/g, ' '))
      } catch {
        result.invalidBlocks++
        return
      }
    }
    for (const node of walk(parsed)) {
      if (typeIncludes(node, ['Product', 'IndividualProduct', 'ProductModel'])) result.products.push(fromProductNode(node))
    }
  })
  return result
}

/** Запасний варіант: мета-теги Open Graph / product:* (ціна, валюта, назва) */
export function extractMetaProduct(html: string): Partial<ExtractedProduct> {
  const $ = cheerio.load(html)
  const meta = (name: string): string | null =>
    ($(`meta[property="${name}"]`).attr('content') ?? $(`meta[name="${name}"]`).attr('content') ?? '').trim() || null

  const availability = meta('product:availability') ?? meta('og:availability')
  return {
    name: meta('og:title'),
    imageUrl: meta('og:image'),
    url: meta('og:url'),
    price: parsePrice(meta('product:price:amount') ?? meta('og:price:amount')),
    currency: meta('product:price:currency') ?? meta('og:price:currency'),
    availability: availability ? (/in\s*stock|instock|available/i.test(availability) ? 'in_stock' : /out|sold/i.test(availability) ? 'out_of_stock' : 'unknown') : 'unknown',
  }
}

export interface Crumb {
  name: string
  url: string | null
}

/** Хлібні крихти з розмітки BreadcrumbList, за порядком position */
export function extractBreadcrumbs(html: string): Crumb[] {
  const $ = cheerio.load(html)
  let best: Crumb[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    let parsed: unknown
    try {
      parsed = JSON.parse($(el).text())
    } catch {
      return
    }
    for (const node of walk(parsed)) {
      if (!typeIncludes(node, ['BreadcrumbList'])) continue
      const items = asArray(node['itemListElement'])
        .filter(isObj)
        .map((it, i) => {
          const item = it['item']
          const name = text(it['name']) ?? (isObj(item) ? text(item['name']) : null)
          const url = typeof item === 'string' ? item : isObj(item) ? (text(item['@id']) ?? text(item['url'])) : null
          return { pos: Number(it['position']) || i + 1, name, url }
        })
        .filter((c): c is { pos: number; name: string; url: string | null } => c.name !== null)
        .sort((a, b) => a.pos - b.pos)
        .map(({ name, url }) => ({ name, url }))
      if (items.length > best.length) best = items
    }
  })
  return best
}
