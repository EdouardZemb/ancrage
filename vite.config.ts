import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  root: 'src/client',
  // La révision du code, connue du client à la construction (`ARG REVISION` du Dockerfile).
  define: { __ANCRAGE_REVISION__: JSON.stringify(process.env.REVISION ?? 'local') },
  plugins: [
    preact(),
    // L'application installable et son service worker (décision 25) : `src/client/sw.ts`, écrit à
    // la main, reçoit à la construction la liste des fichiers à précacher, puis devient `sw.js`.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: '.',
      filename: 'sw.ts',
      // `enregistrerSw()` (`src/client/enregistrer-sw.ts`) l'enregistre.
      injectRegister: false,
      manifest: {
        name: 'ancrage',
        short_name: 'ancrage',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f4f7f8',
        theme_color: '#0b7f8f',
        lang: 'de',
        // Produites par `node scripts/icones.mjs` à partir de `src/client/public/icone.svg`.
        icons: [
          { src: '/icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icone-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icone-masquable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      // Le précache : les fichiers construits, l'application seule, jamais une réponse de l'API
      // (décision 11). Les icônes du manifeste y sont déjà, par `globPatterns` : ne pas les
      // ajouter une seconde fois.
      includeManifestIcons: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        // Un script classique, sans `import` : la forme qu'enregistre `enregistrerSw()`.
        rollupFormat: 'iife',
      },
    }),
  ],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
