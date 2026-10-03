import { formatNumber, formatPrice, type CategoryNodeDto, type FiltersResponse } from '@znyzhky/shared'
import { useEffect, useState } from 'react'
import type { FeedFilters } from '../lib/feed-params'
import { Chip } from './Chip'

interface Props {
  filters: FeedFilters
  data: FiltersResponse | undefined
  onChange: (patch: Partial<FeedFilters>) => void
  onReset: () => void
  activeCount: number
  /** В нижній панелі заголовок уже є, тож тут його ховаємо */
  hideTitle?: boolean
}

const DISCOUNT_OPTIONS = [0, 10, 15, 20]
const RATING_OPTIONS = [0, 4, 4.5, 4.8]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="mb-2 text-sm font-semibold text-ink">{title}</legend>
      {children}
    </fieldset>
  )
}

function CategoryRow({ node, depth, selected, onSelect }: { node: CategoryNodeDto; depth: number; selected: string | undefined; onSelect: (slug: string | undefined) => void }) {
  const isSelected = selected === node.slug
  return (
    <>
      <li>
        <button
          type="button"
          onClick={() => onSelect(isSelected ? undefined : node.slug)}
          aria-pressed={isSelected}
          className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-sm transition-colors ${
            isSelected ? 'bg-accent-weak font-semibold text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
          }`}
          style={{ paddingLeft: `${0.5 + depth * 0.9}rem` }}
        >
          <span className="truncate">{node.name}</span>
          <span className="tabular text-xs text-ink-3">{node.dealCount}</span>
        </button>
      </li>
      {node.children.map((c) => (
        <CategoryRow key={c.slug} node={c} depth={depth + 1} selected={selected} onSelect={onSelect} />
      ))}
    </>
  )
}

/** Поле ціни: значення застосовується, коли користувач завершив введення, а не на кожну цифру */
function PriceInput({ id, label, value, placeholder, onCommit }: { id: string; label: string; value: number | undefined; placeholder: string; onCommit: (v: number | undefined) => void }) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  useEffect(() => setText(value === undefined ? '' : String(value)), [value])

  const commit = () => {
    const digits = text.replace(/[^\d]/g, '')
    const n = digits === '' ? undefined : Number(digits)
    if (n !== value) onCommit(n)
    else setText(value === undefined ? '' : String(value))
  }

  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="mb-1 block text-xs text-ink-3">
        {label}
      </label>
      <div className="flex h-10 items-center rounded-lg border border-line bg-surface px-3 focus-within:border-ink-3">
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          className="tabular w-full min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
        />
        <span className="pl-1 text-sm text-ink-3">₴</span>
      </div>
    </div>
  )
}

export function FilterPanel({ filters, data, onChange, onReset, activeCount, hideTitle = false }: Props) {
  const toggleShop = (slug: string) =>
    onChange({ shops: filters.shops.includes(slug) ? filters.shops.filter((s) => s !== slug) : [...filters.shops, slug] })

  const range = data?.priceRange

  return (
    <div className="flex flex-col gap-6">
      <div className={`flex items-center ${hideTitle ? 'justify-end' : 'justify-between'} ${hideTitle && activeCount === 0 ? 'hidden' : ''}`}>
        {!hideTitle && <h2 className="text-base font-bold">Фільтри</h2>}
        {activeCount > 0 && (
          <button type="button" onClick={onReset} className="text-sm font-medium text-accent underline-offset-4 hover:underline">
            Скинути ({activeCount})
          </button>
        )}
      </div>

      <Section title="Категорія">
        <ul className="flex flex-col gap-0.5">
          <li>
            <button
              type="button"
              onClick={() => onChange({ category: undefined })}
              aria-pressed={!filters.category}
              className={`flex min-h-9 w-full items-center rounded-lg px-2 text-left text-sm transition-colors ${
                !filters.category ? 'bg-accent-weak font-semibold text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
              }`}
            >
              Усі категорії
            </button>
          </li>
          {data?.categories.map((c) => (
            <CategoryRow key={c.slug} node={c} depth={0} selected={filters.category} onSelect={(category) => onChange({ category })} />
          ))}
        </ul>
      </Section>

      <Section title="Магазин">
        <p className="mb-2 -mt-1 text-xs text-ink-3">Товар, що є в наявності в обраному магазині</p>
        <ul className="flex flex-col gap-0.5">
          {data?.shops.map((s) => {
            const checked = filters.shops.includes(s.slug)
            return (
              <li key={s.slug}>
                <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
                  <input type="checkbox" checked={checked} onChange={() => toggleShop(s.slug)} className="size-4 accent-[var(--accent)]" />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="tabular text-xs text-ink-3">{s.dealCount}</span>
                </label>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section title="Мінімальна знижка">
        <div className="flex flex-wrap gap-2">
          {DISCOUNT_OPTIONS.map((v) => (
            <Chip
              key={v}
              selected={(filters.minDiscount ?? 0) === v}
              onClick={() => onChange({ minDiscount: v || undefined })}
              disabled={v > 0 && data !== undefined && v > data.maxDiscountPercent}
            >
              {v === 0 ? 'Будь-яка' : `від ${v}%`}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Ціна">
        <div className="flex items-end gap-2">
          <PriceInput id="price-min" label="від" value={filters.minPrice} placeholder={range ? formatNumber(range.min) : '0'} onCommit={(v) => onChange({ minPrice: v })} />
          <span className="pb-2.5 text-ink-3" aria-hidden="true">
            –
          </span>
          <PriceInput id="price-max" label="до" value={filters.maxPrice} placeholder={range ? formatNumber(range.max) : ''} onCommit={(v) => onChange({ maxPrice: v })} />
        </div>
        {range && (
          <p className="mt-2 text-xs text-ink-3">
            У стрічці: {formatPrice(range.min)} – {formatPrice(range.max)}
          </p>
        )}
      </Section>

      <Section title="Мінімальна оцінка">
        <div className="flex flex-wrap gap-2">
          {RATING_OPTIONS.map((v) => (
            <Chip key={v} selected={(filters.minRating ?? 0) === v} onClick={() => onChange({ minRating: v || undefined })}>
              {v === 0 ? 'Будь-яка' : `від ${String(v).replace('.', ',')}`}
            </Chip>
          ))}
        </div>
      </Section>
    </div>
  )
}
