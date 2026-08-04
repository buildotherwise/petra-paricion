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
          // El chunk del tablero, que se lleva a Recharts entero (~400 kB).
          //
          // El resto del admin SÍ se precachea aunque los teléfonos no lo usen:
          // son 30–50 kB y compran que la web admin funcione sin señal. Acá el
          // trato se da vuelta —es diez veces más grande y la pantalla no puede
          // mostrar nada sin conexión, porque lee vistas del servidor— así que
          // pagarlo en cinco aparatos del campo sería regalar los datos de
          // otro.
          //
          // OJO: un patrón que no coincide con nada NO da error, y la falla es
          // en la dirección cara. Después de `pnpm build`, verificar:
          //   ls -la dist/assets | grep -i tablero   → existe y pesa ~400 kB
          //   grep -c Tablero dist/sw.js             → 0
          // Si Recharts apareciera en otro chunk, es que algún módulo más lo
          // importó y hay que devolverlo a `Tablero.tsx`.
          //
          // El `.css` va incluido: son 5 kB y no cambian nada de peso, pero con
          // el patrón limitado a `.js` la verificación de arriba devolvía 1 y
          // una guarda que miente es peor que no tenerla — la próxima persona
          // la corre, la ve fallar y no sabe si es esto o Recharts de verdad.
          '**/assets/Tablero-*.{js,css}',
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
          { src: '/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // El maskable es un archivo aparte, con fondo opaco y el logo al 60%:
          // Android recorta estos íconos a círculo o squircle y se come cerca
          // del 10% de cada lado. Reusar el de `any` dejaría el logo mordido.
          {
            src: '/icono-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
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
