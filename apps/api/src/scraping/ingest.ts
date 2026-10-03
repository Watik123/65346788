import type { PrismaClient } from '../generated/prisma/client'
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
}

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
  now: Date = new Date(),
): Promise<IngestResult> {
  const categoryId = categoryIds.get(p.categorySlug)
  if (categoryId === undefined) throw new IngestError('ingest', `Невідома категорія "${p.categorySlug}"`)

  return prisma.$transaction(async (tx) => {
    let offer = await tx.offer.findFirst({ where: { shopId, externalId: p.externalId } })

    if (offer && (p.price < offer.price / MAX_PRICE_JUMP || p.price > offer.price * MAX_PRICE_JUMP)) {
      throw new IngestError('suspicious_price', `Ціна змінилась з ${offer.price} до ${p.price} ₴, схоже на помилку розбору; запис пропущено`)
    }

    let productId = offer?.productId
    let created = false

    if (productId === undefined && p.ean) {
      const byEan = await tx.product.findUnique({ where: { ean: p.ean }, select: { id: true } })
      productId = byEan?.id
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

    return { action: created ? 'created' : 'updated', productId } as IngestResult
  })
}
