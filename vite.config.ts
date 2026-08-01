import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // La app tiene que arrancar sin señal, así que todo el shell va precacheado.
      // El .wasm de SQLite pesa >2 MB: sin subir el límite Workbox lo excluye en
      // silencio y la app queda rota justo cuando no hay red para ir a buscarlo.
      workbox: {
        // woff2 incluido a propósito: sin precachear las tipografías, la app
        // sin señal cae a la fuente del sistema y se desarma entera.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,woff2}'],
        globIgnores: [
          // Los builds `mc-` de wa-sqlite son la variante con cifrado
          // (multi-cipher) y solo se cargan si se define `encryptionKey`, cosa
          // que no hacemos. Serían 3,6 MB extra en la primera instalación.
          '**/mc-wa-sqlite*.wasm',
          // Subconjuntos de las tipografías que el español nunca pide.
          '**/*-cyrillic*-wght-normal*.woff2',
          '**/*-greek*-wght-normal*.woff2',
          '**/*-vietnamese-wght-normal*.woff2',
        ],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Petra · Parición',
        short_name: 'Petra',
        description: 'Registro de parición y señalada — Merino Australiano',
        lang: 'es-UY',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F4F0E3',
        theme_color: '#2A2410',
        icons: [
          { src: '/icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icono-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],

  // @powersync/web y wa-sqlite cargan su .wasm y sus workers en runtime; el
  // pre-bundler los rompe. Los workers deben emitirse como ESM.
  optimizeDeps: {
    exclude: ['@journeyapps/wa-sqlite', '@powersync/web'],
  },
  worker: {
    format: 'es',
  },

  build: {
    // Los dispositivos reales son la tablet Android y iPhones. Estos targets
    // soportan top-level await y OPFS de forma nativa, que es lo que necesita
    // wa-sqlite — por eso no hace falta vite-plugin-top-level-await (que además
    // no funciona en Vite 8, donde esbuild fue reemplazado por Rolldown).
    target: ['safari16', 'chrome111'],
  },

  server: {
    host: true, // accesible desde la tablet y los iPhones en la red local
  },
});
