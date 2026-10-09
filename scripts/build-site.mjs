// Збирає сайт без сервера зі справжніх даних: npm run site:build
//  1. тимчасова база (ваша data/app.db не чіпається) з усього файлового сховища datastore/;
//  2. сторінка сайту (apps/web/dist-site/fragment.html: скрипти й стилі всередині);
//  3. дані поруч зі сторінкою: apps/web/dist-site/data/index.json і data/p/<кошик>.json.
// Наприкінці друкує, що публікувати: сторінку і перелік файлів даних.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const api = path.join(root, 'apps/api')
const web = path.join(root, 'apps/web')
const site = path.join(web, 'dist-site')
const tmp = mkdtempSync(path.join(os.tmpdir(), 'znyzhky-site-'))
const env = { ...process.env, DATABASE_URL: `file:${tmp.replace(/\\/g, '/')}/site.db` }
const node = process.execPath
const tsx = path.join(root, 'node_modules/tsx/dist/cli.mjs')

const run = (title, args, cwd) => {
  console.log(`\n== ${title}`)
  execFileSync(node, args, { cwd, env, stdio: 'inherit' })
}

try {
  run('База', [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], api)
  run('Імпорт цін зі сховища', [tsx, 'src/cli/data-import.ts', path.join(root, 'datastore')], api)
  run('Сторінка сайту', [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.static.config.ts', '--logLevel', 'warn'], web)
  run('Сторінка без обгортки', ['scripts/to-fragment.mjs', 'dist-site'], web)
  run('Дані сайту', [tsx, 'src/cli/export-static.ts', `--out=${path.join(site, 'data')}`], api)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

const list = (dir) => readdirSync(dir).flatMap((f) => (statSync(path.join(dir, f)).isDirectory() ? list(path.join(dir, f)) : [path.join(dir, f)]))
const data = list(path.join(site, 'data')).map((f) => path.relative(site, f).split(path.sep).join('/'))
const mb = (f) => (statSync(path.join(site, f)).size / 1024 / 1024).toFixed(2)
console.log(`\nГотово. Сторінка: apps/web/dist-site/fragment.html (${mb('fragment.html')} МБ)`)
console.log(`Файлів даних: ${data.length}, найбільший: ${data.map((f) => [f, Number(mb(f))]).sort((a, b) => b[1] - a[1])[0]?.join(' — ')} МБ`)
console.log('Публікувати: сторінку fragment.html і файли з apps/web/dist-site/data під тими самими шляхами (data/index.json, data/p/0.json…)')
