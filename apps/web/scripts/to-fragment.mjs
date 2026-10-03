// Перетворює збірку в один файл на «фрагмент» без <html>/<head>/<body>:
// назва, стилі, корінь застосунку й скрипт. Саме такий вигляд приймає сторінка-обгортка.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const dir = path.resolve(import.meta.dirname, '../dist-snapshot')
const html = readFileSync(path.join(dir, 'index.html'), 'utf8')

const one = (re, what) => {
  const m = html.match(re)
  if (!m) throw new Error(`У збірці немає ${what}`)
  return m[0]
}

const title = one(/<title>[\s\S]*?<\/title>/, 'назви')
const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0])
const scripts = [...html.matchAll(/<script\b[^>]*type="module"[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0])
if (styles.length === 0 || scripts.length === 0) throw new Error('У збірці немає стилів або скрипта')

const out = [title, ...styles, '<div id="root"></div>', ...scripts].join('\n')
writeFileSync(path.join(dir, 'fragment.html'), out)
console.log(`fragment.html: ${(out.length / 1024).toFixed(0)} КБ, стилів: ${styles.length}, скриптів: ${scripts.length}`)
