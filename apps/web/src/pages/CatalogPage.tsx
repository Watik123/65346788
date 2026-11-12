import { CATALOG_SORTS, pluralUk, type CatalogQueryParams, type CatalogSort, type FiltersResponse } from '@znyzhky/shared'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { CatalogCard } from '../components/CatalogCard'
import { CategoryIcon, CloseIcon, SearchIcon } from '../components/icons'
import { Pagination } from '../components/Pagination'
import { useCatalog, useFilters } from '../lib/queries'

const LIMIT = 24
const SORTS = new Set<string>(CATALOG_SORTS.map((s) => s.value))

function parseSearch(sp: URLSearchParams): CatalogQueryParams {
  const sort = sp.get('sort') ?? 'popular'
  const page = Number(sp.get('page') ?? '1')
  return {
    category: sp.get('category') || undefined,
    q: sp.get('q')?.trim() || undefined,
    sort: (SORTS.has(sort) ? sort : 'popular') as CatalogSort,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    limit: LIMIT,
  }
}

function toSearch(q: CatalogQueryParams): URLSearchParams {
  const sp = new URLSearchParams()
  if (q.q) sp.set('q', q.q)
  if (q.category) sp.set('category', q.category)
  if (q.sort !== 'popular') sp.set('sort', q.sort)
  if (q.page > 1) sp.set('page', String(q.page))
  return sp
}

/** Категорії списком для випадного меню: батьківські й вкладені з відступом */
function categoryOptions(nodes: FiltersResponse['categories'], depth = 0): { slug: string; label: string }[] {
  return nodes.flatMap((n) => [{ slug: n.slug, label: `${depth > 0 ? '— ' : ''}${n.name}` }, ...categoryOptions(n.children, depth + 1)])
}

const products = (n: number) => `${n.toLocaleString('uk-UA').replace(/ /g, ' ')} ${pluralUk(n, 'товар', 'товари', 'товарів')}`

