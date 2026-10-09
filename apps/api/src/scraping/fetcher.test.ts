import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FetchError, PoliteFetcher, type PoliteFetcherOptions } from './fetcher'

const ORIGIN = 'https://shop.example'
type Reply = { status?: number; body?: string; headers?: Record<string, string>; url?: string } | Error

/** Підроблений мережевий шар: відповіді по черзі для кожної адреси, журнал запитів, власний годинник */
function setup(routes: Record<string, Reply[]>, opts: Partial<PoliteFetcherOptions> = {}) {
  const calls: { url: string; ua: string | null }[] = []
  const sleeps: number[] = []
  let clock = 1_000_000
  const queues = new Map(Object.entries(routes).map(([k, v]) => [k, [...v]]))

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, ua: new Headers(init?.headers).get('user-agent') })
    const q = queues.get(url)
    const reply = q && q.length > 1 ? (q.shift() as Reply) : q?.[0]
    if (!reply) return new Response('нема такої сторінки', { status: 404 })
    if (reply instanceof Error) throw reply
    const res = new Response(reply.body ?? '', { status: reply.status ?? 200, headers: reply.headers })
    if (reply.url) Object.defineProperty(res, 'url', { value: reply.url })
    return res
  }) as typeof fetch

  const fetcher = new PoliteFetcher({
    shop: 'test',
    userAgent: 'ZnyzhkyBot/0.1 (+contact)',
    minDelayMs: 1000,
    jitterMs: 0,
    backoffBaseMs: 2000,
    retries: 2,
    fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms)
      clock += ms
    },
    now: () => clock,
    random: () => 0,
    ...opts,
  })
  return { fetcher, calls, sleeps, advance: (ms: number) => (clock += ms) }
}

const pages = (calls: { url: string }[]) => calls.map((c) => c.url).filter((u) => !u.endsWith('/robots.txt'))
let tmp: string
beforeEach(() => void (tmp = mkdtempSync(path.join(os.tmpdir(), 'fetcher-test-'))))
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('PoliteFetcher: robots.txt', () => {
  it('не робить запит до сторінки, яку забороняє robots.txt', async () => {
    const { fetcher, calls } = setup({ [`${ORIGIN}/robots.txt`]: [{ body: 'User-agent: *\nDisallow: /basket' }], [`${ORIGIN}/basket`]: [{ body: 'кошик' }] })
    await expect(fetcher.get(`${ORIGIN}/basket`)).rejects.toMatchObject({ kind: 'robots' })
    expect(pages(calls)).toEqual([])
  })

  it('читає robots.txt один раз на сайт', async () => {
    const { fetcher, calls } = setup({ [`${ORIGIN}/robots.txt`]: [{ body: '' }], [`${ORIGIN}/a`]: [{ body: 'a' }], [`${ORIGIN}/b`]: [{ body: 'b' }] })
    await fetcher.get(`${ORIGIN}/a`)
    await fetcher.get(`${ORIGIN}/b`)
    expect(calls.filter((c) => c.url.endsWith('/robots.txt'))).toHaveLength(1)
  })

  it('якщо robots.txt немає (404), обмежень немає', async () => {
    const { fetcher } = setup({ [`${ORIGIN}/robots.txt`]: [{ status: 404 }], [`${ORIGIN}/a`]: [{ body: 'ok' }] })
    expect((await fetcher.get(`${ORIGIN}/a`)).body).toBe('ok')
  })

  it('якщо robots.txt закритий (403), збір не починається', async () => {
    const { fetcher, calls } = setup({ [`${ORIGIN}/robots.txt`]: [{ status: 403 }], [`${ORIGIN}/a`]: [{ body: 'ok' }] })
    await expect(fetcher.get(`${ORIGIN}/a`)).rejects.toMatchObject({ kind: 'robots', status: 403 })
    expect(pages(calls)).toEqual([])
  })

  it('якщо robots.txt віддає помилку сервера, збір не починається', async () => {
    const { fetcher, calls } = setup({ [`${ORIGIN}/robots.txt`]: [{ status: 503 }], [`${ORIGIN}/a`]: [{ body: 'ok' }] })
    await expect(fetcher.get(`${ORIGIN}/a`)).rejects.toMatchObject({ kind: 'robots' })
    expect(pages(calls)).toEqual([])
  })

  it('поважає Crawl-delay, якщо він більший за власну паузу', async () => {
    const { fetcher, sleeps } = setup({ [`${ORIGIN}/robots.txt`]: [{ body: 'User-agent: *\nCrawl-delay: 5' }], [`${ORIGIN}/a`]: [{ body: 'a' }], [`${ORIGIN}/b`]: [{ body: 'b' }] })
    await fetcher.get(`${ORIGIN}/a`)
    await fetcher.get(`${ORIGIN}/b`)
    expect(Math.max(...sleeps)).toBeGreaterThanOrEqual(5000)
  })

  it('можна вимкнути перевірку robots.txt лише явно', async () => {
    const { fetcher, calls } = setup({ [`${ORIGIN}/basket`]: [{ body: 'x' }] }, { respectRobots: false })
    await fetcher.get(`${ORIGIN}/basket`)
    expect(calls.map((c) => c.url)).toEqual([`${ORIGIN}/basket`])
  })
})

