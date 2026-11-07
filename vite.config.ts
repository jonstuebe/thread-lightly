import { defineConfig } from 'vite'

import { cloudflare } from '@cloudflare/vite-plugin'
import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [cloudflare(), tailwindcss(), foldkit()],
  optimizeDeps: {
    entries: ['src/entry.ts'],
  },
})
