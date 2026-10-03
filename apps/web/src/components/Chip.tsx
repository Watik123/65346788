import type { ReactNode } from 'react'

interface Props {
  selected: boolean
  onClick: () => void
  children: ReactNode
  disabled?: boolean
}

/** Кнопка-вибір для коротких наборів значень (знижка від…, оцінка від…) */
export function Chip({ selected, onClick, children, disabled }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`min-h-9 rounded-full border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        selected ? 'border-accent bg-accent-weak text-accent' : 'border-line bg-surface text-ink-2 hover:border-ink-3 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
