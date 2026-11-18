import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Base propia para el test de integración (la suite de la API usa gula_test en paralelo).
process.env.TEST_DATABASE_URL ??= 'postgres://gula_app:gula_app@localhost:5433/gula_test_desktop';
process.env.TEST_DATABASE_ADMIN_URL ??= 'postgres://postgres:postgres@localhost:5433/gula_test_desktop';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@gula/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) },
  },
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
    fileParallelism: false,
    environmentMatchGlobs: [['src/renderer/**', 'jsdom']],
    setupFiles: ['./test/setup.ts'],
    globalSetup: ['./test/globalSetup.ts'],
  },
});
