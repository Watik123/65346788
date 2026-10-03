import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'prisma/**/*.test.ts'],
    exclude: ['src/generated/**', 'node_modules/**'],
  },
})
