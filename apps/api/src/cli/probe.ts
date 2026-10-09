import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import { PoliteFetcher } from '../scraping/fetcher'
import { parseRobots } from '../scraping/robots'
import { extractJsonLdProducts, extractMetaProduct } from '../scraping/schema-org'

/**
 * Розвідка сайту перед написанням парсера: кілька десятків запитів максимум, з дотриманням
 * robots.txt і пауз. Друкує лише зведення (структура адрес, наявність розмітки, приклади полів),
 * а не сторінки цілком.
 *
 * Запуск: npm run probe -- https://shop.example [--pages=6]
 */

const UA = process.env.SCRAPER_USER_AGENT ?? `ZnyzhkyBot/0.1 (+${process.env.SCRAPER_CONTACT ?? 'contact: not set'})`
const CATEGORY_HINTS = [/televiz|телевіз|tv/i, /noutbuk|ноутбук|laptop/i, /smartfon|смартфон|phone/i, /pral|пральн|washing/i, /kholod|холодил|fridge|refriger/i, /pylos|пилос|vacuum/i]

const short = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n)}…` : s).replace(/\s+/g, ' ')

function prefixHistogram(urls: string[], depth = 1): [string, number][] {
  const counts = new Map<string, number>()
  for (const u of urls) {
    try {
      const segs = new URL(u).pathname.split('/').filter(Boolean)
      const key = '/' + segs.slice(0, depth).join('/') + (segs.length > depth ? '/…' : '')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    } catch {
      // некоректна адреса: пропускаємо
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

function breadcrumbs(html: string): string[] {
  const $ = cheerio.load(html)
  const out: string[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const walk = (n: unknown): void => {
        if (Array.isArray(n)) return n.forEach(walk)
        if (n && typeof n === 'object') {
          const o = n as Record<string, unknown>
          const t = ([] as unknown[]).concat(o['@type'] ?? [])
          if (t.includes('BreadcrumbList')) {
            for (const item of ([] as unknown[]).concat(o['itemListElement'] ?? [])) {
              const it = item as Record<string, unknown>
              const name = it['name'] ?? (it['item'] as Record<string, unknown> | undefined)?.['name']
              if (typeof name === 'string') out.push(name)
            }
          }
          if (o['@graph']) walk(o['@graph'])
        }
      }
      walk(JSON.parse($(el).text()))
    } catch {
      // зламаний блок
    }
  })
  return out
}

/** Фрагменти HTML навколо можливої «старої» (закресленої) ціни */
function oldPriceHints(html: string): string[] {
  const $ = cheerio.load(html)
  const hints: string[] = []
  $('[class*="old" i], [class*="crossed" i], [class*="was" i], del, s').each((_, el) => {
    const text = $(el).text().trim()
    if (/\d[\d\s ]{2,}/.test(text) && hints.length < 4) {
      const cls = $(el).attr('class') ?? el.tagName
      hints.push(`<${el.tagName} class="${short(cls, 60)}"> ${short(text, 50)}`)
    }
  })
  return hints
}

/** Предки елемента з класами: «div.product-price > span.price» */
function ancestry($: cheerio.CheerioAPI, el: AnyNode | undefined, depth = 4): string {
  const chain: string[] = []
  let cur = el ? $(el) : null
  for (let i = 0; cur && cur.length && i < depth; i++) {
    const node = cur.get(0) as { tagName?: string } | undefined
    const cls = (cur.attr('class') ?? '').trim().split(/\s+/).slice(0, 3).join('.')
    const id = cur.attr('id')
    chain.unshift(`${node?.tagName ?? '?'}${id ? `#${id}` : ''}${cls ? `.${cls}` : ''}`)
    cur = cur.parent()
  }
  return chain.join(' > ')
}

function collapse(html: string, n: number): string {
  return short(html.replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, '').replace(/\s+/g, ' '), n)
}

async function deep(fetcher: PoliteFetcher, urls: string[]) {
  for (const url of urls) {
    const res = await fetcher.get(url)
    const $ = cheerio.load(res.body)
    console.log(`\n######## ${url}\nHTTP ${res.status}, розмір ${res.body.length}`)

    // Усі блоки ld+json: типи та для товару повні offers
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const v = JSON.parse($(el).text())
        const types = ([] as unknown[]).concat(v['@type'] ?? (v['@graph'] ? 'graph' : '?'))
        console.log(`ld+json #${i}: ${types.join(',')}`)
        if (types.includes('Product')) {
          console.log(`  offers: ${short(JSON.stringify(v.offers), 900)}`)
          const props = ([] as Array<Record<string, unknown>>).concat(v.additionalProperty ?? [])
          console.log(`  additionalProperty (${props.length}): ${short(props.slice(0, 40).map((p) => `${p['name']}=${short(String(p['value'] ?? ''), 30)}`).join(' | '), 900)}`)
          for (const k of ['gtin', 'gtin13', 'gtin8', 'productID', 'model', 'category', 'color']) if (v[k]) console.log(`  ${k}: ${short(JSON.stringify(v[k]), 120)}`)
        }
        if (types.includes('BreadcrumbList')) {
          for (const it of ([] as Array<Record<string, unknown>>).concat(v.itemListElement ?? [])) {
            const item = it['item'] as Record<string, unknown> | string | undefined
            console.log(`  крихта: ${it['position']} ${it['name'] ?? (typeof item === 'object' ? item?.['name'] : '')} → ${typeof item === 'string' ? item : (item?.['@id'] ?? item?.['url'] ?? '')}`)
          }
        }
        if (types.includes('ItemList')) {
          const items = ([] as Array<Record<string, unknown>>).concat(v.itemListElement ?? [])
          console.log(`  ItemList: numberOfItems=${v.numberOfItems}, елементів=${items.length}`)
          items.slice(0, 2).forEach((it, k) => console.log(`  елемент ${k + 1}: ${short(JSON.stringify(it), 1400)}`))
          const keys = new Map<string, number>()
          for (const it of items) for (const key of Object.keys((it['item'] as object) ?? {})) keys.set(key, (keys.get(key) ?? 0) + 1)
          console.log(`  ключі товарів у списку: ${[...keys].map(([k, n]) => `${k}:${n}`).join(', ')}`)
        }
      } catch {
        console.log(`ld+json #${i}: зламаний`)
      }
    })

    // Закреслені ціни: де саме вони стоять
    $('del, s, [class*="old" i]').slice(0, 8).each((_, el) => {
      const t = $(el).text().trim()
      if (/\d/.test(t)) console.log(`закреслене «${short(t, 30)}»: ${ancestry($, el, 6)}`)
    })

    // Елементи з ціною поточного товару: шукаємо текст ціни з розмітки
    const ldPrice = extractJsonLdProducts(res.body).products[0]?.price
    if (ldPrice) {
      const pretty = ldPrice.toLocaleString('uk-UA').replace(/\u00A0/g, ' ')
      const hits = $('body *').not('script, style, noscript').filter((_, el) => $(el).children().length === 0 && $(el).text().replace(/[\s\u00A0]/g, '').includes(String(ldPrice))).slice(0, 4)
      hits.each((_, el) => console.log(`ціна ${pretty}: ${ancestry($, el, 6)} | блок: ${collapse($.html($(el).parent().parent()) ?? '', 400)}`))
    }

    // Сторінка категорії: картки товарів, ціни в картках, пагінація
    const goods = [...new Set($('a[href*="/goods/"]').map((_, a) => ($(a).attr('href') ?? '').split('#')[0]).get())]
    if (goods.length > 3) {
      console.log(`посилань на товари: ${goods.length}`)
      const firstCard = $('a[href*="/goods/"]').first()
      let card = firstCard
      for (let i = 0; i < 6 && card.length; i++) {
        if (card.find('a[href*="/goods/"]').length >= 1 && /\d[\d\s\u00A0]{3,}/.test(card.text()) && card.text().length < 2500) break
        card = card.parent()
      }
      console.log(`картка товару: ${ancestry($, card.get(0), 5)}`)
      console.log(`вміст картки: ${collapse($.html(card) ?? '', 1500)}`)
      $('div.loop__pb').slice(0, 3).each((k, el) => console.log(`блок ціни картки ${k + 1}: ${collapse($.html(el) ?? '', 600)}`))
      $('div.loop__avholder').slice(0, 2).each((k, el) => console.log(`наявність картки ${k + 1}: ${collapse($.html(el) ?? '', 300)}`))
      const pag = [...new Set($('a[href]').map((_, a) => $(a).attr('href') ?? '').get().filter((h) => /page|p=\d|\/\d+\/?$|_\d+\/?$/i.test(h) && !h.includes('/goods/')))].slice(0, 10)
      console.log(`пагінація (кандидати): ${pag.join('  ') || '—'}`)
      const next = $('link[rel="next"], a[rel="next"]').attr('href')
      console.log(`rel=next: ${next ?? '—'}`)
      const navTexts = $('a').filter((_, a) => /^\s*[2-9]\s*$/.test($(a).text())).map((_, a) => `${$(a).text().trim()}→${$(a).attr('href')}`).get().slice(0, 6)
      console.log(`посилання з цифрами: ${navTexts.join('  ') || '—'}`)
    }

    // Посилання на підкатегорії з ключовими словами
    const sub = $('a[href]').filter((_, a) => /пральн|холодильн|пилосос|телевіз|ноутбук|смартфон/i.test($(a).text()) && !($(a).attr('href') ?? '').includes('/goods/')).map((_, a) => `${short($(a).text().trim(), 30)} → ${$(a).attr('href')}`).get()
    if (sub.length) console.log(`підкатегорії: ${[...new Set(sub)].slice(0, 15).join('  |  ')}`)
  }
}

