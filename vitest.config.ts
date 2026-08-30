import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts: vitest ships its own Vite copy, and
// mixing the two plugin type universes in one file breaks the typecheck.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
