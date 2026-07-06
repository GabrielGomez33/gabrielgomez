import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// =============================================================================
// Gabriel Gomez — Portfolio + SonSoul storefront (SPA + PWA)
// Served by Apache under https://www.theundergroundrailroad.world/GabrielGomez
// so the app is built with a matching base path. React Router uses the same
// value as its basename (see src/main.tsx). Installable PWA via vite-plugin-pwa
// (generateSW + prompt-to-update), mirroring the proven Mirror setup.
// =============================================================================
export default defineConfig({
  base: '/GabrielGomez/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // user taps "Reload" when a new version is ready
      scope: '/GabrielGomez/',
      includeAssets: ['favicon.svg', 'favicon-32x32.png', 'apple-touch-icon.png'],
      manifest: {
        id: '/GabrielGomez/',
        name: 'Gabriel Gomez',
        short_name: 'Gabriel Gomez',
        description:
          'Gabriel Gomez — developer, creator, and musician. Portfolio and home of SonSoul: cloudy, ethereal, alternative beats & sample packs.',
        start_url: '/GabrielGomez/',
        scope: '/GabrielGomez/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        lang: 'en',
        dir: 'ltr',
        prefer_related_applications: false,
        categories: ['music', 'shopping', 'entertainment'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Music', short_name: 'Music', url: '/GabrielGomez/store/music' },
          { name: 'Cart', short_name: 'Cart', url: '/GabrielGomez/store/cart' },
          { name: 'Account', short_name: 'Account', url: '/GabrielGomez/store/account' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}', 'pwa-*.png', 'favicon-*.png', 'apple-touch-icon.png'],
        globIgnores: ['**/splash/**'], // iOS reads splash at launch — no need to precache 1.6MB

        // SPA: serve the cached app shell for client-side routes, never for API.
        navigateFallback: '/GabrielGomez/index.html',
        navigateFallbackDenylist: [/^\/GabrielGomez\/api\//],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Product covers — fine to serve from cache, revalidate in background.
            urlPattern: /\/GabrielGomez\/api\/store\/cover\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'sonsoul-covers', expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 14 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    // Bind to 0.0.0.0 so `npm run dev` is reachable from other devices on the
    // LAN (phone, another laptop) — open http://<your-lan-ip>:5173/GabrielGomez/.
    host: true,
    port: 5173,
    // Local dev proxy to the production backend so /GabrielGomez/api works the
    // same in dev as it does behind Apache in production.
    proxy: {
      '/GabrielGomez/api': {
        target: 'https://www.theundergroundrailroad.world',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  preview: {
    // Same LAN binding for `npm run preview` (serves the production build).
    host: true,
    port: 4173,
  },
})
