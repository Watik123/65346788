import Fastify, { type FastifyInstance } from 'fastify'
import { ApiError } from './errors'
import type { PrismaClient } from './generated/prisma/client'
import { registerRoutes } from './routes'

export interface AppOptions {
  prisma: PrismaClient
  logger?: boolean
}

export function buildApp({ prisma, logger = false }: AppOptions): FastifyInstance {
  const app = Fastify({ logger })

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } })
    }
    // Помилки самого Fastify (некоректний JSON, завеликий запит тощо) мають свій код 4xx
    const status = (err as { statusCode?: number }).statusCode
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply.status(status).send({ error: { code: 'bad_request', message: 'Некоректний запит' } })
    }
    request.log.error(err)
    return reply.status(500).send({ error: { code: 'internal_error', message: 'Внутрішня помилка сервера' } })
  })

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: { code: 'not_found', message: 'Такої адреси немає' } })
  })

  app.register(async (api) => registerRoutes(api, prisma), { prefix: '/api' })

  return app
}