/** Плитки категорій: з них починають, коли ще нічого не шукали й не вибрали */
function CategoryTiles({ categories }: { categories: FiltersResponse['categories'] }) {
  return (
    <div className="flex flex-col gap-8">
      {categories.map((group) => (
        <section key={group.slug} aria-labelledby={`cat-${group.slug}`}>
          <h2 id={`cat-${group.slug}`} className="text-lg font-bold">
            <Link to={`/catalog?category=${group.slug}`} className="underline-offset-4 hover:underline">
              {group.name}
            </Link>
            <span className="tabular ml-2 text-sm font-medium text-ink-3">{group.productCount.toLocaleString('uk-UA').replace(/\u00A0/g, ' ')}</span>
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {group.children.map((c) => (
              <li key={c.slug}>
                <Link
                  to={`/catalog?category=${c.slug}`}
                  className="flex h-full min-h-16 items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 transition-colors hover:border-ink-3"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2">
                    <CategoryIcon slug={c.slug} size={22} strokeWidth={1.5} />
                  </span>
                  <span className="min-w-0">
                    <span className="block hyphens-auto text-sm font-semibold leading-tight text-ink [overflow-wrap:anywhere]">{c.name}</span>
                    <span className="tabular block text-xs text-ink-3">
                      {c.productCount.toLocaleString('uk-UA').replace(/\u00A0/g, ' ')}
                      {c.dealCount > 0 && <span className="font-semibold text-accent"> · {c.dealCount} {pluralUk(c.dealCount, 'знижка', 'знижки', 'знижок')}</span>}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Каталог: усі товари, які ми відстежуємо, з пошуком за назвою. Звідси знаходять товар, якого немає серед знижок. */
export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = useMemo(() => parseSearch(searchParams), [searchParams])
  // Нічого не шукали й не вибрали: показуємо категорії, а не всі тисячі товарів підряд
  const landing = !q.q && !q.category && q.sort === 'popular' && q.page === 1
  const catalog = useCatalog(q, !landing)
  const filters = useFilters()
  const [text, setText] = useState(q.q ?? '')

  useEffect(() => {
    document.title = q.q ? `${q.q}: пошук` : 'Каталог: справжні знижки'
  }, [q.q])
  useEffect(() => setText(q.q ?? ''), [q.q])

  const update = useCallback(
    (patch: Partial<CatalogQueryParams>, opts: { replace?: boolean } = {}) => setSearchParams(toSearch({ ...q, page: 1, ...patch }), opts),
    [q, setSearchParams],
  )
  // Пошук під час набору: за мить після останньої літери, без нового запису в історії на кожну літеру
  useEffect(() => {
    const next = text.trim() || undefined
    if (next === q.q) return
    const timer = setTimeout(() => update({ q: next }, { replace: true }), 350)
    return () => clearTimeout(timer)
  }, [text, q.q, update])
  const goToPage = useCallback(
    (page: number) => {
      setSearchParams(toSearch({ ...q, page }))
      window.scrollTo({ top: 0 })
    },
    [q, setSearchParams],
  )

  const data = catalog.data
  const total = filters.data?.productCount

  return (
    <>
      <section className="max-w-3xl">
        <h1 className="text-balance text-[1.7rem] font-bold leading-tight tracking-tight sm:text-4xl">Каталог</h1>
        <p className="mt-3 text-pretty text-ink-2 sm:text-lg">
          Усі товари, за цінами яких ми стежимо{total ? `: ${products(total)}` : ''}. На сторінці товару видно ціни в магазинах, історію ціни й чи справжня знижка.
        </p>
      </section>

      <form
        role="search"
        className="mt-6 flex max-w-2xl items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          update({ q: text.trim() || undefined })
        }}
      >
        <div className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-surface px-4 focus-within:border-ink-3">
          <SearchIcon size={18} className="shrink-0 text-ink-3" />
          <label htmlFor="catalog-search" className="sr-only">
            Пошук товару
          </label>
          <input
            id="catalog-search"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Назва або модель, наприклад: iPhone 17 256"
            className="w-full min-w-0 bg-transparent text-[0.95rem] text-ink outline-none placeholder:text-ink-3"
          />
          {text && (
            <button
              type="button"
              aria-label="Очистити пошук"
              onClick={() => {
                setText('')
                if (q.q) update({ q: undefined })
              }}
              className="grid size-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <CloseIcon size={16} />
            </button>
          )}
        </div>
        <button type="submit" className="h-12 shrink-0 rounded-full bg-ink px-5 text-sm font-semibold text-canvas">
          Знайти
        </button>
      </form>

      {landing && filters.data ? (
        <div className="mt-8">
          <CategoryTiles categories={filters.data.categories} />
          <p className="mt-8 text-sm text-ink-2">
            Або перегляньте{' '}
            <Link to="/catalog?sort=drop" className="font-medium text-accent underline-offset-4 hover:underline">
              товари, що подешевшали за останню добу
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label htmlFor="catalog-category" className="sr-only">
          Категорія
        </label>
        <select
          id="catalog-category"
          value={q.category ?? ''}
          onChange={(e) => update({ category: e.target.value || undefined })}
          className="min-h-11 max-w-full rounded-full border border-line bg-surface px-3 text-sm font-medium text-ink"
        >
          <option value="">Усі категорії</option>
          {categoryOptions(filters.data?.categories ?? []).map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>

        <label htmlFor="catalog-sort" className="sr-only">
          Сортувати
        </label>
        <select
          id="catalog-sort"
          value={q.sort}
          onChange={(e) => update({ sort: e.target.value as CatalogSort })}
          className="min-h-11 max-w-full rounded-full border border-line bg-surface px-3 text-sm font-medium text-ink"
        >
          {CATALOG_SORTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <p className="text-sm text-ink-2 sm:ml-auto" aria-live="polite">
          {data ? <span className="font-semibold text-ink">{products(data.total)}</span> : 'Завантажуємо…'}
          {data && data.pages > 1 && <span className="text-ink-3"> · сторінка {data.page} з {data.pages}</span>}
        </p>
      </div>

      <div className="mt-5">
        {catalog.isError && !data ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center">
            <p className="font-semibold">Не вдалося завантажити каталог</p>
            <p className="mt-1 text-sm text-ink-2">Перевірте з’єднання та спробуйте ще раз.</p>
            <button type="button" onClick={() => catalog.refetch()} className="mt-4 min-h-11 rounded-full bg-ink px-5 text-sm font-semibold text-canvas">
              Спробувати ще раз
            </button>
          </div>
        ) : catalog.isPending ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Завантажуємо каталог">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton h-32 rounded-2xl" />
            ))}
          </div>
        ) : data && data.items.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center">
            <p className="font-semibold">Нічого не знайшлося</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">
              Спробуйте коротший запит (лише модель, без кольору й обсягу пам’яті) або іншу категорію. Ми стежимо за технікою з дев’яти магазинів, тож якогось товару може
              просто не бути.
            </p>
          </div>
        ) : (
          data && (
            <>
              <div className={`grid gap-4 md:grid-cols-2 xl:grid-cols-3 ${catalog.isFetching && !catalog.isPending ? 'is-refetching' : ''}`}>
                {data.items.map((item) => (
                  <CatalogCard key={item.id} item={item} />
                ))}
              </div>
              <Pagination page={data.page} pages={data.pages} onChange={goToPage} />
            </>
          )
        )}
      </div>
        </>
      )}
    </>
  )
}
