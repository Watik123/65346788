import { formatPercent, formatPrice, formatRating, formatReviews, type DealDto, type ProductDetailResponse } from '@znyzhky/shared'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeftIcon } from '../components/icons'
import { DealVerdict } from '../components/DealVerdict'
import { Media } from '../components/Media'
import { OffersList } from '../components/OffersList'
import { PriceHistoryChart } from '../components/PriceHistoryChart'
import { Rating } from '../components/Rating'
import { ApiRequestError } from '../api/client'
import { useFilters, useProduct } from '../lib/queries'

function PriceBlock({ deal }: { deal: DealDto | null }) {
  if (!deal) return <p className="text-lg font-semibold text-ink-2">Зараз немає в наявності</p>
  const real = deal.status === 'real'
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-4xl font-bold tracking-tight text-ink sm:text-[2.75rem]">{formatPrice(deal.bestPrice)}</span>
        {real && <span className="tabular rounded-full bg-accent px-3 py-1 text-base font-bold text-accent-ink">−{formatPercent(deal.discountPercent)}</span>}
      </div>
      <p className="mt-1.5 text-sm text-ink-2">
        {real && <span className="font-semibold text-accent">Економія {formatPrice(deal.discountAmount)}. </span>}
        {deal.basePrice !== null && (
          <>
            Типова ціна ринку за 60 днів: <span className="tabular">{formatPrice(deal.basePrice)}</span>.{' '}
          </>
        )}
        Найкраща пропозиція: {deal.bestShop.name}.
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 px-4 py-3">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="tabular mt-0.5 text-lg font-bold text-ink">{value}</dd>
    </div>
  )
}

function ProductBody({ product, shopOrder }: { product: ProductDetailResponse; shopOrder: string[] }) {
  const { deal } = product
  useEffect(() => {
    document.title = `${product.name}: справжні знижки`
  }, [product.name])

  return (
    <>
      <nav aria-label="Навігація" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-3">
        <Link to="/" className="inline-flex items-center gap-1.5 font-medium text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={16} /> До стрічки
        </Link>
        <span aria-hidden="true">/</span>
        {product.category.parent && (
          <>
            <span>{product.category.parent.name}</span>
            <span aria-hidden="true">/</span>
          </>
        )}
        <Link to={`/?category=${product.category.slug}`} className="hover:text-ink">
          {product.category.name}
        </Link>
      </nav>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-10">
        <Media imageUrl={product.imageUrl} alt={product.name} categorySlug={product.category.slug} brand={product.brand} className="aspect-[4/3] w-full rounded-2xl border border-line lg:sticky lg:top-24 lg:self-start" />

        <div className="flex min-w-0 flex-col gap-6">
          <div>
            <p className="text-sm font-semibold text-ink-3">{product.brand}</p>
            <h1 className="mt-1 text-pretty text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{product.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <Rating rating={product.rating} reviewCount={product.reviewCount} />
              {product.modelCode && <span className="text-ink-3">Модель: {product.modelCode}</span>}
            </div>
          </div>

          <PriceBlock deal={deal} />
          {deal && <DealVerdict deal={deal} />}
        </div>
      </div>

      <section className="mt-10 rounded-2xl border border-line bg-surface p-4 sm:p-6" aria-labelledby="history-title">
        <h2 id="history-title" className="text-xl font-bold">
          Історія ціни
        </h2>
        <p className="mt-1 text-sm text-ink-2">Найкраща ціна ринку по днях, серед магазинів, де товар є в наявності.</p>

        {deal && (
          <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Зараз" value={formatPrice(deal.bestPrice)} />
            <Stat label="Мінімум за 30 днів" value={deal.min30 !== null ? formatPrice(deal.min30) : '–'} />
            <Stat label="Мінімум за 60 днів" value={deal.min60 !== null ? formatPrice(deal.min60) : '–'} />
            <Stat label="Типова ціна" value={deal.basePrice !== null ? formatPrice(deal.basePrice) : '–'} />
          </dl>
        )}

        <div className="mt-6">
          <PriceHistoryChart product={product} shopOrder={shopOrder} />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-surface py-4 sm:py-6" aria-labelledby="offers-title">
        <h2 id="offers-title" className="px-4 text-xl font-bold sm:px-6">
          Пропозиції магазинів
        </h2>
        <p className="mt-1 px-4 text-sm text-ink-2 sm:px-6">
          {product.offers.length > 0 ? `${formatReviews(product.reviewCount)}${product.rating !== null ? `, середня оцінка ${formatRating(product.rating)}` : ''}. ` : ''}
          Ціни й наявність оновлюються щодня.
        </p>
        <div className="mt-4 sm:px-2">
          <OffersList offers={product.offers} />
        </div>
      </section>
    </>
  )
}

export function ProductPage() {
  const { id } = useParams()
  const productId = Number(id)
  const product = useProduct(productId)
  const filters = useFilters()
  const shopOrder = filters.data?.shops.map((s) => s.slug) ?? []

  if (product.isPending) {
    return (
      <div aria-busy="true" aria-label="Завантажуємо товар">
        <div className="skeleton h-5 w-48 rounded" />
        <div className="mt-5 grid gap-6 lg:grid-cols-[5fr_6fr]">
          <div className="skeleton aspect-[4/3] w-full rounded-2xl" />
          <div className="flex flex-col gap-4">
            <div className="skeleton h-8 w-4/5 rounded" />
            <div className="skeleton h-12 w-1/2 rounded" />
            <div className="skeleton h-48 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  if (product.isError) {
    const notFound = product.error instanceof ApiRequestError && product.error.status === 404
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-bold">{notFound ? 'Такого товару немає' : 'Не вдалося завантажити товар'}</h1>
        <p className="mt-2 text-ink-2">{notFound ? 'Можливо, посилання застаріло.' : 'Перевірте з’єднання та спробуйте ще раз.'}</p>
        <Link to="/" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-canvas">
          До стрічки знижок
        </Link>
      </div>
    )
  }

  return <ProductBody product={product.data} shopOrder={shopOrder} />
}
