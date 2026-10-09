import type { FeedItemDto, FeedResponse, FiltersResponse } from '@znyzhky/shared'
import { SORT_OPTIONS } from '@znyzhky/shared'

export function makeItem(id: number, over: Partial<FeedItemDto> = {}): FeedItemDto {
  return {
    id,
    name: `Телевізор Samsung ${id}`,
    brand: 'Samsung',
    imageUrl: null,
    category: { slug: 'televizory', name: 'Телевізори' },
    bestPrice: 29399,
    bestShop: { slug: 'zeta', name: 'Магазин Зета' },
    basePrice: 35999,
    discountPercent: 18.3,
    discountAmount: 6600,
    rating: 4.8,
    reviewCount: 214,
    shopsCount: 6,
    score: 15.6,
    sparkline: [35999, 35999, 35999, 29399, 29399],
    ...over,
  }
}

export function makeFeed(items: FeedItemDto[], over: Partial<FeedResponse> = {}): FeedResponse {
  return { items, total: items.length, page: 1, limit: 12, pages: 1, ...over }
}

export const FILTERS: FiltersResponse = {
  demo: true,
  categories: [
    {
      slug: 'elektronika',
      name: 'Електроніка',
      dealCount: 5,
      children: [
        { slug: 'televizory', name: 'Телевізори', dealCount: 3, children: [] },
        { slug: 'smartfony', name: 'Смартфони', dealCount: 2, children: [] },
      ],
    },
  ],
  shops: [
    { slug: 'alfa', name: 'Магазин Альфа', dealCount: 4 },
    { slug: 'zeta', name: 'Магазин Зета', dealCount: 5 },
  ],
  priceRange: { min: 7299, max: 42099 },
  maxDiscountPercent: 22.2,
  sortOptions: SORT_OPTIONS,
}
