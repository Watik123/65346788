export type DealStatus = 'real' | 'fake' | 'insufficient_data' | 'none'

/** Підписи статусів для інтерфейсу */
export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  real: 'Справжня знижка',
  fake: 'Фальшива знижка',
  insufficient_data: 'Замало даних',
  none: 'Без знижки',
}

export type ReasonCode =
  | 'below_typical'
  | 'market_low'
  | 'stable_history'
  | 'fresh_drop'
  | 'claim_overstated'
  | 'insufficient_history'
  | 'recent_price_spike'
  | 'unstable_prices'
  | 'store_claim_not_confirmed'
  | 'above_recent_low'
  | 'below_threshold'

export type ReasonTone = 'positive' | 'negative' | 'neutral'

/** Причина рішення: код для логіки й готовий український текст для людей */
export interface Reason {
  code: ReasonCode
  tone: ReasonTone
  text: string
}
