import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ALLOW_ALL, parseRobots, type RobotsRules } from './robots'

export interface FetchResult {
  url: string
  status: number
  body: string
  fromCache: boolean
}

/** Усе, що потрібно парсеру від мережі; у тестах підставляється готовими сторінками */
export interface Fetcher {
  get(url: string): Promise<FetchResult>
}

export class FetchError extends Error {
  constructor(
    readonly kind: 'robots' | 'network' | 'http' | 'redirect' | 'too_large',
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

export interface PoliteFetcherOptions {
  shop: string
  /** Чесно називаємо себе: сайт має бачити, хто приходить, і мати змогу написати нам */
  userAgent: string
  /** Мінімальна пауза між запитами до одного сайту, мс */
  minDelayMs?: number
  /** До паузи додається випадкова частина 0..jitterMs, щоб не бити в такт */
  jitterMs?: number
  timeoutMs?: number
  /** Повторні спроби після помилки мережі, 429 і 5xx */
  retries?: number
  backoffBaseMs?: number
  maxBodyBytes?: number
  respectRobots?: boolean
  /** Папка кешу відповідей (200) і час їх життя */
  cacheDir?: string | undefined
  cacheTtlMs?: number
  /** Папка, де зберігаються сирі відповіді для налагодження: <rawDir>/<РРРР-ММ-ДД>/ */
  rawDir?: string | undefined
  // Для тестів
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  random?: () => number
}

const MAX_RETRY_AFTER_MS = 60_000

/**
 * Ввічливий завантажувач:
 *  - не заходить туди, куди забороняє robots.txt, і поважає Crawl-delay;
 *  - тримає паузу між запитами, повторює невдалі з наростаючою затримкою (поважає Retry-After);
 *  - кешує вдалі відповіді на диску, зберігає сирі відповіді для налагодження;
 *  - не йде за перенаправленням на інший домен і не читає завеликі відповіді.
 */
export class PoliteFetcher implements Fetcher {
  private readonly o: Required<Omit<PoliteFetcherOptions, 'cacheDir' | 'rawDir'>> & Pick<PoliteFetcherOptions, 'cacheDir' | 'rawDir'>
  private lastRequestAt = 0
  private robotsByOrigin = new Map<string, RobotsRules>()

  constructor(options: PoliteFetcherOptions) {
    this.o = {
      minDelayMs: 1500,
      jitterMs: 500,
      timeoutMs: 20_000,
      retries: 3,
      backoffBaseMs: 2000,
      maxBodyBytes: 5 * 1024 * 1024,
      respectRobots: true,
      cacheTtlMs: 12 * 3600_000,
      fetchImpl: fetch,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      now: () => Date.now(),
      random: Math.random,
      ...options,
    }
  }

  async get(url: string): Promise<FetchResult> {
    const target = new URL(url)

    if (this.o.respectRobots) {
      const rules = await this.rulesFor(target.origin)
      if (!rules.isAllowed(target.pathname + target.search)) {
        throw new FetchError('robots', `robots.txt забороняє збір цієї адреси: ${target.pathname}`)
      }
    }

    const cached = this.readCache(url)
    if (cached) return { url, status: 200, body: cached, fromCache: true }

    const res = await this.request(url, target.origin)
    if (res.status === 200) {
      this.writeCache(url, res.body)
      this.writeRaw(url, res.body)
    }
    return { url, status: res.status, body: res.body, fromCache: false }
  }

  // ——— robots.txt ———

  private async rulesFor(origin: string): Promise<RobotsRules> {
    const known = this.robotsByOrigin.get(origin)
    if (known) return known

    const res = await this.request(`${origin}/robots.txt`, origin, true)
    let rules: RobotsRules
    if (res.status === 200) rules = parseRobots(res.body, this.o.userAgent)
    else if (res.status >= 400 && res.status < 500) rules = ALLOW_ALL // файлу немає: обмежень немає
    else throw new FetchError('robots', `Не вдалося прочитати robots.txt (HTTP ${res.status}), збір зупинено`, res.status)

    this.robotsByOrigin.set(origin, rules)
    return rules
  }

  // ——— мережа ———

  private async pause(extraDelayMs: number): Promise<void> {
    const wait = this.lastRequestAt + Math.max(this.o.minDelayMs, extraDelayMs) + this.o.random() * this.o.jitterMs - this.o.now()
    if (this.lastRequestAt > 0 && wait > 0) await this.o.sleep(wait)
    this.lastRequestAt = this.o.now()
  }

  private crawlDelayMs(origin: string): number {
    return (this.robotsByOrigin.get(origin)?.crawlDelaySeconds ?? 0) * 1000
  }

  private async request(url: string, origin: string, isRobots = false): Promise<{ status: number; body: string }> {
    let attempt = 0
    for (;;) {
      await this.pause(this.crawlDelayMs(origin))
      let retryAfterMs: number | null = null
      try {
        const res = await this.o.fetchImpl(url, {
          headers: { 'User-Agent': this.o.userAgent, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5', 'Accept-Language': 'uk,en;q=0.5' },
          redirect: 'follow',
          signal: AbortSignal.timeout(this.o.timeoutMs),
        })

        if (res.url && new URL(res.url).host !== new URL(url).host) {
          throw new FetchError('redirect', `Перенаправлення на інший домен: ${new URL(res.url).host}`)
        }

        const retryable = res.status === 429 || res.status >= 500
        if (!retryable || attempt >= this.o.retries) {
          return { status: res.status, body: await this.readBody(res) }
        }
        const header = Number(res.headers.get('retry-after'))
        retryAfterMs = Number.isFinite(header) && header > 0 ? Math.min(header * 1000, MAX_RETRY_AFTER_MS) : null
      } catch (err) {
        if (err instanceof FetchError) throw err
        if (attempt >= this.o.retries) {
          throw new FetchError('network', `Мережева помилка${isRobots ? ' (robots.txt)' : ''}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      attempt++
      await this.o.sleep(retryAfterMs ?? this.o.backoffBaseMs * 2 ** (attempt - 1))
    }
  }

  private async readBody(res: Response): Promise<string> {
    const declared = Number(res.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > this.o.maxBodyBytes) throw new FetchError('too_large', `Відповідь завелика: ${declared} байт`)
    const text = await res.text()
    if (Buffer.byteLength(text) > this.o.maxBodyBytes) throw new FetchError('too_large', 'Відповідь завелика')
    return text
  }

  // ——— кеш і сирі відповіді ———

  private key(url: string): string {
    return createHash('sha1').update(url).digest('hex')
  }

  private readCache(url: string): string | null {
    if (!this.o.cacheDir) return null
    const file = path.join(this.o.cacheDir, `${this.key(url)}.json`)
    if (!existsSync(file)) return null
    try {
      const entry = JSON.parse(readFileSync(file, 'utf8')) as { url: string; fetchedAt: number; body: string }
      if (entry.url !== url || this.o.now() - entry.fetchedAt > this.o.cacheTtlMs) return null
      return entry.body
    } catch {
      return null
    }
  }

  private writeCache(url: string, body: string): void {
    if (!this.o.cacheDir) return
    mkdirSync(this.o.cacheDir, { recursive: true })
    writeFileSync(path.join(this.o.cacheDir, `${this.key(url)}.json`), JSON.stringify({ url, fetchedAt: this.o.now(), body }))
  }

  private writeRaw(url: string, body: string): void {
    if (!this.o.rawDir) return
    const day = new Date(this.o.now()).toISOString().slice(0, 10)
    const dir = path.join(this.o.rawDir, day)
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, `${this.key(url).slice(0, 16)}.html`), `<!-- ${url} -->\n${body}`)
  }
}
