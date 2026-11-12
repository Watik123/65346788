import { formatDay } from '@znyzhky/shared'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router'
import { LogoMark, MoonIcon, SearchIcon, SunIcon, SystemIcon } from './icons'
import { useFilters } from '../lib/queries'
import { THEME_LABELS, useTheme } from '../lib/theme'

const THEME_ICON = { system: SystemIcon, light: SunIcon, dark: MoonIcon }

function ThemeToggle() {
  const { choice, cycle } = useTheme()
  const ThemeIcon = THEME_ICON[choice]
  return (
    <button
      type="button"
      onClick={cycle}
      title={`${THEME_LABELS[choice]}. Натисніть, щоб змінити`}
      aria-label={`${THEME_LABELS[choice]}. Натисніть, щоб змінити`}
      className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink sm:size-10"
    >
      <ThemeIcon />
    </button>
  )
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `shrink-0 rounded-full px-3 py-2 text-sm font-medium transition-colors sm:px-3.5 ${isActive ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:text-ink'}`

/** Пошук у шапці: веде в каталог із запитом. На сторінці каталогу є своє поле, тож тут воно ховається */
function HeaderSearch() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [text, setText] = useState('')
  if (pathname === '/catalog') return null
  return (
    <form
      role="search"
      className="ml-auto flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-surface px-3 focus-within:border-ink-3 sm:max-w-xs"
      onSubmit={(e) => {
        e.preventDefault()
        const q = text.trim()
        navigate(q ? `/catalog?q=${encodeURIComponent(q)}` : '/catalog')
        setText('')
      }}
    >
      <SearchIcon size={16} className="shrink-0 text-ink-3" />
      <label htmlFor="header-search" className="sr-only">
        Пошук товару
      </label>
      <input
        id="header-search"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Пошук товару"
        className="w-full min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
      />
    </form>
  )
}

function Nav() {
  return (
    <>
      <NavLink to="/" end className={navClass}>
        Знижки
      </NavLink>
      <NavLink to="/catalog" className={navClass}>
        Каталог
      </NavLink>
      <NavLink to="/compare" className={navClass}>
        Порівняння
      </NavLink>
      <NavLink to="/rejected" className={navClass}>
        Відсіяні
      </NavLink>
    </>
  )
}

/** Де людина зупинилась на кожній сторінці: щоб кнопка «Назад» повертала в те саме місце стрічки */
const scrollPositions = new Map<string, number>()

function ScrollToTop() {
  const { pathname, key } = useLocation()
  const type = useNavigationType()
  const lastPath = useRef<string | null>(null)
  // Позицію запам'ятовуємо під час гортання, а не в момент переходу: тоді сторінка вже інша.
  // Саме layout-ефект: слухача треба зняти до того, як браузер перерахує прокручування нової сторінки
  useLayoutEffect(() => {
    const save = () => scrollPositions.set(key, window.scrollY)
    window.addEventListener('scroll', save, { passive: true })
    return () => window.removeEventListener('scroll', save)
  }, [key])
  // Без повернення результату scrollTo: у нових Chrome це проміс, а React прийняв би його
  // за функцію прибирання й упав при переході на іншу сторінку
  useEffect(() => {
    const saved = scrollPositions.get(key)
    if (type === 'POP' && saved !== undefined && lastPath.current !== null) {
      // Повернулись назад: стрічка з уже довантаженими знижками на тому самому місці
      requestAnimationFrame(() => {
        window.scrollTo(0, saved)
      })
    } else if (lastPath.current !== pathname) {
      window.scrollTo(0, 0)
    }
    lastPath.current = pathname
  }, [pathname, key, type])
  return null
}

export function Layout() {
  const { pathname } = useLocation()
  const filters = useFilters()
  const demo = filters.data?.demo ?? false
  const shopNames = filters.data?.shops.map((s) => s.name).join(', ') ?? ''
  const dataDay = filters.data?.dataDay ?? null
  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollToTop />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        До вмісту
      </a>
      <header className="sticky z-40 border-b border-line bg-surface/90 backdrop-blur" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:h-16">
          <Link to="/" className="flex shrink-0 items-center gap-2.5 rounded-lg" aria-label="Справжні знижки, на головну">
            <LogoMark />
            <span className="hidden whitespace-nowrap text-base font-bold tracking-tight min-[420px]:inline sm:text-[1.05rem]">Справжні знижки</span>
          </Link>
          {demo && (
            <span className="hidden rounded-full border border-line px-2 py-0.5 text-xs font-medium text-ink-3 sm:inline" title="Ціни, відгуки й наявність у цій версії вигадані">
              демо-дані
            </span>
          )}
          {/* На широкому екрані розділи в одному рядку з пошуком, на вузькому — другим рядком нижче */}
          <nav aria-label="Розділи" className="ml-4 hidden items-center gap-1 lg:flex">
            <Nav />
          </nav>
          <HeaderSearch />
          <span className={pathname === '/catalog' ? 'ml-auto' : ''}>
            <ThemeToggle />
          </span>
        </div>
        <nav aria-label="Розділи" className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-3 pb-2 sm:px-5 lg:hidden">
          <Nav />
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-7xl px-4 py-6 text-sm text-ink-3 sm:px-6">
          <p>
            {demo
              ? 'Демонстраційна версія: товари, ціни, оцінки та наявність вигадані, посилання на магазини ведуть на заглушки. '
              : shopNames
                ? `Ціни щодня збираємо зі сторінок магазинів: ${shopNames}. ${dataDay ? `Останнє оновлення: ${formatDay(dataDay)}. ` : ''}`
                : ''}
            Справжня знижка це ціна нижча за типову ціну ринку за 60 днів, а не за закреслену ціну магазину.
          </p>
        </div>
      </footer>
    </div>
  )
}
