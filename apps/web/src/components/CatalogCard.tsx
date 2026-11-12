import { DEAL_STATUS_LABELS, formatPercent, formatPrice, formatShops, type CatalogItemDto } from '@znyzhky/shared'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { FavoriteButton } from './FavoriteButton'
import { ArrowDownIcon } from './icons'
import { Media } from './Media'

/** Товар у каталозі, пошуку й обраному: фото, назва, найкраща ціна, скільки магазинів, позначки */
export function CatalogCard({ item, note }: { item: CatalogItemDto; note?: ReactNode }) {
  const real = item.status === 'real'
  const change = item.dayChangePercent
  return (
    <article className="relative flex min-w-0 gap-4 rounded-2xl border border-line bg-surface p-4 transition-shadow focus-within:shadow-md hover:shadow-md">
      <Media imageUrl={item.imageUrl} alt={item.name} categorySlug={item.category.slug} brand={item.brand} className="size-24 shrink-0 rounded-xl" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-ink-3">{item.category.name}</p>
            <h3 className="mt-0.5 line-clamp-2 text-[0.95rem] font-semibold leading-snug text-ink">
              <Link to={`/product/${item.id}`} className="outline-offset-4 after:absolute after:inset-0 after:content-['']">
                {item.name}
              </Link>
            </h3>
          </div>
          <FavoriteButton id={item.id} price={item.bestPrice} className="-mr-1 -mt-1 shrink-0" />
        </div>
        <div className="mt-auto flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-2">
          {item.bestPrice !== null ? (
            <>
              <span className="tabular text-lg font-bold text-ink">{formatPrice(item.bestPrice)}</span>
              <span className="text-xs text-ink-3">{formatShops(item.shopsCount)}</span>
            </>
          ) : (
            <span className="text-sm font-medium text-ink-3">Зараз немає в наявності</span>
          )}
          {real ? (
            <span className="tabular rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-ink" title="Справжня знижка: на стільки ціна нижча за типову">
              −{formatPercent(item.discountPercent)}
            </span>
          ) : (
            item.status === 'fake' && <span className="rounded-full bg-bad-weak px-2 py-0.5 text-xs font-semibold text-bad">{DEAL_STATUS_LABELS.fake}</span>
          )}
          {change <= -1 && (
            <span className="tabular inline-flex items-center gap-0.5 rounded-full bg-accent-weak px-2 py-0.5 text-xs font-semibold text-accent">
              <ArrowDownIcon size={12} strokeWidth={2.5} />
              {formatPercent(-change)} за добу
            </span>
          )}
        </div>
        {note && <p className="mt-1.5 text-xs text-ink-3">{note}</p>}
      </div>
    </article>
  )
}
