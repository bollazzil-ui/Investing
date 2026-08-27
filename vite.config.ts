import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Dev-only proxy for Stooq quotes. Stooq does not send CORS headers,
      // so a browser cannot call it directly. In production, point this path
      // at your own small proxy (see README > Live quotes).
      '/api/stooq': {
        target: 'https://stooq.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/stooq/, ''),
      },
    },
  },
});
