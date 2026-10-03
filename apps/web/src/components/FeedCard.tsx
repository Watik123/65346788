import { formatPercent, formatPrice, formatShops, type FeedItemDto } from '@znyzhky/shared'
import { Link } from 'react-router'
import { Media } from './Media'
import { Rating } from './Rating'
import { Sparkline } from './Sparkline'

/** Картка справжньої знижки в стрічці. Уся картка це посилання на сторінку товару. */
export function FeedCard({ item }: { item: FeedItemDto }) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-shadow focus-within:shadow-md hover:shadow-md">
      <div className="relative">
        <Media imageUrl={item.imageUrl} alt={item.name} categorySlug={item.category.slug} brand={item.brand} className="aspect-[16/10] w-full" />
        <span className="absolute right-3 top-3 rounded-full bg-accent px-2.5 py-1 text-sm font-bold text-accent-ink tabular" aria-label={`Знижка ${formatPercent(item.discountPercent)}`}>
          −{formatPercent(item.discountPercent)}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-3">{item.category.name}</p>
          <h3 className="mt-0.5 line-clamp-2 min-h-[2.75rem] text-[0.95rem] font-semibold leading-snug text-ink">
            <Link to={`/product/${item.id}`} className="outline-offset-4 after:absolute after:inset-0 after:content-['']">
              {item.name}
            </Link>
          </h3>
        </div>

        <div>
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-2xl font-bold tracking-tight text-ink">{formatPrice(item.bestPrice)}</span>
            <span className="text-sm font-semibold text-accent">−{formatPrice(item.discountAmount)}</span>
          </p>
          <p className="mt-0.5 text-xs text-ink-3">
            типова ціна <span className="tabular">{formatPrice(item.basePrice)}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
          <Rating rating={item.rating} reviewCount={item.reviewCount} />
          <span className="text-ink-3">{formatShops(item.shopsCount)}</span>
        </div>

        <div className="mt-auto pt-1">
          <Sparkline values={item.sparkline} label="Найкраща ціна за 30 днів" />
          <div className="mt-1 flex justify-between text-xs text-ink-3">
            <span>30 днів</span>
            <span>найкраща: {item.bestShop.name}</span>
          </div>
        </div>
      </div>
    </article>
  )
}

export function FeedCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface" aria-hidden="true">
      <div className="skeleton aspect-[16/10] w-full" />
      <div className="flex flex-col gap-3 p-4">
        <div className="skeleton h-3 w-1/3 rounded" />
        <div className="skeleton h-10 w-full rounded" />
        <div className="skeleton h-8 w-1/2 rounded" />
        <div className="skeleton h-4 w-2/3 rounded" />
        <div className="skeleton h-9 w-full rounded" />
      </div>
    </div>
  )
}
