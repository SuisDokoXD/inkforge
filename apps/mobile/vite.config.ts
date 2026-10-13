import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The editor package is TypeScript-first; aliasing its source avoids relying
    // on a CommonJS dist file whose named exports Vite cannot statically inspect.
    alias: {
      '@inkforge/editor': resolve(__dirname, '../../packages/editor/src/index.ts'),
      '@inkforge/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@inkforge/skill-engine': resolve(__dirname, '../../packages/skill-engine/src/index.ts'),
      '@renderer': resolve(__dirname, '../desktop/src/renderer/src'),
    },
  },
  css: { postcss: resolve(__dirname, 'postcss.config.cjs') },
  server: { port: 5174, strictPort: true },
});
