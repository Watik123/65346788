import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/** Збірка однієї HTML-сторінки з уже вбудованими даними: працює без сервера */
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: { '@snapshot': path.resolve(__dirname, 'src/snapshot/data.json') },
  },
  build: { outDir: 'dist-snapshot', emptyOutDir: true },
})
