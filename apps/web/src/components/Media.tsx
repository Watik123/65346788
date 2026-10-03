import { CategoryIcon } from './icons'

interface Props {
  imageUrl: string | null
  alt: string
  categorySlug: string
  brand: string
  className?: string
}

/** Фото товару. Поки парсери не зібрали фото, показуємо спокійну заглушку зі значком категорії. */
export function Media({ imageUrl, alt, categorySlug, brand, className = '' }: Props) {
  if (imageUrl) {
    return (
      <div className={`overflow-hidden bg-surface-2 ${className}`}>
        <img src={imageUrl} alt={alt} loading="lazy" className="size-full object-contain" />
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
