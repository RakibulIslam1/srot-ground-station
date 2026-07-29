import type { BondorApi } from './index'

declare global {
  interface Window {
    bondor: BondorApi
  }
}

export {}
