import type { PrismaClient } from '../generated/prisma/client'
import { extractAttributes } from '../matching/attributes'
import { compareProducts, type MatchResult } from '../matching/compare'
import { MatchDecisions, offerKey } from '../matching/decisions'
import type { ParsedProduct } from './types'

export class IngestError extends Error {
  constructor(
    readonly kind: 'ingest' | 'suspicious_price',
    message: string,
  ) {
    super(message)
  }
}

export interface IngestResult {
  action: 'created' | 'updated'
  productId: number
  /** Як знайшли товар серед уже відомих (для нового запису магазину) */
  matchedBy?: 'offer' | 'decision' | 'ean' | 'model' | 'new'
}

export interface IngestOptions {
  now?: Date
  /** Slug магазину: потрібен для рішень людини щодо спірних пар */
  shopSlug?: string
  decisions?: MatchDecisions
}

const NO_DECISIONS = new MatchDecisions()

/** Ціна змінилась більш ніж у стільки разів: майже напевно помилка розбору, а не справжня зміна */
const MAX_PRICE_JUMP = 5
const MAX_RAW_BYTES = 20_000

function rawJson(p: ParsedProduct): string {
  const full = JSON.stringify({ oldPrice: p.oldPrice, raw: p.raw })
  return full.length <= MAX_RAW_BYTES ? full : JSON.stringify({ oldPrice: p.oldPrice, truncated: true })
}

/**
 * Записує один товар магазину: пропозицію, точку в історії цін за сьогодні і, якщо треба, сам товар.
 * Повторний запуск за ту саму добу перезаписує сьогоднішню ціну, а не дублює її.
 *
 * Зіставлення з товарами інших магазинів тут мінімальне: лише за точним штрихкодом (EAN).
 * Решту (код моделі, схожі назви) робить окремий етап зіставлення.
 */
export async function ingestProduct(
  prisma: PrismaClient,
  shopId: number,
  p: ParsedProduct,
  today: Date,
  categoryIds: ReadonlyMap<string, number>,
  options: IngestOptions | Date = {},
): Promise<IngestResult> {
  const opts: IngestOptions = options instanceof Date ? { now: options } : options
  const now = opts.now ?? new Date()
  const decisions = opts.decisions ?? NO_DECISIONS
  const key = opts.shopSlug ? offerKey(opts.shopSlug, p.externalId) : null
  const categoryId = categoryIds.get(p.categorySlug)
  if (categoryId === undefined) throw new IngestError('ingest', `Невідома категорія "${p.categorySlug}"`)

  return prisma.$transaction(async (tx) => {
    let offer = await tx.offer.findFirst({ where: { shopId, externalId: p.externalId } })

    if (offer && (p.price < offer.price / MAX_PRICE_JUMP || p.price > offer.price * MAX_PRICE_JUMP)) {
      throw new IngestError('suspicious_price', `Ціна змінилась з ${offer.price} до ${p.price} ₴, схоже на помилку розбору; запис пропущено`)
    }

    let productId = offer?.productId
    let created = false
    let matchedBy: IngestResult['matchedBy'] = offer ? 'offer' : undefined
    let reviews: { candidateId: number; result: MatchResult }[] = []

    // 1. Рішення людини: «цей товар той самий, що й такий-то в іншому магазині»
    if (productId === undefined && key) {
      for (const other of decisions.sameAs(key)) {
        const [slug, ext] = [other.slice(0, other.indexOf(':')), other.slice(other.indexOf(':') + 1)]
        const o = await tx.offer.findFirst({ where: { externalId: ext, shop: { slug } }, select: { productId: true } })
        if (o) {
          productId = o.productId
          matchedBy = 'decision'
          break
        }
      }
    }

    // 2. Однаковий штрихкод
    if (productId === undefined && p.ean) {
      const byEan = await tx.product.findUnique({ where: { ean: p.ean }, select: { id: true } })
      productId = byEan?.id
      if (productId !== undefined) matchedBy = 'ean'
    }

    // 3. Той самий бренд і код моделі в тій самій категорії; товари, що вже є в цьому магазині, не кандидати
    if (productId === undefined) {
      const rejected = key ? decisions.differentFrom(key) : new Set<string>()
      const incoming = { ...extractAttributes({ brand: p.brand, name: p.name, modelCode: p.modelCode, ean: p.ean }), ean: p.ean }
      const candidates = await tx.product.findMany({
        where: { categoryId, offers: { none: { shopId } } },
        select: { id: true, name: true, brand: true, modelCode: true, ean: true, offers: { select: { externalId: true, shop: { select: { slug: true } } } } },
        orderBy: { id: 'asc' },
      })
      const results = candidates
        .filter((c) => c.brand.trim().toLowerCase() === incoming.brand)
        .filter((c) => !c.offers.some((o) => o.externalId && rejected.has(offerKey(o.shop.slug, o.externalId))))
        .map((c) => ({ candidateId: c.id, result: compareProducts(incoming, { ...extractAttributes(c), ean: c.ean }) }))
      const same = results.find((r) => r.result.decision === 'same')
      if (same) {
        productId = same.candidateId
        matchedBy = 'model'
      } else {
        reviews = results.filter((r) => r.result.decision === 'review').sort((a, b) => b.result.score - a.result.score).slice(0, 3)
      }
    }

    if (productId === undefined) {
      const product = await tx.product.create({
        data: {
          name: p.name,
          brand: p.brand,
          modelCode: p.modelCode,
          ean: p.ean,
          categoryId,
          imageUrl: p.imageUrl,
          ratingAvg: p.rating,
          reviewCount: p.reviewCount,
        },
        select: { id: true },
      })
      productId = product.id
      created = true
      matchedBy = 'new'
      // Спірні пари: окремий товар, але з позначкою «перевірити, чи це не той самий»
      for (const r of reviews) {
        await tx.matchReview.create({ data: { productId, candidateId: r.candidateId, score: r.result.score, reasons: JSON.stringify(r.result.reasons) } })
      }
    } else if (!created) {
      // Існуючий товар: доповнюємо лише те, чого бракує, і беремо оцінку, якщо відгуків більше
      const existing = await tx.product.findUniqueOrThrow({ where: { id: productId } })
      await tx.product.update({
        where: { id: productId },
        data: {
          imageUrl: existing.imageUrl ?? p.imageUrl,
          ean: existing.ean ?? p.ean,
          modelCode: existing.modelCode ?? p.modelCode,
          ...(p.reviewCount > existing.reviewCount ? { ratingAvg: p.rating, reviewCount: p.reviewCount } : {}),
        },
      })
    }

    // Один товар у магазині = одна пропозиція (productId + shopId унікальні)
    offer ??= await tx.offer.findUnique({ where: { productId_shopId: { productId, shopId } } })

    const data = { externalId: p.externalId, price: p.price, inStock: p.inStock, url: p.url, rawData: rawJson(p), lastSeenAt: now }
    if (offer) await tx.offer.update({ where: { id: offer.id }, data })
    else await tx.offer.create({ data: { productId, shopId, ...data } })

    const point = { price: p.price, inStock: p.inStock, isPromo: p.oldPrice !== null && p.oldPrice > p.price }
    await tx.pricePoint.upsert({
      where: { productId_shopId_date: { productId, shopId, date: today } },
      create: { productId, shopId, date: today, ...point },
      update: point,
    })

    return { action: created ? 'created' : 'updated', productId, matchedBy } as IngestResult
  })
}
