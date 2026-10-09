import { COMPARE_SORTS, formatPercent, formatPrice, pluralUk, type CompareItemDto, type CompareQueryParams, type CompareSort, type FiltersResponse } from '@znyzhky/shared'
import { useCallback, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Media } from '../components/Media'
import { Pagination } from '../components/Pagination'
import { useCompare, useFilters } from '../lib/queries'

const LIMIT = 24
const SORTS = new Set<string>(COMPARE_SORTS.map((s) => s.value))

function parseSearch(sp: URLSearchParams): CompareQueryParams {
  const sort = sp.get('sort') ?? 'spread'
  const page = Number(sp.get('page') ?? '1')
  return {
    category: sp.get('category') || undefined,
    sort: (SORTS.has(sort) ? sort : 'spread') as CompareSort,
    paperOnly: sp.get('paper') === '1',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    limit: LIMIT,
  }
}

function toSearch(q: CompareQueryParams): URLSearchParams {
  const sp = new URLSearchParams()
  if (q.category) sp.set('category', q.category)
  if (q.sort !== 'spread') sp.set('sort', q.sort)
  if (q.paperOnly) sp.set('paper', '1')
  if (q.page > 1) sp.set('page', String(q.page))
  return sp
}

/** Категорії списком для випадного меню: батьківські й вкладені з відступом */
function categoryOptions(nodes: FiltersResponse['categories'], depth = 0): { slug: string; label: string }[] {
  return nodes.flatMap((n) => [{ slug: n.slug, label: `${depth > 0 ? '— ' : ''}${n.name}` }, ...categoryOptions(n.children, depth + 1)])
}

const products = (n: number) => `${n.toLocaleString('uk-UA').replace(/ /g, ' ')} ${pluralUk(n, 'товар', 'товари', 'товарів')}`

function CompareCard({ item }: { item: CompareItemDto }) {
  const same = item.spreadAmount === 0
  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex min-w-0 gap-4">
        <Media imageUrl={item.imageUrl} alt={item.name} categorySlug={item.category.slug} brand={item.brand} className="size-20 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-ink-3">
            {item.category.name} · {item.brand}
          </p>
          <h3 className="mt-0.5 line-clamp-2 text-[0.95rem] font-semibold leading-snug text-ink">
            <Link to={`/product/${item.id}`} className="hover:underline">
              {item.name}
            </Link>
          </h3>
          <p className="mt-1.5">
            {same ? (
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-ink-2">Однакова ціна скрізь</span>
            ) : (
              <span className="tabular rounded-full bg-accent-weak px-2.5 py-0.5 text-xs font-bold text-accent">
                Різниця {formatPrice(item.spreadAmount)} ({formatPercent(item.spreadPercent)})
              </span>
            )}
          </p>
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-line border-y border-line text-sm" aria-label="Ціни в магазинах">
        {item.prices.map((p, i) => (
          <li key={p.shop.slug} className="flex items-baseline justify-between gap-3 py-2">
            <span className={i === 0 && !same ? 'font-semibold text-ink' : 'text-ink-2'}>
              {p.shop.name}
              {i === 0 && !same && <span className="ml-2 text-xs font-semibold text-accent">найдешевше</span>}
            </span>
            <span className="tabular flex items-baseline gap-2 whitespace-nowrap">
              {p.oldPrice !== null && <s className="text-xs text-ink-3">{formatPrice(p.oldPrice)}</s>}
              <span className={i === 0 && !same ? 'font-bold text-ink' : 'font-semibold text-ink'}>{formatPrice(p.price)}</span>
            </span>
          </li>
        ))}
      </ul>

      {item.paper && (
        <p className="rounded-xl bg-bad-weak px-3.5 py-2.5 text-sm leading-snug text-ink">
          <span className="font-bold text-bad">Знижка на папері. </span>
          {item.paper.shop.name} показує «−{formatPercent(item.paper.claimedPercent)}, було {formatPrice(item.paper.oldPrice)}», а {item.paper.plainShop.name} продає за{' '}
          <span className="tabular">{formatPrice(item.paper.plainPrice)}</span> без жодної знижки.
        </p>
      )}
    </article>
  )
}

