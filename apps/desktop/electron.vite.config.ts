import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const shared = fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@gula/shared'] })],
    resolve: { alias: { '@gula/shared': shared } },
    // Servidor por defecto de la app instalada (lo fija el script de publicación).
    define: { __SERVIDOR_DEFECTO__: JSON.stringify(process.env.GULA_SERVIDOR_DEFECTO ?? 'http://localhost:3000') },
  },
  preload: {
    // Preload con sandbox: tiene que ser CommonJS.
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    resolve: { alias: { '@gula/shared': shared } },
  },
});
