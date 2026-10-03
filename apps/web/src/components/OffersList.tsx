import { formatPrice, formatRating, type OfferDto } from '@znyzhky/shared'
import { ExternalIcon, StarIcon } from './icons'

/** Пропозиції всіх магазинів: від найдешевшої. На телефоні кожна це окрема картка, на ширших екранах таблиця. */
export function OffersList({ offers }: { offers: OfferDto[] }) {
  const cols = 'md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto]'
  return (
    <div>
      <div className={`hidden gap-4 border-b border-line px-4 pb-2 text-xs font-semibold text-ink-3 md:grid ${cols}`} aria-hidden="true">
        <span>Магазин</span>
        <span>Ціна</span>
        <span>Закреслена ціна магазину</span>
        <span>Наявність</span>
        <span className="w-40" />
      </div>
      <ul className="flex flex-col">
        {offers.map((o) => (
          <li key={o.shop.slug} className={`grid grid-cols-2 items-center gap-x-4 gap-y-2 border-b border-line px-4 py-4 last:border-b-0 md:gap-y-0 ${cols}`}>
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{o.shop.name}</p>
              {o.shop.rating !== null && (
                <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-ink-3" title="Рейтинг магазину">
                  <StarIcon size={12} /> Рейтинг {formatRating(o.shop.rating)}
                </p>
              )}
            </div>

            <div className="min-w-0 text-right md:text-left">
              <p className={`tabular text-lg font-bold ${o.inStock ? 'text-ink' : 'text-ink-3'}`}>{formatPrice(o.price)}</p>
              {o.isBest && <span className="mt-0.5 inline-block rounded-full bg-accent-weak px-2 py-0.5 text-xs font-semibold text-accent">Найкраща ціна</span>}
            </div>

            <div className="tabular text-sm text-ink-3">
              {o.oldPrice !== null ? (
                <span title="Закреслена ціна, яку показує магазин. У розрахунку знижки ми її не враховуємо.">
                  <s>{formatPrice(o.oldPrice)}</s>
                </span>
              ) : (
                <span aria-label="Закресленої ціни немає">–</span>
              )}
            </div>

            <div className="text-right text-sm md:text-left">
              {o.inStock ? (
                <span className="inline-flex items-center gap-1.5 text-ink-2">
                  <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
                  В наявності
                </span>
              ) : (
                <span className="text-ink-3">Немає в наявності</span>
              )}
            </div>

            <div className="col-span-2 md:col-span-1">
              <a
                href={o.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={`inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold md:w-40 ${
                  o.inStock ? 'bg-ink text-canvas hover:opacity-90' : 'border border-line text-ink-2 hover:bg-surface-2'
                }`}
              >
                До магазину
                <ExternalIcon size={16} />
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
