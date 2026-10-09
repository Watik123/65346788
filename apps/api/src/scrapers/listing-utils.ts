import type { CheerioAPI } from 'cheerio'
import type { ParseOutcome, SkipReason } from '../scraping/types'

/** Спільне для парсерів сторінок категорій. */

/** Адреса товару без #якоря і параметрів: стабільна між днями */
export function cleanUrl(href: string | null | undefined, base: string): string | null {
  if (!href) return null
  try {
    const u = new URL(href, base)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    u.hash = ''
    u.search = ''
    return u.toString()
  } catch {
    return null
  }
}

/**
 * Чи йти на наступну сторінку: на цій мають бути товари, і не лише продані. Магазини
 * показують товари без наявності в кінці каталогу, тож далі нічого з ціною вже немає.
 */
export function worthContinuing(outcomes: ParseOutcome[], stopReasons: readonly SkipReason[] = ['sold_out']): boolean {
  return outcomes.length > 0 && !outcomes.every((o) => o.kind === 'skip' && stopReasons.includes(o.reason))
}

/**
 * Наступна сторінка списку: лише та, на яку сайт сам посилається (rel=next або звичайне посилання),
 * і того самого походження. Так не вигадуємо адрес, яких на сайті немає.
 */
export function linkedPage($: CheerioAPI, currentUrl: string, candidate: string): string | null {
  let want: URL
  try {
    want = new URL(candidate, currentUrl)
    if (want.origin !== new URL(currentUrl).origin) return null
  } catch {
    return null
  }
  const target = want.toString()
  const found = $('link[rel="next"][href], a[href]')
    .toArray()
    .some((el) => {
      try {
        const u = new URL($(el).attr('href') ?? '', currentUrl)
        u.hash = ''
        return u.toString() === target
      } catch {
        return false
      }
    })
  return found ? target : null
}

/** Не новий товар: вживаний, уцінений, відновлений, вітринний */
export function isNotNew(name: string): boolean {
  return /(^|[^\p{L}])(б\/в|б\/у|б\.в\.|вживан|уцінен|уцінка|уценен|відновлен|восстановлен|як нов|вітринн|refurbished|renewed)/iu.test(name)
}

/** Ціле число з тексту: «28 відгуків» → 28 */
export function intFrom(text: string | null | undefined): number | null {
  const m = (text ?? '').replace(/[\s ]/g, '').match(/\d+/)
  return m ? Number(m[0]) : null
}
