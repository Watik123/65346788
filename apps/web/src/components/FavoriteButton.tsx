import { useFavorites } from '../lib/favorites'
import { HeartIcon } from './icons'

interface Props {
  id: number
  /** Найкраща ціна зараз: запам'ятовується, щоб потім показати, як вона змінилась */
  price: number | null
  /** Велика кнопка з підписом (сторінка товару) або кругла на картці */
  variant?: 'icon' | 'full'
  className?: string
}

/** Додати товар в обране чи прибрати з нього */
export function FavoriteButton({ id, price, variant = 'icon', className = '' }: Props) {
  const { has, toggle } = useFavorites()
  const on = has(id)
  const label = on ? 'Прибрати з обраного' : 'Додати в обране'
  if (variant === 'full') {
    return (
      <button
        type="button"
        onClick={() => toggle(id, price)}
        aria-pressed={on}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${
          on ? 'border-accent bg-accent-weak text-accent' : 'border-line bg-surface text-ink hover:border-ink-3'
        } ${className}`}
      >
        <HeartIcon size={18} filled={on} />
        {on ? 'В обраному' : 'Стежити за ціною'}
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        // Картка цілком є посиланням на товар: кнопка не повинна його відкривати
        e.preventDefault()
        e.stopPropagation()
        toggle(id, price)
      }}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={`relative z-10 grid size-9 place-items-center rounded-full border border-line bg-surface/90 backdrop-blur transition-colors ${
        on ? 'text-accent' : 'text-ink-3 hover:text-ink'
      } ${className}`}
    >
      <HeartIcon size={18} filled={on} />
    </button>
  )
}
