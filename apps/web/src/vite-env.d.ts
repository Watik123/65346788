/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** '1' у збірці для сайту без сервера (npm run site:build) */
  readonly VITE_STATIC?: string
}
