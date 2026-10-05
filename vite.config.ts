import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // API keys live in .env.local (git-ignored; see .env.example). They are read
  // here, in the dev server, and attached by the proxy — the browser bundle
  // never sees them. Only VITE_-prefixed variables reach client code, so these
  // names deliberately have no prefix.
  const env = loadEnv(mode, '.', '');
  const openFigiKey = env.OPENFIGI_API_KEY?.trim();

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        // Dev-only proxy for Yahoo Finance prices (and the FX fallback).
        // Yahoo does not send CORS headers, so a browser cannot call it
        // directly. In production, point this path at your own small proxy
        // (see README > Live quotes).
        // OpenFIGI is documented as CORS-enabled; its path is the fallback the
        // lookup retries on if a browser refuses the direct call.
        '/api/yahoo': {
          target: 'https://query1.finance.yahoo.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/yahoo/, ''),
        },
        '/api/openfigi': {
          target: 'https://api.openfigi.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/openfigi/, ''),
          headers: openFigiKey ? { 'X-OPENFIGI-APIKEY': openFigiKey } : undefined,
        },
      },
    },
  };
});
