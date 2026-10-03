import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PrismaClient } from '../generated/prisma/client'
import { REPO_ROOT } from '../lib/database-url'
import { createPrisma } from '../lib/db'

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Порожня тимчасова база зі справжніми міграціями. Ваша data/app.db не чіпається. */
export function createTempDb(): { prisma: PrismaClient; dir: string; cleanup: () => Promise<void> } {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'znyzhky-test-'))
  const url = `file:${dir.replace(/\\/g, '/')}/test.db`
  execFileSync(process.execPath, [path.join(REPO_ROOT, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  })
  const prisma = createPrisma(url)
  return {
    prisma,
    dir,
    cleanup: async () => {
      await prisma.$disconnect()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
