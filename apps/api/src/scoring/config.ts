/**
 * Усі коефіцієнти скору в одному місці. Змінюючи тут число, змінюєш поведінку
 * всього сервісу; тести перевіряють сенс правил, а не конкретні числа.
 */
export interface ScoringConfig {
  /** Вікно «типової» ціни ринку, діб (медіана цін за цей період) */
  baselineDays: number
  /** Знижка менша за цей відсоток не вважається помітною */
  minDiscountPercent: number
  /** Мінімум діб історії (і записів, і охоплення) для висновку */
  minHistoryDays: number
  /** Вікно пошуку нещодавнього підйому ціни, діб */
  recentDays: number
  /** Підйом цін над типовою на стільки (частка) вважається накрутою */
  spikeThreshold: number
  /** Добова зміна ціни на стільки (частка) вважається різким стрибком */
  swingThreshold: number
  /** Вікно підрахунку стрибків, діб */
  swingWindowDays: number
  /** Стільки стрибків і більше: історія нестабільна */
  maxSwings: number
  /** Наскільки (частка) поточна ціна може бути вищою за мінімум 60 діб, щоб ще вважатись «на дні» */
  atLowTolerance: number
  /** Знижка магазину від цього відсотка, яку ми не підтвердили, позначається як фейкова */
  claimThresholdPercent: number
  /** Магазин перебільшує знижку на стільки відсоткових пунктів і більше: попереджаємо */
  claimOverstatedGap: number
  /** Ціна на поточному рівні не довше за стільки діб: «свіже зниження» */
  freshDays: number
  quality: {
    /** Середня оцінка по ринку, до якої «підтягуються» товари з малою кількістю відгуків */
    priorRating: number
    /** Вага цієї середньої, в «відгуках» */
    priorWeight: number
    /** Оцінка, нижче якої якість = мінімальна */
    floorRating: number
    /** Оцінка, з якої якість = 1 */
    topRating: number
    /** Нижня межа коефіцієнта якості */
    minFactor: number
  }
  popularity: {
    /** Кількість магазинів, з якої популярність = 1 */
    refShops: number
  }
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  baselineDays: 60,
  minDiscountPercent: 5,
  minHistoryDays: 14,
  recentDays: 14,
  spikeThreshold: 0.08,
  swingThreshold: 0.05,
  swingWindowDays: 30,
  maxSwings: 4,
  atLowTolerance: 0.03,
  claimThresholdPercent: 10,
  claimOverstatedGap: 8,
  freshDays: 3,
  quality: { priorRating: 4.3, priorWeight: 50, floorRating: 3, topRating: 5, minFactor: 0.2 },
  popularity: { refShops: 6 },
}

export type ScoringOverrides = Partial<Omit<ScoringConfig, 'quality' | 'popularity'>> & {
  quality?: Partial<ScoringConfig['quality']>
  popularity?: Partial<ScoringConfig['popularity']>
}

export function mergeConfig(overrides: ScoringOverrides = {}): ScoringConfig {
  return {
    ...DEFAULT_SCORING_CONFIG,
    ...overrides,
    quality: { ...DEFAULT_SCORING_CONFIG.quality, ...overrides.quality },
    popularity: { ...DEFAULT_SCORING_CONFIG.popularity, ...overrides.popularity },
  }
}
