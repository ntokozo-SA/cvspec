import { crx } from '@crxjs/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import manifest from './manifest.config.ts'

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    rollupOptions: {
      // Extension pages the manifest doesn't reference, opened with chrome.runtime.getURL.
      input: { queue: 'src/queue/index.html' },
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    hmr: { port: 5174 },
    cors: { origin: [/chrome-extension:\/\//] },
  },
})
