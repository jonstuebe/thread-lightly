import { defineConfig, type Plugin } from 'vite'

import { cloudflare } from '@cloudflare/vite-plugin'
import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

// Foldkit injects the devtools overlay as an inline module script. Vite serves
// inline module scripts through an "html proxy" module, but when the Cloudflare
// plugin transforms index.html it passes an absolute file path, and the proxy
// lookup then misses ("No matching HTML proxy module found"). Loading the
// overlay through a src attribute skips the proxy entirely.
const devToolsOverlayAsSrc = (): Plugin => ({
  name: 'thread-lightly:devtools-overlay-as-src',
  apply: 'serve',
  transformIndexHtml: {
    order: 'pre',
    handler: html =>
      html.replace(
        /<script type="module">\s*import '(virtual:foldkit-devtools-overlay)'\s*<\/script>/,
        '<script type="module" src="/@id/$1"></script>',
      ),
  },
})

export default defineConfig({
  plugins: [cloudflare(), tailwindcss(), foldkit(), devToolsOverlayAsSrc()],
  optimizeDeps: {
    entries: ['src/entry.ts'],
  },
})
