import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Aster's funding-history endpoint (fapi/v1/fundingRate) sends no CORS headers, so the
      // browser blocks it. Route Aster calls through the dev server (which fetches server-side,
      // no CORS) so funding history — and thus persistence/stability for Aster pairs — works.
      '/aster-api': {
        target: 'https://fapi.asterdex.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/aster-api/, ''),
      },
    },
  },
})
