import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * Сайт без сервера: одна HTML-сторінка (скрипти й стилі всередині), а дані окремими файлами
 * в data/, які сторінка довантажує відносними адресами. Дані записує npm run site:build.
 */
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  define: { 'import.meta.env.VITE_STATIC': JSON.stringify('1') },
  build: { outDir: 'dist-site', emptyOutDir: true },
})
