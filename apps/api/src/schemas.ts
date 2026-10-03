import { SORT_OPTIONS } from '@znyzhky/shared'
import { z } from 'zod'
import { ApiError } from './errors'

const sortKeys = SORT_OPTIONS.map((o) => o.value) as [string, ...string[]]

const csv = z
  .string()
  .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))

export const feedQuerySchema = z
  .object({
    category: z.string().min(1).optional(),
    /** Магазини, що мають товар у наявності, через кому: shop=comfy,moyo */
    shop: csv.optional(),
    minDiscount: z.coerce.number().min(0).max(100).optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    sort: z.enum(sortKeys).default('score'),
    order: z.enum(['asc', 'desc']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(60).default(24),
  })
  .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
    message: 'minPrice не може бути більшим за maxPrice',
    path: ['minPrice'],
  })

export type FeedQuery = z.infer<typeof feedQuerySchema>

export const rejectedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(60).default(24),
})

export const productParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/** Розбирає вхід за схемою; помилка перетворюється на відповідь 400 */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  throw new ApiError(
    400,
    'invalid_request',
    'Некоректні параметри запиту',
    result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  )
}
