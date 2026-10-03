import { formatPercent } from '@znyzhky/shared'

/**
 * «Магазин обіцяє» проти «насправді»: дві смужки в одному масштабі.
 * Смужка магазину лишається нейтральною, а не червоною: колір відхилення дає лише текст поруч.
 */
export function ClaimCompare({ claimed, real }: { claimed: number | null; real: number }) {
  if (claimed === null) return null
  const scale = Math.max(claimed, real, 1)
  const rows = [
    { label: 'Обіцяє магазин', value: claimed, color: 'var(--ink-3)' },
    { label: 'Насправді', value: real, color: 'var(--accent)' },
  ]
  return (
    <dl className="flex flex-col gap-2.5" aria-label="Знижка за словами магазину та реальна">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[7.5rem_1fr_3.25rem] items-center gap-3 text-sm">
          <dt className="text-ink-2">{r.label}</dt>
          <dd className="m-0 h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (r.value / scale) * 100)}%`, background: r.color }} />
          </dd>
          <dd className="tabular m-0 text-right font-bold text-ink">{r.value < 0.5 ? '0%' : `−${formatPercent(r.value)}`}</dd>
        </div>
      ))}
    </dl>
  )
}
