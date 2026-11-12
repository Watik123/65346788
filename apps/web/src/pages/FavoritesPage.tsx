import { formatDay, formatPrice } from '@znyzhky/shared'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { CatalogCard } from '../components/CatalogCard'
import { HeartIcon } from '../components/icons'
import { useFavorites, type Favorite } from '../lib/favorites'
import { useCatalog } from '../lib/queries'

/** Як змінилась ціна, відколи товар додали в обране */
function sinceAdded(fav: Favorite | undefined, now: number | null): string | null {
  if (!fav) return null
  const when = `з ${formatDay(fav.at)}`
  if (fav.price === null || now === null) return `В обраному ${when}`
  const diff = now - fav.price
  if (diff === 0) return `Ціна не змінилась ${when}`
  return diff < 0 ? `Подешевшав на ${formatPrice(-diff)} ${when}` : `Подорожчав на ${formatPrice(diff)} ${when}`
}

/** Обране: товари, за ціною яких людина стежить. Список живе в її браузері */
export function FavoritesPage() {
  const { items, ids } = useFavorites()
  const catalog = useCatalog({ ids, sort: 'drop', page: 1, limit: 60 }, ids.length > 0)
  useEffect(() => {
    document.title = 'Обране: справжні знижки'
  }, [])

  const data = ids.length > 0 ? catalog.data : undefined
  // Товар прибрали з обраного: картка зникає одразу, не чекаючи нового запиту
  const shown = data?.items.filter((i) => String(i.id) in items) ?? []

  return (
    <>
      <section className="max-w-3xl">
        <h1 className="text-balance text-[1.7rem] font-bold leading-tight tracking-tight sm:text-4xl">Обране</h1>
        <p className="mt-3 text-pretty text-ink-2 sm:text-lg">
          Товари, за ціною яких ви стежите. Список зберігається лише в цьому браузері: на іншому пристрої він буде порожній.
        </p>
      </section>

      <div className="mt-8">
        {ids.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-surface-2 text-ink-3">
              <HeartIcon size={24} />
            </span>
            <p className="mt-3 font-semibold">Тут поки порожньо</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">
              Натисніть сердечко на картці товару або «Стежити за ціною» на його сторінці. Тут буде видно, як змінилась ціна, відколи ви його додали.
            </p>
            <Link to="/catalog" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-canvas">
              До каталогу
            </Link>
          </div>
        ) : catalog.isError && !data ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center">
            <p className="font-semibold">Не вдалося завантажити товари</p>
            <button type="button" onClick={() => catalog.refetch()} className="mt-4 min-h-11 rounded-full bg-ink px-5 text-sm font-semibold text-canvas">
              Спробувати ще раз
            </button>
          </div>
        ) : !data ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Завантажуємо обране">
            {ids.slice(0, 6).map((id) => (
              <div key={id} className="skeleton h-32 rounded-2xl" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((item) => (
                <CatalogCard key={item.id} item={item} note={sinceAdded(items[String(item.id)], item.bestPrice)} />
              ))}
            </div>
            {shown.length < ids.length && (
              <p className="mt-4 text-sm text-ink-3">Частини збережених товарів у каталозі вже немає: магазини перестали їх продавати.</p>
            )}
          </>
        )}
      </div>
    </>
  )
}
