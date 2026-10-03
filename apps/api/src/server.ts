import { buildApp } from './app'
import { createPrisma } from './lib/db'

const port = Number(process.env.PORT ?? 3001)
const host = process.env.HOST ?? '127.0.0.1'

const prisma = createPrisma()
const app = buildApp({ prisma, logger: true })

async function shutdown(signal: string) {
  app.log.info(`Отримано ${signal}, зупиняю сервер`)
  await app.close()
  await prisma.$disconnect()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

app.listen({ port, host }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
