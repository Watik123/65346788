export type DealStatus = 'real' | 'fake' | 'insufficient_data' | 'none'

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

/** Найкраща ціна ринку за добу (мінімум по магазинах, лише товари в наявності) */
export interface DailyPrice {
  /** Північ UTC */
  date: Date
  price: number
}

export interface DealInput {
  /** Північ UTC дня, для якого рахуємо */
  today: Date
  /** Історія найкращої ціни ринку; може містити й сьогоднішню добу, вона ігнорується */
  series: DailyPrice[]
  /** Найкраща ціна зараз (серед пропозицій у наявності) */
  currentPrice: number
  rating: number | null
  reviewCount: number
  /** Скільки магазинів продають товар (у наявності) */
  shopsCount: number
  /** Закреслена («стара») ціна, яку показує магазин із найкращою ціною */
  claimedOldPrice: number | null
}

export interface DealResult {
  status: DealStatus
  currentPrice: number
  /** Мінімум ринку за 30 і 60 діб, включно з поточною ціною */
  min30: number | null
  min60: number | null
  /** Типова ціна ринку (медіана за baselineDays), з якою порівнювали */
  basePrice: number | null
  discountPercent: number
  discountAmount: number
  /** Знижка, яку обіцяє магазин (від його закресленої ціни) */
  claimedPercent: number | null
  quality: number
  popularity: number
  /** Підсумковий скор; 0 для всього, крім status = 'real' */
  score: number
  reasons: Reason[]
}
