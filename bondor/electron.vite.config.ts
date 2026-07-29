import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // node-mavlink / mavlink-mappings are CJS with node internals — keep them external
        // so Electron loads them from node_modules at runtime instead of bundling.
        external: ['node-mavlink', 'mavlink-mappings', 'serialport']
      }
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
