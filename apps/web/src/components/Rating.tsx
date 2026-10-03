import { formatRating, formatReviews } from '@znyzhky/shared'
import { StarIcon } from './icons'

/** Оцінка з кількістю відгуків; без відгуків показує про це прямо. */
export function Rating({ rating, reviewCount }: { rating: number | null; reviewCount: number }) {
  if (rating === null || reviewCount <= 0) return <span className="text-ink-3">Немає відгуків</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <StarIcon className="text-ink-2" aria-label="Оцінка" />
      <span className="font-semibold text-ink">{formatRating(rating)}</span>
      <span className="text-ink-3">{formatReviews(reviewCount)}</span>
    </span>
  )
}
