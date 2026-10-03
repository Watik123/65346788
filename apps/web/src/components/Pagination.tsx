import { ChevronLeftIcon, ChevronRightIcon } from './icons'

interface Props {
  page: number
  pages: number
  onChange: (page: number) => void
}

/** Номери сторінок зі скороченням: 1 … 4 5 6 … 12 */
function pageList(page: number, pages: number): (number | 'gap')[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages))
  const sorted = [...keep].sort((a, b) => a - b)
  const out: (number | 'gap')[] = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - (sorted[i - 1] as number) > 1) out.push('gap')
    out.push(p)
  })
  return out
}

export function Pagination({ page, pages, onChange }: Props) {
  if (pages <= 1) return null
  const btn = 'grid size-10 place-items-center rounded-full text-sm font-medium transition-colors'
  return (
    <nav aria-label="Сторінки" className="mt-8 flex items-center justify-center gap-1">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Попередня сторінка" className={`${btn} text-ink-2 hover:bg-surface-2 disabled:opacity-30`}>
        <ChevronLeftIcon />
      </button>
      {pageList(page, pages).map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} className="px-1 text-ink-3" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            aria-label={`Сторінка ${p}`}
            className={`${btn} tabular ${p === page ? 'bg-ink text-canvas' : 'text-ink-2 hover:bg-surface-2'}`}
          >
            {p}
          </button>
        ),
      )}
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label="Наступна сторінка" className={`${btn} text-ink-2 hover:bg-surface-2 disabled:opacity-30`}>
        <ChevronRightIcon />
      </button>
    </nav>
  )
}