describe('PoliteFetcher: ввічливість і повтори', () => {
  const robots = { [`${ORIGIN}/robots.txt`]: [{ body: '' }] }

  it('тримає паузу між запитами і представляється чесно', async () => {
    const { fetcher, calls, sleeps } = setup({ ...robots, [`${ORIGIN}/a`]: [{ body: 'a' }], [`${ORIGIN}/b`]: [{ body: 'b' }], [`${ORIGIN}/c`]: [{ body: 'c' }] })
    for (const p of ['a', 'b', 'c']) await fetcher.get(`${ORIGIN}/${p}`)
    expect(sleeps.length).toBeGreaterThanOrEqual(3)
    expect(sleeps.every((s) => s >= 1000)).toBe(true)
    expect(calls.every((c) => c.ua === 'ZnyzhkyBot/0.1 (+contact)')).toBe(true)
  })

  it('кирилиця в підписі робота не ламає запит: кодується в ASCII', async () => {
    const { fetcher, calls } = setup({ ...robots, [`${ORIGIN}/a`]: [{ body: 'a' }] }, { userAgent: 'ZnyzhkyBot/0.1 (+пошта@приклад.укр)' })
    await fetcher.get(`${ORIGIN}/a`)
    expect(calls[0]?.ua).toMatch(/^[\x20-\x7E]+$/)
    expect(calls[0]?.ua).toContain('ZnyzhkyBot/0.1 (+%D0%BF')
  })

  it('повторює після 503 з наростаючою затримкою і зрештою отримує сторінку', async () => {
    const { fetcher, calls, sleeps } = setup({ ...robots, [`${ORIGIN}/a`]: [{ status: 503 }, { status: 503 }, { body: 'нарешті' }] })
    const res = await fetcher.get(`${ORIGIN}/a`)
    expect(res.body).toBe('нарешті')
    expect(pages(calls)).toHaveLength(3)
    expect(sleeps).toContain(2000)
    expect(sleeps).toContain(4000)
  })

  it('поважає Retry-After при 429 (з обмеженням згори)', async () => {
    const { fetcher, sleeps } = setup({ ...robots, [`${ORIGIN}/a`]: [{ status: 429, headers: { 'retry-after': '7' } }, { body: 'ok' }], [`${ORIGIN}/b`]: [{ status: 429, headers: { 'retry-after': '99999' } }, { body: 'ok' }] })
    await fetcher.get(`${ORIGIN}/a`)
    expect(sleeps).toContain(7000)
    await fetcher.get(`${ORIGIN}/b`)
    expect(Math.max(...sleeps)).toBeLessThanOrEqual(60_000)
  })

  it('після вичерпання спроб віддає останню відповідь з помилкою', async () => {
    const { fetcher, calls } = setup({ ...robots, [`${ORIGIN}/a`]: [{ status: 500 }] })
    expect((await fetcher.get(`${ORIGIN}/a`)).status).toBe(500)
    expect(pages(calls)).toHaveLength(3) // перша спроба + 2 повтори
  })

  it('404 не повторює', async () => {
    const { fetcher, calls } = setup({ ...robots, [`${ORIGIN}/gone`]: [{ status: 404 }] })
    expect((await fetcher.get(`${ORIGIN}/gone`)).status).toBe(404)
    expect(pages(calls)).toHaveLength(1)
  })

  it('мережеву помилку повторює, а потім повідомляє зрозуміло', async () => {
    const { fetcher, calls } = setup({ ...robots, [`${ORIGIN}/a`]: [new Error('ECONNRESET')] })
    await expect(fetcher.get(`${ORIGIN}/a`)).rejects.toMatchObject({ kind: 'network' })
    expect(pages(calls)).toHaveLength(3)
  })

  it('не йде за перенаправленням на інший домен', async () => {
    const { fetcher } = setup({ ...robots, [`${ORIGIN}/a`]: [{ body: 'x', url: 'https://evil.example/a' }] })
    await expect(fetcher.get(`${ORIGIN}/a`)).rejects.toBeInstanceOf(FetchError)
  })

  it('відмовляється від завеликих відповідей', async () => {
    const { fetcher } = setup({ ...robots, [`${ORIGIN}/big`]: [{ body: 'x'.repeat(200), headers: { 'content-length': '200' } }] }, { maxBodyBytes: 100 })
    await expect(fetcher.get(`${ORIGIN}/big`)).rejects.toMatchObject({ kind: 'too_large' })
  })
})

