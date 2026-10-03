import { formatPrice, type RejectedItemDto } from '@znyzhky/shared'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { ClaimCompare } from '../components/ClaimCompare'
import { useRejected } from '../lib/queries'

function RejectedCard({ item }: { item: RejectedItemDto }) {
  const main = item.reasons[0]
  return (
    <article className="relative flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 transition-shadow hover:shadow-md">
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-3">{item.category.name}</p>
        <h3 className="mt-0.5 text-[0.95rem] font-semibold leading-snug">
          <Link to={`/product/${item.id}`} className="after:absolute after:inset-0 after:content-['']">
            {item.name}
          </Link>
        </h3>
        <p className="mt-2 text-sm text-ink-2">
          Зараз <span className="tabular font-semibold text-ink">{formatPrice(item.bestPrice)}</span>
          {item.basePrice !== null && (
            <>
              , типова ціна <span className="tabular">{formatPrice(item.basePrice)}</span>
            </>
          )}
        </p>
      </div>

      {item.claimedPercent !== null ? <ClaimCompare claimed={item.claimedPercent} real={item.discountPercent} /> : <p className="text-sm font-medium text-ink-2">Магазин знижку не заявляє, але ціна нестабільна.</p>}

      {main && <p className="border-t border-line pt-4 text-sm leading-snug text-ink-2">{main.text}</p>}
    </article>
  )
}

export function RejectedPage() {
  const rejected = useRejected()
  useEffect(() => {
    document.title = 'Відсіяні знижки'
  }, [])

  return (
    <>
      <section className="max-w-3xl">
        <h1 className="text-balance text-[1.7rem] font-bold leading-tight tracking-tight sm:text-4xl">Знижки, які ми відсіяли</h1>
        <p className="mt-3 text-pretty text-ink-2 sm:text-lg">
          Магазини показують ці «акції», але порівняно з типовою ціною ринку вони не підтверджуються: ціну підняли перед зниженням, вона стрибає, або закреслена ціна
          нічим не підкріплена.
        </p>
      </section>

      <div className="mt-8">
        {rejected.isPending ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton h-56 rounded-2xl" />
            ))}
          </div>
        ) : rejected.isError ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center">
            <p className="font-semibold">Не вдалося завантажити список</p>
            <button type="button" onClick={() => rejected.refetch()} className="mt-4 min-h-11 rounded-full bg-ink px-5 text-sm font-semibold text-canvas">
              Спробувати ще раз
            </button>
          </div>
        ) : rejected.data.items.length === 0 ? (
          <p className="text-ink-2">Відсіяних знижок зараз немає.</p>
        ) : (
          <>
            <p className="mb-4 text-sm text-ink-2">
              Відсіяно: <span className="font-semibold text-ink">{rejected.data.total}</span>. Спершу ті, де магазин обіцяє найбільше.
            </p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rejected.data.items.map((item) => (
                <RejectedCard key={item.id} item={item} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
