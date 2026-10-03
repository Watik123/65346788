import { PrismaLibSql } from '@prisma/adapter-libsql'
import { PrismaClient } from '../generated/prisma/client'
import { getDatabaseUrl } from './database-url'

/**
 * Єдине місце, де створюється клієнт бази. Для переходу на PostgreSQL
 * замінюється лише адаптер тут і provider у schema.prisma.
 */
export function createPrisma(): PrismaClient {
  const adapter = new PrismaLibSql({ url: getDatabaseUrl() })
  return new PrismaClient({ adapter })
}
