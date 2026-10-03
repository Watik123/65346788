import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(here, '../../../..')

/** Мінімальний розбір .env без залежностей: рядки виду KEY="value". */
function loadDotEnv(): void {
  const file = path.join(REPO_ROOT, '.env')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m || line.trimStart().startsWith('#')) continue
    const [, key, raw] = m
    if (key && raw !== undefined && process.env[key] === undefined) {
      process.env[key] = raw.replace(/^(['"])(.*)\1$/, '$2')
    }
  }
}

/**
 * Повертає DATABASE_URL. Відносний шлях до SQLite-файлу рахується від кореня
 * репозиторію, щоб скрипти працювали однаково з будь-якої папки.
 */
export function getDatabaseUrl(): string {
  loadDotEnv()
  const url = process.env.DATABASE_URL ?? 'file:./data/app.db'
  if (url.startsWith('file:')) {
    const p = url.slice('file:'.length)
    const abs = path.isAbsolute(p) ? p : path.resolve(REPO_ROOT, p)
    // На Windows шлях має зворотні скісні риски, в адресі file: потрібні прямі
    return 'file:' + abs.replace(/\\/g, '/')
  }
  return url
}
