import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { LogoMark, MoonIcon, SunIcon, SystemIcon } from './icons'
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
  `rounded-full px-2.5 py-2 text-sm font-medium transition-colors sm:px-3.5 ${isActive ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:text-ink'}`

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => window.scrollTo(0, 0), [pathname])
  return null
}

export function Layout() {
  const filters = useFilters()
  const demo = filters.data?.demo ?? false
  const shopNames = filters.data?.shops.map((s) => s.name).join(', ') ?? ''
  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollToTop />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        До вмісту
      </a>
      <header className="sticky z-40 border-b border-line bg-surface/90 backdrop-blur" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2.5 rounded-lg" aria-label="Справжні знижки, на головну">
            <LogoMark />
            <span className="whitespace-nowrap text-base font-bold tracking-tight sm:text-[1.05rem]">Справжні знижки</span>
          </Link>
          {demo && (
            <span className="hidden rounded-full border border-line px-2 py-0.5 text-xs font-medium text-ink-3 sm:inline" title="Ціни, відгуки й наявність у цій версії вигадані">
              демо-дані
            </span>
          )}
          <nav aria-label="Розділи" className="ml-auto flex items-center sm:gap-1">
            <NavLink to="/" end className={navClass}>
              Знижки
            </NavLink>
            <NavLink to="/rejected" className={navClass}>
              Відсіяні
            </NavLink>
            <ThemeToggle />
          </nav>
        </div>
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
                ? `Ціни щодня збираємо зі сторінок магазинів: ${shopNames}. `
                : ''}
            Справжня знижка це ціна нижча за типову ціну ринку за 60 днів, а не за закреслену ціну магазину.
          </p>
        </div>
      </footer>
    </div>
  )
}
