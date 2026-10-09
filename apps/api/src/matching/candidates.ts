import type { PrismaClient } from '../generated/prisma/client'
import { brandKey } from '../catalog/brands'
import { extractAttributes, type ProductAttributes } from './attributes'
import { offerKey } from './decisions'

/** Клієнт бази або транзакція: обидва вміють читати товари */
type Db = Pick<PrismaClient, 'product'>

export interface ProductFields {
  name: string
  brand: string
  modelCode: string | null
  ean: string | null
}

export interface Candidate {
  id: number
  attrs: ProductAttributes & { ean: string | null }
  /** Магазини, у яких товар уже є: там він не кандидат */
  shopIds: Set<number>
  /** «магазин:артикул» пропозицій товару, для рішень людини «це різні товари» */
  offerKeys: string[]
}

const attrsOf = (p: ProductFields) => ({ ...extractAttributes(p), ean: p.ean })

/**
 * Товари категорії, розкладені за брендом, у пам'яті на час одного імпорту чи збору.
 * Без цього кожен новий запис магазину перечитував з бази всю категорію разом із пропозиціями
 * й заново розбирав назви, і перший імпорт нового магазину з сотнями ноутбуків тривав десятки хвилин.
 *
 * Індекс змінюють лише після успішного запису (record), щоб він не розійшовся з базою, коли запис
 * відкотився.
 */
export class CandidateIndex {
  private readonly categories = new Map<number, Map<string, Candidate[]>>()
  private readonly byId = new Map<number, Candidate>()

  private async load(db: Db, categoryId: number): Promise<Map<string, Candidate[]>> {
    const loaded = this.categories.get(categoryId)
    if (loaded) return loaded
    const rows = await db.product.findMany({
      where: { categoryId },
      select: { id: true, name: true, brand: true, modelCode: true, ean: true, offers: { select: { shopId: true, externalId: true, shop: { select: { slug: true } } } } },
      orderBy: { id: 'asc' },
    })
    const byBrand = new Map<string, Candidate[]>()
    for (const r of rows) {
      const c: Candidate = {
        id: r.id,
        attrs: attrsOf(r),
        shopIds: new Set(r.offers.map((o) => o.shopId)),
        offerKeys: r.offers.flatMap((o) => (o.externalId ? [offerKey(o.shop.slug, o.externalId)] : [])),
      }
      const list = byBrand.get(c.attrs.brand) ?? []
      list.push(c)
      byBrand.set(c.attrs.brand, list)
      this.byId.set(c.id, c)
    }
    this.categories.set(categoryId, byBrand)
    return byBrand
  }

  /** Товари того самого бренду в категорії, яких ще немає в цьому магазині, від старіших до новіших */
  async candidates(db: Db, categoryId: number, brand: string, shopId: number): Promise<Candidate[]> {
    const byBrand = await this.load(db, categoryId)
    return (byBrand.get(brandKey(brand)) ?? []).filter((c) => !c.shopIds.has(shopId))
  }

  /**
   * Після запису пропозиції: новий товар з'являється серед кандидатів, у знайденого товару
   * додається магазин, а дописані код моделі чи штрихкод враховуються в ознаках.
   */
  record(categoryId: number, productId: number, fields: ProductFields, shopId: number, key: string | null, created: boolean): void {
    let c = this.byId.get(productId)
    if (!c) {
      // Категорію товару ще не читали: прочитають з бази пізніше, разом із цим записом
      const byBrand = created ? this.categories.get(categoryId) : undefined
      if (!byBrand) return
      c = { id: productId, attrs: attrsOf(fields), shopIds: new Set(), offerKeys: [] }
      const list = byBrand.get(c.attrs.brand) ?? []
      list.push(c)
      byBrand.set(c.attrs.brand, list)
      this.byId.set(productId, c)
    } else {
      c.attrs = attrsOf(fields)
    }
    c.shopIds.add(shopId)
    if (key && !c.offerKeys.includes(key)) c.offerKeys.push(key)
  }
}
