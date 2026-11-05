import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

import pkg from './package.json';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react()],
  resolve: {
    alias: {
      '@openplan/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@openplan/annotations': path.resolve(__dirname, '../../packages/annotations/src/index.ts'),
      '@openplan/toolbar': path.resolve(__dirname, '../../packages/toolbar/src/index.ts'),
    },
  },
});
