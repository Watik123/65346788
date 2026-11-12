import { formatDay, formatNumber, formatPrice, pluralUk, SORT_OPTIONS, type FiltersResponse, type SortKey } from '@znyzhky/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { FeedCard, FeedCardSkeleton } from '../components/FeedCard'
import { FilterPanel } from '../components/FilterPanel'
import { CloseIcon, FilterIcon } from '../components/icons'
import { Sheet } from '../components/Sheet'
import { activeFilterCount, DEFAULT_FILTERS, PAGE_SIZE, parseFeedSearch, toSearchParams, type FeedFilters } from '../lib/feed-params'
import { useFeed, useFilters } from '../lib/queries'

function flatCategoryName(nodes: FiltersResponse['categories'], slug: string): string | undefined {
  for (const n of nodes) {
    if (n.slug === slug) return n.name
    const inner = flatCategoryName(n.children, slug)
    if (inner) return inner
  }
  return undefined
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button type="button" onClick={onRemove} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-3 pr-2 text-sm text-ink hover:bg-line" aria-label={`Прибрати фільтр: ${label}`}>
      {label}
      <CloseIcon size={14} />
    </button>
  )
}

const plural = (n: number) => `${n} ${pluralUk(n, 'знижка', 'знижки', 'знижок')}`

