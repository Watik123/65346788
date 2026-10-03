import { formatPercent, formatPrice, pluralUk, type Reason } from '@znyzhky/shared'

const days = (n: number) => `${n} ${pluralUk(n, 'день', 'дні', 'днів')}`

export const reasons = {
  belowTypical: (percent: number, amount: number, baseline: number, baselineDays: number): Reason => ({
    code: 'below_typical',
    tone: 'positive',
    text: `Ціна на ${formatPercent(percent)} (${formatPrice(amount)}) нижча за типову ціну ринку за ${days(baselineDays)}: ${formatPrice(baseline)}.`,
  }),

  marketLow: (windowDays: number): Reason => ({
    code: 'market_low',
    tone: 'positive',
    text: `Це найнижча ціна ринку за останні ${days(windowDays)}.`,
  }),

  nearLow: (abovePercent: number, lowest: number, windowDays: number): Reason => ({
    code: 'near_low',
    tone: 'positive',
    text: `Ціна лише на ${formatPercent(abovePercent, 1)} вища за мінімум ринку за ${days(windowDays)}: ${formatPrice(lowest)}.`,
  }),

  stableHistory: (): Reason => ({
    code: 'stable_history',
    tone: 'positive',
    text: 'До зниження ціна трималась стабільно, без різких стрибків.',
  }),

  freshDrop: (daysAtLevel: number): Reason => ({
    code: 'fresh_drop',
    tone: 'neutral',
    text: daysAtLevel <= 1 ? 'Ціна знизилась сьогодні.' : `Ціна знизилась нещодавно: на цьому рівні ${days(daysAtLevel)}.`,
  }),

  claimOverstated: (claimed: number, real: number): Reason => ({
    code: 'claim_overstated',
    tone: 'neutral',
    text: `Магазин показує знижку ${formatPercent(claimed)}, але від типової ціни ринку вона становить ${formatPercent(real)}.`,
  }),

  insufficientHistory: (span: number, needed: number): Reason => ({
    code: 'insufficient_history',
    tone: 'negative',
    text: `Замало даних: історія цін охоплює ${days(span)}, а потрібно щонайменше ${days(needed)}.`,
  }),

  recentPriceSpike: (recentDays: number, peak: number, abovePercent: number): Reason => ({
    code: 'recent_price_spike',
    tone: 'negative',
    text: `Перед «знижкою» ціну підняли: за останні ${days(recentDays)} вона сягала ${formatPrice(peak)}, що на ${formatPercent(abovePercent)} вище за типову, а тепер повернулась до звичайного рівня.`,
  }),

  unstablePrices: (swings: number, windowDays: number): Reason => ({
    code: 'unstable_prices',
    tone: 'negative',
    text: `За ${days(windowDays)} ціна різко змінювалась ${swings} ${pluralUk(swings, 'раз', 'рази', 'разів')}, тож така знижка нестабільна.`,
  }),

  storeClaimNotConfirmed: (claimed: number, real: number, baselineDays: number): Reason => ({
    code: 'store_claim_not_confirmed',
    tone: 'negative',
    text:
      real < 1
        ? `Магазин показує знижку ${formatPercent(claimed)}, але порівняно з типовою ціною за ${days(baselineDays)} знижки немає.`
        : `Магазин показує знижку ${formatPercent(claimed)}, але порівняно з типовою ціною за ${days(baselineDays)} вона лише ${formatPercent(real)}.`,
  }),

  aboveRecentLow: (abovePercent: number, baselineDays: number): Reason => ({
    code: 'above_recent_low',
    tone: 'negative',
    text: `Ціна вже на ${formatPercent(abovePercent)} вища за мінімум останніх ${days(baselineDays)}: схоже, акція закінчується.`,
  }),

  belowThreshold: (percent: number, threshold: number): Reason => ({
    code: 'below_threshold',
    tone: 'neutral',
    text:
      percent < 1
        ? 'Ціна на типовому рівні, знижки немає.'
        : `Знижка лише ${formatPercent(percent)}, а помітною вважаємо від ${formatPercent(threshold)}.`,
  }),
}
