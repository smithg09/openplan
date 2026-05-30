import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

import { readFileSync } from 'fs'

const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, './package.json'), 'utf-8'))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@openplan/shared':      path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@openplan/plan-viewer': path.resolve(__dirname, '../../packages/plan-viewer/src/index.ts'),
      '@openplan/toolbar':     path.resolve(__dirname, '../../packages/toolbar/src/index.ts'),
      '@openplan/annotations': path.resolve(__dirname, '../../packages/annotations/src/index.ts'),
      '@openplan/diff-viewer': path.resolve(__dirname, '../../packages/diff-viewer/src/index.ts'),
    },
  },
  build: {
    outDir: '../cli/internal/server/ui/dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:7432',
    },
  },
})
