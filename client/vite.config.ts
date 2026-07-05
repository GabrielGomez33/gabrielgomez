import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// =============================================================================
// Gabriel Gomez — Portfolio + SonSoul storefront (SPA)
// Served by Apache under https://www.theundergroundrailroad.world/GabrielGomez
// so the app is built with a matching base path. React Router uses the same
// value as its basename (see src/main.tsx).
// =============================================================================
export default defineConfig({
  base: '/GabrielGomez/',
  plugins: [react()],
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