export function FeedPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => parseFeedSearch(searchParams), [searchParams])
  const [sheetOpen, setSheetOpen] = useState(false)

  const feed = useFeed(filters)
  const filterData = useFilters()
  const count = activeFilterCount(filters)

  useEffect(() => {
    document.title = 'Справжні знижки'
  }, [])

  const update = useCallback(
    (patch: Partial<FeedFilters>) => setSearchParams(toSearchParams({ ...filters, page: 1, ...patch })),
    [filters, setSearchParams],
  )
  const reset = useCallback(() => setSearchParams(toSearchParams({ ...DEFAULT_FILTERS, sort: filters.sort })), [filters.sort, setSearchParams])
  // Перша порція каже, скільки знижок усього; картки — з усіх довантажених порцій
  const data = feed.data?.pages[0]
  const items = useMemo(() => feed.data?.pages.flatMap((p) => p.items) ?? [], [feed.data])
  const isRefetching = feed.isFetching && !feed.isPending && !feed.isFetchingNextPage
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed

  // Довантаження під час гортання: щойно кінець стрічки наближається до екрана
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage()
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length])

  const chips: { key: string; label: string; remove: () => void }[] = []
  if (filters.category) {
    chips.push({ key: 'cat', label: (filterData.data && flatCategoryName(filterData.data.categories, filters.category)) ?? filters.category, remove: () => update({ category: undefined }) })
  }
  for (const slug of filters.shops) {
    const name = filterData.data?.shops.find((s) => s.slug === slug)?.name ?? slug
    chips.push({ key: `shop-${slug}`, label: name, remove: () => update({ shops: filters.shops.filter((s) => s !== slug) }) })
  }
  if (filters.minDiscount) chips.push({ key: 'disc', label: `знижка від ${filters.minDiscount}%`, remove: () => update({ minDiscount: undefined }) })
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    const from = filters.minPrice !== undefined ? `від ${formatPrice(filters.minPrice)}` : ''
    const to = filters.maxPrice !== undefined ? `до ${formatPrice(filters.maxPrice)}` : ''
    chips.push({ key: 'price', label: [from, to].filter(Boolean).join(' '), remove: () => update({ minPrice: undefined, maxPrice: undefined }) })
  }
  if (filters.minRating) chips.push({ key: 'rate', label: `оцінка від ${String(filters.minRating).replace('.', ',')}`, remove: () => update({ minRating: undefined }) })

  return (
    <>
      <section className="max-w-3xl">
        <h1 className="text-balance text-[1.7rem] font-bold leading-tight tracking-tight sm:text-4xl">Товари, які реально подешевшали</h1>
        <p className="mt-3 text-pretty text-ink-2 sm:text-lg">
          Порівнюємо ціну не із закресленою ціною магазину, а з типовою ціною ринку за 60 днів. Накручені «акції» відсіюємо.
        </p>
        {filterData.data && filterData.data.productCount > 0 && (
          <p className="mt-3 text-sm text-ink-3">
            Стежимо за цінами на{' '}
            <Link to="/catalog" className="font-medium text-ink-2 underline-offset-4 hover:underline">
              {formatNumber(filterData.data.productCount)} {pluralUk(filterData.data.productCount, 'товар', 'товари', 'товарів')}
            </Link>{' '}
            у {filterData.data.shops.length} магазинах{filterData.data.dataDay ? ` · оновлено ${formatDay(filterData.data.dataDay)}` : ''}
          </p>
        )}
        <details className="group mt-3 text-sm text-ink-2">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium text-accent underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
            Як ми перевіряємо знижки
          </summary>
          <ul className="mt-3 flex max-w-2xl list-disc flex-col gap-1.5 pl-5">
            <li>Беремо найкращу ціну ринку за кожну добу й рахуємо типову ціну за 60 днів.</li>
            <li>Знижка справжня, якщо ціна нижча за типову щонайменше на 5% і тримається біля мінімуму.</li>
            <li>Відсіюємо ціни, які підняли перед «акцією», ціни, що стрибають вгору-вниз, і закреслені ціни, яких ринок не підтверджує.</li>
            <li>Товарам, за якими менше двох тижнів даних, висновків не робимо.</li>
            <li>Рахуємо лише ціни магазинів, які товар зараз продають. Якщо найнижчу ціну дає магазин, де товар щойно з’явився, чекаємо три дні.</li>
          </ul>
        </details>
      </section>

      <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <aside className="hidden w-64 shrink-0 lg:sticky lg:top-24 lg:block" aria-label="Фільтри">
          <FilterPanel filters={filters} data={filterData.data} onChange={update} onReset={reset} activeCount={count} />
        </aside>

        <section className="min-w-0 flex-1" aria-label="Стрічка знижок">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-semibold lg:hidden"
            >
              <FilterIcon size={18} />
              Фільтри{count > 0 && <span className="grid size-5 place-items-center rounded-full bg-accent text-xs text-accent-ink">{count}</span>}
            </button>

            <p className="text-sm text-ink-2" aria-live="polite">
              {data ? <span className="font-semibold text-ink">{plural(data.total)}</span> : 'Завантажуємо…'}
            </p>

            <div className="ml-auto flex items-center gap-2">
              <label htmlFor="sort" className="text-sm text-ink-3">
                Сортувати
              </label>
              <select
                id="sort"
                value={filters.sort}
                onChange={(e) => update({ sort: e.target.value as SortKey, order: undefined })}
                className="min-h-11 rounded-full border border-line bg-surface px-3 text-sm font-medium text-ink"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <ActiveChip key={c.key} label={c.label} onRemove={c.remove} />
              ))}
              <button type="button" onClick={reset} className="px-1 text-sm font-medium text-accent underline-offset-4 hover:underline">
                Скинути все
              </button>
            </div>
          )}

          <div className="mt-5">
            {feed.isError && !data ? (
              <div className="rounded-2xl border border-line bg-surface p-8 text-center">
                <p className="font-semibold">Не вдалося завантажити стрічку</p>
                <p className="mt-1 text-sm text-ink-2">Перевірте з’єднання та спробуйте ще раз.</p>
                <button type="button" onClick={() => feed.refetch()} className="mt-4 min-h-11 rounded-full bg-ink px-5 text-sm font-semibold text-canvas">
                  Спробувати ще раз
                </button>
              </div>
            ) : feed.isPending ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <FeedCardSkeleton key={i} />
                ))}
              </div>
            ) : data && items.length === 0 && count === 0 ? (
              // Фільтрів немає, а знижок нуль: збір лише почався, історії цін ще замало для висновків
              <div className="rounded-2xl border border-line bg-surface p-8 text-center">
                <p className="font-semibold">Перевірених знижок поки немає</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">
                  Щоб відрізнити справжню знижку від накрученої, потрібна історія цін щонайменше за 14 днів. Ціни збираємо щодня, тож знижки з’являться тут, щойно
                  даних стане достатньо.
                </p>
                <Link to="/compare" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-canvas">
                  Тим часом: порівняння цін у магазинах
                </Link>
              </div>
            ) : data && items.length === 0 ? (
              <div className="rounded-2xl border border-line bg-surface p-8 text-center">
                <p className="font-semibold">За цими фільтрами нічого не знайшлося</p>
                <p className="mt-1 text-sm text-ink-2">Спробуйте послабити умови: знизити мінімальну знижку або вибрати іншу категорію.</p>
                <button type="button" onClick={reset} className="mt-4 min-h-11 rounded-full bg-ink px-5 text-sm font-semibold text-canvas">
                  Скинути фільтри
                </button>
              </div>
            ) : (
              data && (
                <>
                  <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${isRefetching ? 'is-refetching' : ''}`}>
                    {items.map((item) => (
                      <FeedCard key={item.id} item={item} />
                    ))}
                    {isFetchingNextPage && Array.from({ length: 3 }, (_, i) => <FeedCardSkeleton key={`more-${i}`} />)}
                  </div>
                  <div ref={sentinel} aria-hidden="true" />
                  {hasNextPage ? (
                    // Кнопка лишається для клавіатури й на випадок, якщо браузер не довантажив сам
                    <div className="mt-6 text-center">
                      <button
                        type="button"
                        onClick={() => void fetchNextPage()}
                        disabled={isFetchingNextPage}
                        className="min-h-11 rounded-full border border-line bg-surface px-5 text-sm font-semibold text-ink hover:border-ink-3 disabled:opacity-60"
                      >
                        {isFetchingNextPage ? 'Завантажуємо…' : `Показати ще (лишилось ${data.total - items.length})`}
                      </button>
                    </div>
                  ) : (
                    items.length > PAGE_SIZE && <p className="mt-8 text-center text-sm text-ink-3">Це всі знижки на сьогодні.</p>
                  )}
                </>
              )
            )}
          </div>
        </section>
      </div>

      <Sheet
        open={sheetOpen}
        title="Фільтри"
        onClose={() => setSheetOpen(false)}
        footer={
          <button type="button" onClick={() => setSheetOpen(false)} className="min-h-12 w-full rounded-full bg-ink text-sm font-semibold text-canvas">
            {data ? `Показати: ${plural(data.total)}` : 'Показати'}
          </button>
        }
      >
        <FilterPanel filters={filters} data={filterData.data} onChange={update} onReset={reset} activeCount={count} hideTitle />
      </Sheet>
    </>
  )
}
