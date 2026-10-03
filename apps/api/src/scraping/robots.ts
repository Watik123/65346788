/**
 * Розбір robots.txt за правилами Google/RFC 9309:
 *  - береться група з найточнішим збігом User-agent, інакше група `*`;
 *  - з усіх правил Allow/Disallow виграє найдовше збіг за шляхом; при рівності Allow;
 *  - у шляхах діють `*` і `$`.
 */
export interface RobotsRules {
  isAllowed(pathWithQuery: string): boolean
  /** Пауза між запитами в секундах, якщо сайт її просить */
  crawlDelaySeconds: number | null
  sitemaps: string[]
}

interface Rule {
  allow: boolean
  pattern: string
}

interface Group {
  agents: string[]
  rules: Rule[]
  crawlDelay: number | null
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$')
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${body}${anchored ? '$' : ''}`)
}

function parseGroups(text: string): { groups: Group[]; sitemaps: string[] } {
  const groups: Group[] = []
  const sitemaps: string[] = []
  let current: Group | null = null
  let lastWasAgent = false

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const field = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()

    if (field === 'sitemap') {
      if (value) sitemaps.push(value)
      continue
    }
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelay: null }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (!current) continue
    if (field === 'allow' || field === 'disallow') {
      // Порожній Disallow означає «дозволено все»
      if (value !== '') current.rules.push({ allow: field === 'allow', pattern: value })
    } else if (field === 'crawl-delay') {
      const n = Number(value)
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n
    }
  }
  return { groups, sitemaps }
}

/** userAgent: повний рядок або лише назва робота (напр. "ZnyzhkyBot/0.1" чи "ZnyzhkyBot") */
export function parseRobots(text: string, userAgent: string): RobotsRules {
  const { groups, sitemaps } = parseGroups(text)
  const token = userAgent.split(/[\s/]/)[0]?.toLowerCase() ?? ''

  let best: Group | undefined
  let bestLen = -1
  for (const g of groups) {
    for (const agent of g.agents) {
      if (agent === '*') continue
      if (token.includes(agent) && agent.length > bestLen) {
        best = g
        bestLen = agent.length
      }
    }
  }
  best ??= groups.find((g) => g.agents.includes('*'))

  const rules = (best?.rules ?? []).map((r) => ({ ...r, re: patternToRegExp(r.pattern) }))
  return {
    crawlDelaySeconds: best?.crawlDelay ?? null,
    sitemaps,
    isAllowed(pathWithQuery: string): boolean {
      let winner: { allow: boolean; len: number } | null = null
      for (const r of rules) {
        if (!r.re.test(pathWithQuery)) continue
        const len = r.pattern.length
        if (!winner || len > winner.len || (len === winner.len && r.allow)) winner = { allow: r.allow, len }
      }
      return winner ? winner.allow : true
    },
  }
}

export const ALLOW_ALL: RobotsRules = { isAllowed: () => true, crawlDelaySeconds: null, sitemaps: [] }
