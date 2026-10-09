import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ParsedProduct } from './types'

/**
 * Сховище зібраних даних у вигляді текстових файлів:
 *   prices/<РРРР-ММ-ДД>/<магазин>.jsonl   один товар на рядок
 *   runs/<РРРР-ММ-ДД>/<магазин>.json      підсумок запуску
 * Файли це першоджерело: базу (SQLite чи PostgreSQL) з них завжди можна зібрати наново.
 */
export interface DayRecord {
  v: 1
  date: string
  shop: string
  externalId: string
  url: string
  name: string
  brand: string
  modelCode: string | null
  ean: string | null
  category: string
  price: number
  oldPrice: number | null
  inStock: boolean
  rating: number | null
  reviewCount: number
  imageUrl: string | null
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export function toRecord(p: ParsedProduct, shop: string, date: string): DayRecord {
  return {
    v: 1,
    date,
    shop,
    externalId: p.externalId,
    url: p.url,
    name: p.name,
    brand: p.brand,
    modelCode: p.modelCode,
    ean: p.ean,
    category: p.categorySlug,
    price: p.price,
    oldPrice: p.oldPrice,
    inStock: p.inStock,
    rating: p.rating,
    reviewCount: p.reviewCount,
    imageUrl: p.imageUrl,
  }
}

export function fromRecord(r: DayRecord): ParsedProduct {
  return {
    externalId: r.externalId,
    url: r.url,
    name: r.name,
    brand: r.brand,
    modelCode: r.modelCode,
    ean: r.ean,
    categorySlug: r.category,
    imageUrl: r.imageUrl,
    price: r.price,
    oldPrice: r.oldPrice,
    inStock: r.inStock,
    rating: r.rating,
    reviewCount: r.reviewCount,
    raw: null,
  }
}

function isRecord(v: unknown): v is DayRecord {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return (
    r['v'] === 1 &&
    typeof r['date'] === 'string' &&
    DAY_RE.test(r['date']) &&
    typeof r['shop'] === 'string' &&
    typeof r['externalId'] === 'string' &&
    typeof r['name'] === 'string' &&
    typeof r['brand'] === 'string' &&
    typeof r['category'] === 'string' &&
    typeof r['price'] === 'number' &&
    Number.isInteger(r['price']) &&
    (r['price'] as number) > 0 &&
    typeof r['inStock'] === 'boolean'
  )
}

/** Розбирає JSONL; пошкоджені рядки не валять увесь файл, а рахуються */
export function parseJsonl(text: string): { records: DayRecord[]; invalid: number } {
  const records: DayRecord[] = []
  let invalid = 0
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const v: unknown = JSON.parse(line)
      if (isRecord(v)) records.push(v)
      else invalid++
    } catch {
      invalid++
    }
  }
  return { records, invalid }
}

export function writeJsonl(file: string, records: DayRecord[]): void {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : ''))
}

export function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}

export interface DayFile {
  date: string
  shop: string
  file: string
}

/** Усі файли цін у сховищі, від старих до нових */
export function listDayFiles(root: string): DayFile[] {
  const dir = path.join(root, 'prices')
  let days: string[]
  try {
    days = readdirSync(dir).filter((d) => DAY_RE.test(d))
  } catch {
    return []
  }
  const out: DayFile[] = []
  for (const date of days.sort()) {
    for (const f of readdirSync(path.join(dir, date)).filter((x) => x.endsWith('.jsonl')).sort()) {
      out.push({ date, shop: f.replace(/\.jsonl$/, ''), file: path.join(dir, date, f) })
    }
  }
  return out
}

export function readDayFile(f: DayFile): { records: DayRecord[]; invalid: number } {
  return parseJsonl(readFileSync(f.file, 'utf8'))
}