describe('PoliteFetcher: кеш і сирі відповіді', () => {
  const robots = { [`${ORIGIN}/robots.txt`]: [{ body: '' }] }

  it('друге звернення береться з кешу без мережі, доки кеш свіжий', async () => {
    const { fetcher, calls, advance } = setup({ ...robots, [`${ORIGIN}/a`]: [{ body: 'v1' }, { body: 'v2' }] }, { cacheDir: path.join(tmp, 'cache'), cacheTtlMs: 60_000 })
    const first = await fetcher.get(`${ORIGIN}/a`)
    const second = await fetcher.get(`${ORIGIN}/a`)
    expect([first.fromCache, second.fromCache, second.body]).toEqual([false, true, 'v1'])
    expect(pages(calls)).toHaveLength(1)

    advance(61_000)
    const third = await fetcher.get(`${ORIGIN}/a`)
    expect([third.fromCache, third.body]).toEqual([false, 'v2'])
  })

  it('помилкові відповіді в кеш не потрапляють', async () => {
    const { fetcher, calls } = setup({ ...robots, [`${ORIGIN}/a`]: [{ status: 404 }] }, { cacheDir: path.join(tmp, 'cache') })
    await fetcher.get(`${ORIGIN}/a`)
    await fetcher.get(`${ORIGIN}/a`)
    expect(pages(calls)).toHaveLength(2)
  })

  it('зберігає сиру відповідь за датою, з адресою в першому рядку', async () => {
    const { fetcher } = setup({ ...robots, [`${ORIGIN}/a`]: [{ body: '<html>сторінка</html>' }] }, { rawDir: path.join(tmp, 'raw') })
    await fetcher.get(`${ORIGIN}/a`)
    const [day] = readdirSync(path.join(tmp, 'raw'))
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const file = path.join(tmp, 'raw', day as string, readdirSync(path.join(tmp, 'raw', day as string))[0] as string)
    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file, 'utf8')).toBe(`<!-- ${ORIGIN}/a -->\n<html>сторінка</html>`)
  })
})
