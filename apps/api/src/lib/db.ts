import { PrismaLibSql } from '@prisma/adapter-libsql'
import { PrismaClient } from '../generated/prisma/client'
import { getDatabaseUrl } from './database-url'

/**
 * Єдине місце, де створюється клієнт бази. Для переходу на PostgreSQL
 * замінюється лише адаптер тут і provider у schema.prisma.
 */
/** url передається в тестах, щоб працювати з тимчасовою базою */
export function createPrisma(url: string = getDatabaseUrl()): PrismaClient {
  const adapter = new PrismaLibSql({ url })
  return new PrismaClient({ adapter })
}
