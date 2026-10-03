import type { ShopScraper } from '../scraping/types'

/**
 * Реєстр магазинів. Щоб додати магазин: створіть файл src/scrapers/<slug>.ts з об'єктом
 * ShopScraper (див. README, розділ «Як додати магазин») і додайте його сюди.
 */
export const scrapers: ShopScraper[] = []

export function findScraper(slug: string): ShopScraper | undefined {
  return scrapers.find((s) => s.slug === slug)
}
