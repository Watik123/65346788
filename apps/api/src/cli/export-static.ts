import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildStaticIndex, splitProducts } from '@znyzhky/shared'
import { REPO_ROOT } from '../lib/database-url'
import { createPrisma } from '../lib/db'
import type { PrismaClient } from '../generated/prisma/client'
import { buildSnapshot } from './export-snapshot'

/**
 * Дані для сайту без сервера окремими файлами: data/index.json і data/p/<кошик>.json
 * (див. packages/shared/src/static.ts). Повертає перелік записаних файлів відносно outDir/..
 */
export async function exportStatic(prisma: PrismaClient, outDir: string): Promise<{ files: string[]; bytes: number; products: number }> {
  const snapshot = await buildSnapshot(prisma)
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(path.join(outDir, 'p'), { recursive: true })
  const files: string[] = []
  let bytes = 0
  const write = (rel: string, data: unknown) => {
    const json = JSON.stringify(data)
    writeFileSync(path.join(outDir, rel), json)
    files.push(path.posix.join(path.basename(outDir), rel))
    bytes += Buffer.byteLength(json)
  }
  write('index.json', buildStaticIndex(snapshot))
  for (const [bucket, products] of [...splitProducts(snapshot.products)].sort((a, b) => a[0] - b[0])) write(`p/${bucket}.json`, products)
  return { files, bytes, products: snapshot.products.length }
}

/** Запуск: npm run static:export -- [--out=папка]  (за замовчуванням apps/web/dist-site/data) */
async function main() {
  const out = path.resolve(process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? path.join(REPO_ROOT, 'apps/web/dist-site/data'))
  const prisma = createPrisma()
  try {
    const r = await exportStatic(prisma, out)
    console.log(`Дані сайту: ${r.files.length} файлів, ${(r.bytes / 1024 / 1024).toFixed(1)} МБ, товарів ${r.products} → ${path.relative(REPO_ROOT, out)}`)
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
