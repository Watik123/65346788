import type { PrismaClient } from '../generated/prisma/client'

/**
 * Зливає два товари в один: пропозиції й історія цін товару fromId переходять до intoId,
 * відсутні в intoId поля (штрихкод, код моделі, фото) доповнюються, fromId видаляється.
 */
export async function mergeProducts(prisma: PrismaClient, fromId: number, intoId: number): Promise<void> {
  if (fromId === intoId) return
  await prisma.$transaction(async (tx) => {
    const [from, into] = await Promise.all([
      tx.product.findUniqueOrThrow({ where: { id: fromId }, include: { offers: true } }),
      tx.product.findUniqueOrThrow({ where: { id: intoId }, include: { offers: true } }),
    ])
    const clash = from.offers.find((o) => into.offers.some((x) => x.shopId === o.shopId))
    if (clash) throw new Error('Обидва товари мають пропозиції одного магазину: це різні товари, злиття неможливе')

    await tx.offer.updateMany({ where: { productId: fromId }, data: { productId: intoId } })
    await tx.pricePoint.updateMany({ where: { productId: fromId }, data: { productId: intoId } })
    // EAN унікальний: спершу звільняємо його у товару, що зникає, і лише потім переносимо
    await tx.product.update({ where: { id: fromId }, data: { ean: null } })
    await tx.product.update({
      where: { id: intoId },
      data: {
        ean: into.ean ?? from.ean,
        modelCode: into.modelCode ?? from.modelCode,
        imageUrl: into.imageUrl ?? from.imageUrl,
        ...(from.reviewCount > into.reviewCount ? { ratingAvg: from.ratingAvg, reviewCount: from.reviewCount } : {}),
      },
    })
    await tx.product.delete({ where: { id: fromId } })
  })
}
