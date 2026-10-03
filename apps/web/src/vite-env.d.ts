/// <reference types="vite/client" />

declare module '@snapshot' {
  import type { Snapshot } from '@znyzhky/shared'
  const data: Snapshot | null
  export default data
}
