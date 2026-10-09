import type { ShopScraper } from '../scraping/types'
import { citrus } from './citrus'
import { foxtrot } from './foxtrot'
import { ktc } from './ktc'
import { moyo } from './moyo'

/**
 * Реєстр магазинів. Щоб додати магазин: створіть файл src/scrapers/<slug>.ts з об'єктом
 * ShopScraper (див. README, розділ «Як додати магазин») і додайте його сюди.
 */
export const scrapers: ShopScraper[] = [ktc, foxtrot, moyo, citrus]

export function findScraper(slug: string): ShopScraper | undefined {
  return scrapers.find((s) => s.slug === slug)
}