async function main() {
  const deepArg = process.argv.find((a) => a.startsWith('--deep='))
  if (deepArg) {
    const urls = deepArg.slice(7).split(',').map((u) => u.trim()).filter(Boolean).slice(0, 10)
    const fetcher = new PoliteFetcher({ shop: 'probe', userAgent: UA, minDelayMs: 2000, jitterMs: 800, retries: 1 })
    console.log(`Глибока розвідка (${urls.length} адрес)\nUser-Agent: ${UA}`)
    await deep(fetcher, urls)
    return
  }
  const target = process.argv.slice(2).find((a) => !a.startsWith('--'))
  const pagesArg = process.argv.find((a) => a.startsWith('--pages='))
  const maxPages = Math.min(Number(pagesArg?.slice(8) ?? 6) || 6, 12)
  if (!target) {
    console.log('Запуск: npm run probe -- https://shop.example [--pages=6]')
    process.exit(1)
  }
  const origin = new URL(target).origin
  const fetcher = new PoliteFetcher({ shop: 'probe', userAgent: UA, minDelayMs: 2000, jitterMs: 800, retries: 1 })
  console.log(`Розвідка ${origin}\nUser-Agent: ${UA}\n`)

  // 1. robots.txt і карта сайту
  const robotsRes = await fetcher.get(`${origin}/robots.txt`)
  const robots = parseRobots(robotsRes.status === 200 ? robotsRes.body : '', UA)
  console.log(`== robots.txt: HTTP ${robotsRes.status}, Crawl-delay: ${robots.crawlDelaySeconds ?? 'немає'}, Sitemap: ${robots.sitemaps.join(', ') || 'не вказано'}`)

  const sitemapCandidates = robots.sitemaps.length ? robots.sitemaps : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`]
  const sampleUrls: string[] = []
  for (const sm of sitemapCandidates.slice(0, 2)) {
    try {
      const res = await fetcher.get(sm)
      const $ = cheerio.load(res.body, { xml: true })
      const children = $('sitemap > loc').map((_, e) => $(e).text().trim()).get()
      const urls = $('url > loc').map((_, e) => $(e).text().trim()).get()
      console.log(`\n== ${sm}: HTTP ${res.status}, вкладених sitemap: ${children.length}, адрес: ${urls.length}`)
      children.slice(0, 15).forEach((c) => console.log(`   sitemap: ${c}`))
      if (children.length > 15) console.log(`   … ще ${children.length - 15}`)
      urls.slice(0, 8).forEach((u) => console.log(`   url: ${u}`))
      sampleUrls.push(...urls)

      // Відкриваємо один вкладений файл, у назві якого схоже на товари
      const productish = children.find((c) => /product|goods|tovar|item|catalog/i.test(c)) ?? children[0]
      if (productish) {
        const r2 = await fetcher.get(productish)
        const $2 = cheerio.load(r2.body, { xml: true })
        const urls2 = $2('url > loc').map((_, e) => $2(e).text().trim()).get()
        console.log(`   → ${productish}: HTTP ${r2.status}, адрес: ${urls2.length}`)
        urls2.slice(0, 10).forEach((u) => console.log(`     url: ${u}`))
        console.log('     перші сегменти шляху:', JSON.stringify(prefixHistogram(urls2).slice(0, 8)))
        sampleUrls.push(...urls2)
      }
    } catch (err) {
      console.log(`\n== ${sm}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // 2. Головна: які розділи є і як виглядають посилання на категорії
  const home = await fetcher.get(`${origin}/`)
  const $h = cheerio.load(home.body)
  const links = [...new Set($h('a[href]').map((_, a) => $h(a).attr('href') ?? '').get())]
    .map((h) => { try { return new URL(h, origin).toString() } catch { return '' } })
    .filter((h) => h.startsWith(origin))
  console.log(`\n== Головна: HTTP ${home.status}, внутрішніх посилань: ${links.length}`)
  console.log('   перші сегменти шляху:', JSON.stringify(prefixHistogram(links).slice(0, 12)))
  const homeLd = extractJsonLdProducts(home.body)
  console.log(`   блоків ld+json: ${homeLd.blocks}`)

  const categoryLinks: string[] = []
  for (const re of CATEGORY_HINTS) {
    const found = $h('a[href]')
      .filter((_, a) => re.test($h(a).attr('href') ?? '') || re.test($h(a).text()))
      .map((_, a) => `${short($h(a).text().trim(), 40)} → ${new URL($h(a).attr('href') ?? '', origin).toString()}`)
      .get()
    const uniq = [...new Set(found)].slice(0, 3)
    console.log(`   категорія ${re.source.split('|')[0]}: ${uniq.length ? '' : 'не знайдено'}`)
    uniq.forEach((l) => console.log(`     ${l}`))
    const first = uniq[0]?.split(' → ')[1]
    if (first) categoryLinks.push(first)
  }

  // 3. Одна сторінка категорії: як виглядають посилання на товари й пагінація
  const productLinks: string[] = []
  const catUrl = categoryLinks.find((u) => robots.isAllowed(new URL(u).pathname + new URL(u).search))
  if (catUrl) {
    const cat = await fetcher.get(catUrl)
    const $c = cheerio.load(cat.body)
    const catLinks = [...new Set($c('a[href]').map((_, a) => $c(a).attr('href') ?? '').get())]
      .map((h) => { try { return new URL(h, origin).toString() } catch { return '' } })
      .filter((h) => h.startsWith(origin))
    console.log(`\n== Категорія ${catUrl}: HTTP ${cat.status}, посилань: ${catLinks.length}, ld+json: ${extractJsonLdProducts(cat.body).blocks}`)
    console.log('   перші сегменти шляху:', JSON.stringify(prefixHistogram(catLinks, 1).slice(0, 10)))
    const pag = catLinks.filter((l) => /[?&]page=|\/page[-_/]?\d|PAGEN|[?&]p=\d/i.test(l)).slice(0, 5)
    console.log(`   пагінація: ${pag.length ? pag.join('  ') : 'не знайдено явних посилань'}`)
    // Найчастіший префікс з глибиною 1 серед довгих адрес, імовірно, товари
    const [topPrefix] = prefixHistogram(catLinks.filter((l) => new URL(l).pathname.length > 25), 1)
    console.log(`   найчастіший префікс довгих адрес: ${topPrefix ? `${topPrefix[0]} (${topPrefix[1]})` : '—'}`)
    if (topPrefix) productLinks.push(...catLinks.filter((l) => ('/' + new URL(l).pathname.split('/').filter(Boolean)[0]) === topPrefix[0].replace('/…', '')))
    productLinks.slice(0, 5).forEach((l) => console.log(`     ${l}`))
  }

  // 4. Кілька сторінок товарів: що дає розмітка
  const candidates = [...new Set([...productLinks, ...sampleUrls.filter((u) => /\.html|product|goods|tovar|\/p\//i.test(u))])]
    .filter((u) => !/\/ru\//.test(u))
    .slice(0, maxPages)
  console.log(`\n== Сторінки товарів (${candidates.length})`)
  for (const url of candidates) {
    try {
      const res = await fetcher.get(url)
      const ld = extractJsonLdProducts(res.body)
      const meta = extractMetaProduct(res.body)
      const p = ld.products[0]
      console.log(`\n-- ${url}\n   HTTP ${res.status}, ld+json блоків: ${ld.blocks} (зламаних ${ld.invalidBlocks}), товарів у розмітці: ${ld.products.length}`)
      if (p) {
        console.log(`   name: ${p.name}\n   brand: ${p.brand} | sku: ${p.sku} | mpn: ${p.mpn} | ean: ${p.ean}`)
        console.log(`   price: ${p.price} ${p.currency} | availability: ${p.availability} | seller: ${p.seller}`)
        console.log(`   rating: ${p.rating} (${p.reviewCount}) | image: ${p.imageUrl ? 'є' : 'немає'}`)
        console.log(`   ключі вузла: ${Object.keys(p.raw as object).join(', ')}`)
        const offers = (p.raw as Record<string, unknown>)['offers']
        console.log(`   offers: ${short(JSON.stringify(offers ?? null), 300)}`)
      }
      console.log(`   meta: price=${meta.price} ${meta.currency ?? ''} availability=${meta.availability} title=${short(meta.name ?? '', 60)}`)
      console.log(`   хлібні крихти: ${breadcrumbs(res.body).join(' › ') || 'немає в розмітці'}`)
      const hints = oldPriceHints(res.body)
      console.log(`   можлива закреслена ціна: ${hints.length ? '' : 'не знайдено'}`)
      hints.forEach((h) => console.log(`     ${h}`))
      const $p = cheerio.load(res.body)
      console.log(`   h1: ${short($p('h1').first().text().trim(), 100)}`)
    } catch (err) {
      console.log(`\n-- ${url}\n   ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
