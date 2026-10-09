import type { ShopScraper } from '../scraping/types'
import { artline } from './artline'
import { citrus } from './citrus'
import { foxtrot } from './foxtrot'
import { jabko } from './jabko'
import { ktc } from './ktc'
import { moyo } from './moyo'
import { ttt } from './ttt'
import { vencon } from './vencon'

/**
 * Реєстр магазинів. Щоб додати магазин: створіть файл src/scrapers/<slug>.ts з об'єктом
 * ShopScraper (див. README, розділ «Як додати магазин») і додайте його сюди.
 */
export const scrapers: ShopScraper[] = [ktc, foxtrot, moyo, citrus, jabko, vencon, artline, ttt]

export function findScraper(slug: string): ShopScraper | undefined {
  return scrapers.find((s) => s.slug === slug)
}
