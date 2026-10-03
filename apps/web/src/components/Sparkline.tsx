import { formatPrice } from '@znyzhky/shared'

interface Props {
  values: number[]
  /** Підпис для скрінрідерів, напр. «Ціна за 30 днів» */
  label: string
  className?: string
}

const W = 120
const H = 36
const PAD = 4

/**
 * Міні-графік ціни: приглушена лінія, світла заливка під нею й акцентна точка
 * на поточному значенні. Лінія розтягується на ширину картки, а точка це
 * окремий елемент, щоб вона лишалась круглою.
 */
export function Sparkline({ values, label, className = '' }: Props) {
  if (values.length < 2) return <div className={className} aria-hidden="true" />

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const x = (i: number) => (i / (values.length - 1)) * W
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2)

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(' ')
  const area = `${line} L${W} ${H} L0 ${H} Z`
  const last = values[values.length - 1] as number
  const aria = `${label}: від ${formatPrice(max)} до ${formatPrice(last)}`

  return (
    <div className={`relative ${className}`} role="img" aria-label={aria} style={{ height: H }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <path d={area} fill="var(--ink-3)" fillOpacity={0.1} />
        <path d={line} fill="none" stroke="var(--ink-3)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
        style={{ left: '100%', top: `${(y(last) / H) * 100}%`, boxShadow: '0 0 0 2px var(--surface)' }}
        aria-hidden="true"
      />
    </div>
  )
}