export function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = useMemo(() => parseSearch(searchParams), [searchParams])
  const compare = useCompare(q)
  const filters = useFilters()

  useEffect(() => {
    document.title = 'Порівняння цін: справжні знижки'
  }, [])

  const update = useCallback((patch: Partial<CompareQueryParams>) => setSearchParams(toSearch({ ...q, page: 1, ...patch })), [q, setSearchParams])
  const goToPage = useCallback(
    (page: number) => {
      setSearchParams(toSearch({ ...q, page }))
      window.scrollTo({ top: 0 })
    },
    [q, setSearchParams],
  )

  const data = compare.data
  const summary = data?.summary

  return (
    <>
      <section className="max-w-3xl">
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Порівняння цін</h1>
        <p className="mt-3 text-pretty text-lg text-ink-2">
          Той самий товар у різних магазинах сьогодні. Поки історії цін замало для висновків про справжні знижки, тут видно, де дешевше і де магазин показує знижку,
          якої немає в інших.
        </p>
        {summary && summary.products > 0 && (
          <dl className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
            <div className="min-w-0 rounded-xl bg-surface-2 px-3 py-2.5 sm:px-4 sm:py-3">
              <dt className="text-xs text-ink-3">Товарів у 2+ магазинах</dt>
              <dd className="tabular mt-0.5 text-lg font-bold text-ink">{summary.products.toLocaleString('uk-UA').replace(/\u00A0/g, ' ')}</dd>
            </div>
            <div className="min-w-0 rounded-xl bg-surface-2 px-3 py-2.5 sm:px-4 sm:py-3">
              <dt className="text-xs text-ink-3">Ціна однакова</dt>
              <dd className="tabular mt-0.5 text-lg font-bold text-ink">
                {summary.samePrice.toLocaleString('uk-UA').replace(/ /g, ' ')}{' '}
                <span className="hidden text-sm font-medium text-ink-3 sm:inline">({formatPercent((summary.samePrice / summary.products) * 100)})</span>
              </dd>
            </div>
            <div className="min-w-0 rounded-xl bg-surface-2 px-3 py-2.5 sm:px-4 sm:py-3">
              <dt className="text-xs text-ink-3">Знижок на папері</dt>
              <dd className="tabular mt-0.5 text-lg font-bold text-bad">{summary.paper.toLocaleString('uk-UA').replace(/ /g, ' ')}</dd>
            </div>
          </dl>
        )}
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <label htmlFor="compare-category" className="sr-only">
          Категорія
        </label>
        <select
          id="compare-category"
          value={q.category ?? ''}
          onChange={(e) => update({ category: e.target.value || undefined })}
          className="min-h-11 rounded-full border border-line bg-surface px-3 text-sm font-medium text-ink"
        >
          <option value="">Усі категорії</option>
          {categoryOptions(filters.data?.categories ?? []).map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>

        <label htmlFor="compare-sort" className="sr-only">
          Сортувати
        </label>
        <select
          id="compare-sort"
          value={q.sort}
          onChange={(e) => update({ sort: e.target.value as CompareSort })}
          className="min-h-11 rounded-full border border-line bg-surface px-3 text-sm font-medium text-ink"
        >
          {COMPARE_SORTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <label htmlFor="compare-paper" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink">
          <input id="compare-paper" type="checkbox" checked={q.paperOnly ?? false} onChange={(e) => update({ paperOnly: e.target.checked })} className="size-4 accent-[var(--accent)]" />
          Лише знижки на папері
        </label>

        <p className="text-sm text-ink-2 sm:ml-auto" aria-live="polite">
          {data ? <span className="font-semibold text-ink">{products(data.total)}</span> : 'Завантажуємо…'}
          {data && data.pages > 1 && <span className="text-ink-3"> · сторінка {data.page} з {data.pages}</span>}
        </p>
      </div>

      <div className="mt-5">
        {compare.isError && !data ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center">
            <p className="font-semibold">Не вдалося завантажити порівняння</p>
            <p className="mt-1 text-sm text-ink-2">Перевірте з’єднання та спробуйте ще раз.</p>
            <button type="button" onClick={() => compare.refetch()} className="mt-4 min-h-11 rounded-full bg-ink px-5 text-sm font-semibold text-canvas">
              Спробувати ще раз
            </button>
          </div>
        ) : compare.isPending ? (
          <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Завантажуємо порівняння">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton h-56 rounded-2xl" />
            ))}
          </div>
        ) : data && data.items.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center">
            <p className="font-semibold">Таких товарів немає</p>
            <p className="mt-1 text-sm text-ink-2">Виберіть іншу категорію або зніміть позначку «Лише знижки на папері».</p>
          </div>
        ) : (
          data && (
            <>
              <div className={`grid gap-4 lg:grid-cols-2 ${compare.isFetching && !compare.isPending ? 'is-refetching' : ''}`}>
                {data.items.map((item) => (
                  <CompareCard key={item.id} item={item} />
                ))}
              </div>
              <Pagination page={data.page} pages={data.pages} onChange={goToPage} />
            </>
          )
        )}
      </div>
    </>
  )
}
