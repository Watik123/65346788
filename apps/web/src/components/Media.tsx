import { useState } from 'react'
import { CategoryIcon } from './icons'

interface Props {
  imageUrl: string | null
  alt: string
  categorySlug: string
  brand: string
  className?: string
}

/**
 * Фото товару. Немає фото або воно не завантажилось (магазин прибрав його, мережа) —
 * спокійна заглушка зі значком категорії замість битої картинки.
 */
export function Media({ imageUrl, alt, categorySlug, brand, className = '' }: Props) {
  const [failed, setFailed] = useState<string | null>(null)
  if (imageUrl && failed !== imageUrl) {
    return (
      <div className={`overflow-hidden bg-surface-2 ${className}`}>
        <img src={imageUrl} alt={alt} loading="lazy" className="size-full object-contain" onError={() => setFailed(imageUrl)} />
      </div>
    )
  }
  return (
    <div className={`relative flex items-center justify-center bg-surface-2 text-ink-3 ${className}`} role="img" aria-label={`${brand}: фото відсутнє`}>
      <CategoryIcon slug={categorySlug} size={44} strokeWidth={1.4} className="opacity-60" />
      <span className="absolute bottom-2 left-3 text-xs font-medium tracking-wide text-ink-3">{brand}</span>
    </div>
  )
}
