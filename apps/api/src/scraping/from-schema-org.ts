import { extractJsonLdProducts, extractMetaProduct, type ExtractedProduct } from './schema-org'
import type { ParseOutcome, ProductRef } from './types'

export interface SchemaOrgParseOptions {
  /** Якщо в пропозиції вказано продавця, і він не з цього списку, це чужий продавець (маркетплейс) */
  ownSellerNames?: string[]
  /** Як отримати стабільний ідентифікатор, якщо в розмітці немає sku */
  externalIdFromUrl?: (url: string) => string | null
  /** Якщо в розмітці немає бренду: як дістати його з назви (напр. за списком відомих брендів). Вгадувати не будемо. */
  brandFromName?: (name: string) => string | null
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Типовий розбір сторінки товару за розміткою schema.org (JSON-LD), із запасним варіантом
 * на мета-теги. Більшості магазинів вистачає саме цього, тож їхній модуль зводиться до
 * пошуку адрес і виклику цієї функції.
 */
export function parseProductPage(html: string, ref: ProductRef, opts: SchemaOrgParseOptions = {}): ParseOutcome {
  const ld = extractJsonLdProducts(html)
  const meta = extractMetaProduct(html)
  const found: ExtractedProduct | undefined = ld.products.find((p) => p.price !== null) ?? ld.products[0]

  if (!found) {
    const detail = ld.blocks === 0 ? 'на сторінці немає розмітки schema.org' : `блоків ld+json: ${ld.blocks}, зламаних: ${ld.invalidBlocks}, товару серед них немає`
    return { kind: 'skip', reason: 'not_a_product', detail }
  }

  if (opts.ownSellerNames?.length && found.seller && !opts.ownSellerNames.some((n) => sameName(n, found.seller as string))) {
    return { kind: 'skip', reason: 'third_party_seller', detail: found.seller }
  }

  const price = found.price ?? meta.price ?? null
  if (price === null) return { kind: 'skip', reason: 'no_price' }

  const currency = found.currency ?? meta.currency ?? 'UAH'
  if (currency.toUpperCase() !== 'UAH') return { kind: 'skip', reason: 'wrong_currency', detail: currency }

  const url = ref.url
  const externalId = found.sku ?? opts.externalIdFromUrl?.(url) ?? null
  const name = found.name ?? meta.name ?? null
  if (!externalId || !name) return { kind: 'skip', reason: 'missing_data', detail: !externalId ? 'немає sku' : 'немає назви' }

  const brand = found.brand ?? opts.brandFromName?.(name) ?? null
  if (!brand) return { kind: 'skip', reason: 'missing_data', detail: 'немає бренду' }

  const availability = found.availability !== 'unknown' ? found.availability : (meta.availability ?? 'unknown')

  return {
    kind: 'product',
    product: {
      externalId,
      url,
      name,
      brand,
      modelCode: found.mpn ?? null,
      ean: found.ean,
      categorySlug: ref.categorySlug,
      imageUrl: found.imageUrl ?? meta.imageUrl ?? null,
      price,
      oldPrice: null,
      inStock: availability === 'in_stock',
      rating: found.rating,
      reviewCount: found.reviewCount,
      raw: found.raw,
    },
  }
}
