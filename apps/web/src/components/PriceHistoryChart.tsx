import { formatDay, formatNumber, formatPrice, type ProductDetailResponse } from '@znyzhky/shared'
import { useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const RANGES = [30, 60, 90] as const
type Range = (typeof RANGES)[number]

interface Props {
  product: ProductDetailResponse
  /** Магазини в порядку, що дає кожному постійний колір на всіх сторінках */
  shopOrder: string[]
}

type Row = { date: string } & Record<string, number | string | undefined>

const DAY_MS = 86_400_000
const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

function shopColor(slug: string, order: string[]): string {
  const i = order.indexOf(slug)
  return i >= 0 && i < 6 ? `var(--c-shop-${i + 1})` : 'var(--ink-3)'
}

/** Округлення меж осі до «круглих» значень, щоб підписи не були безладними */
function niceDomain(min: number, max: number): [number, number] {
  const span = Math.max(max - min, max * 0.04)
  const step = span > 20_000 ? 5000 : span > 8000 ? 2000 : span > 3000 ? 1000 : span > 1200 ? 500 : span > 400 ? 200 : 100
  return [Math.floor((min - span * 0.08) / step) * step, Math.ceil((max + span * 0.08) / step) * step]
}

interface TipProps {
  active?: boolean
  label?: string | number
  payload?: { dataKey?: string | number; value?: number | string; color?: string }[]
  names: Map<string, string>
}

function ChartTooltip({ active, label, payload, names }: TipProps) {
  if (!active || !payload?.length || typeof label !== 'string') return null
  const rows = payload.filter((p) => typeof p.value === 'number' && p.dataKey !== undefined && names.has(String(p.dataKey)))
  if (!rows.length) return null
  return (
    <div className="min-w-44 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm shadow-lg">
      <p className="mb-1.5 text-xs font-medium text-ink-3">{formatDay(label)}</p>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={String(r.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-ink-2">
              <span className="h-0.5 w-3.5 rounded-full" style={{ background: r.color }} aria-hidden="true" />
              {names.get(String(r.dataKey))}
            </span>
            <span className="tabular font-bold text-ink">{formatPrice(r.value as number)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PriceHistoryChart({ product, shopOrder }: Props) {
  const [range, setRange] = useState<Range>(90)
  const [visibleShops, setVisibleShops] = useState<Set<string>>(new Set())
  const { market, shops } = product.history
  const basePrice = product.deal?.basePrice ?? null

  const model = useMemo(() => {
    const last = market.at(-1)
    if (!last) return null
    const cutoff = dayMs(last.date) - (range - 1) * DAY_MS
    const rows = new Map<string, Row>()
    const ensure = (date: string) => rows.get(date) ?? (rows.set(date, { date }), rows.get(date) as Row)

    for (const p of market) {
      if (dayMs(p.date) < cutoff) continue
      const row = ensure(p.date)
      row['market'] = p.price
      row['area'] = p.price // окреме поле для заливки, щоб ключі серій не дублювались
    }
    for (const s of shops) for (const p of s.points) if (dayMs(p.date) >= cutoff) ensure(p.date)[s.slug] = p.price

    const data = [...rows.values()].sort((a, b) => a.date.localeCompare(b.date))
    return { data, last, cutoff }
  }, [market, shops, range])

  if (!model || model.data.length < 2) {
    return <p className="text-sm text-ink-2">Замало даних для графіка.</p>
  }

  const { data, last } = model
  const visible = shops.filter((s) => visibleShops.has(s.slug))

  const values: number[] = []
  for (const row of data) {
    const m = row['market']
    if (typeof m === 'number') values.push(m)
    for (const s of visible) {
      const v = row[s.slug]
      if (typeof v === 'number') values.push(v)
    }
  }
  if (basePrice !== null) values.push(basePrice)
  const [yMin, yMax] = niceDomain(Math.min(...values), Math.max(...values))

  const names = new Map<string, string>([['market', 'Найкраща ціна'], ...visible.map((s): [string, string] => [s.slug, s.name])])
  const lo = Math.min(...data.map((r) => r['market'] as number).filter((v) => typeof v === 'number'))
  const hi = Math.max(...data.map((r) => r['market'] as number).filter((v) => typeof v === 'number'))
  const summary = `Графік найкращої ціни за ${range} днів: від ${formatPrice(lo)} до ${formatPrice(hi)}, зараз ${formatPrice(last.price)}`

  const toggleShop = (slug: string) =>
    setVisibleShops((cur) => {
      const next = new Set(cur)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Період графіка" className="inline-flex rounded-full bg-surface-2 p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={range === r}
              onClick={() => setRange(r)}
              className={`min-h-9 rounded-full px-4 text-sm font-semibold transition-colors ${range === r ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
            >
              {r} днів
            </button>
          ))}
        </div>

        <ul className="flex flex-wrap items-center gap-2" aria-label="Ціни магазинів на графіку">
          {shops.map((s) => {
            const on = visibleShops.has(s.slug)
            return (
              <li key={s.slug}>
                <button
                  type="button"
                  onClick={() => toggleShop(s.slug)}
                  aria-pressed={on}
                  className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors ${
                    on ? 'border-ink-3 bg-surface text-ink' : 'border-line bg-surface text-ink-3 hover:text-ink'
                  }`}
                >
                  <span className="h-0.5 w-4 rounded-full" style={{ background: shopColor(s.slug, shopOrder), opacity: on ? 1 : 0.45 }} aria-hidden="true" />
                  {s.name}
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="mt-4 h-[280px] w-full sm:h-[340px]" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeWidth={1} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDay}
              tick={{ fill: 'var(--ink-3)', fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--line)' }}
              interval="preserveStartEnd"
              minTickGap={48}
              tickMargin={8}
            />
            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={(v: number) => formatNumber(v)}
              tick={{ fill: 'var(--ink-3)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={58}
              tickCount={5}
            />
            <Tooltip
              content={<ChartTooltip names={names} />}
              cursor={{ stroke: 'var(--ink-3)', strokeWidth: 1 }}
              isAnimationActive={false}
            />
            {basePrice !== null && (
              <ReferenceLine
                y={basePrice}
                stroke="var(--ink-3)"
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{ value: 'типова ціна', position: 'insideTopLeft', fill: 'var(--ink-3)', fontSize: 12 }}
              />
            )}
            <Area type="linear" dataKey="area" stroke="none" fill="var(--ink)" fillOpacity={0.05} connectNulls isAnimationActive={false} activeDot={false} tooltipType="none" />
            {visible.map((s) => (
              <Line
                key={s.slug}
                type="linear"
                dataKey={s.slug}
                stroke={shopColor(s.slug, shopOrder)}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                connectNulls
                isAnimationActive={false}
                activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
              />
            ))}
            <Line
              type="linear"
              dataKey="market"
              stroke="var(--ink)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              connectNulls
              isAnimationActive={false}
              activeDot={{ r: 5, fill: 'var(--ink)', stroke: 'var(--surface)', strokeWidth: 2 }}
            />
            <ReferenceDot x={last.date} y={last.price} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} ifOverflow="visible" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-3">
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-4 rounded-full bg-ink" aria-hidden="true" />
          найкраща ціна ринку
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-accent" aria-hidden="true" />
          сьогодні
        </span>
        {basePrice !== null && (
          <span className="inline-flex items-center gap-2">
            <span className="w-4 border-t border-dashed border-ink-3" aria-hidden="true" />
            типова ціна за 60 днів
          </span>
        )}
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium text-accent underline-offset-4 hover:underline">Показати дані таблицею</summary>
        <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-line">
          <table className="tabular w-full min-w-[34rem] border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-surface-2 text-xs text-ink-2">
              <tr>
                <th className="px-3 py-2 font-semibold">Дата</th>
                <th className="px-3 py-2 font-semibold">Найкраща</th>
                {shops.map((s) => (
                  <th key={s.slug} className="px-3 py-2 font-semibold">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((row) => (
                <tr key={row.date} className="border-t border-line">
                  <td className="px-3 py-1.5 text-ink-2">{formatDay(row.date)}</td>
                  <td className="px-3 py-1.5 font-semibold">{typeof row['market'] === 'number' ? formatPrice(row['market']) : '–'}</td>
                  {shops.map((s) => (
                    <td key={s.slug} className="px-3 py-1.5 text-ink-2">
                      {typeof row[s.slug] === 'number' ? formatPrice(row[s.slug] as number) : '–'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
