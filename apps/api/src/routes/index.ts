import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '../generated/prisma/client'
import { feedQuerySchema, parseInput, productParamsSchema } from '../schemas'
import { ApiError } from '../errors'
import { getFeed } from '../services/feed'
import { getFilters } from '../services/filters'
import { getProductDetail } from '../services/product'

export function registerRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/health', async () => ({ status: 'ok' }))

  app.get('/filters', async () => getFilters(prisma))

  app.get('/feed', async (request) => getFeed(prisma, parseInput(feedQuerySchema, request.query)))

  app.get('/products/:id', async (request) => {
    const { id } = parseInput(productParamsSchema, request.params)
    const product = await getProductDetail(prisma, id)
    if (!product) throw new ApiError(404, 'product_not_found', 'Товар не знайдено')
    return product
  })
}
