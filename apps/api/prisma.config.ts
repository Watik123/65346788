import { defineConfig } from 'prisma/config'
import { getDatabaseUrl } from './src/lib/database-url'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/index.ts',
  },
  datasource: {
    url: getDatabaseUrl(),
  },
})
