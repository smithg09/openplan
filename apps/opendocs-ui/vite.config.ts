import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'

const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, './package.json'), 'utf-8'))

const isGitHubPages = process.env.VITE_GITHUB_PAGES === 'true'

export default defineConfig({
  base: isGitHubPages ? '/opendocs-app/' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@openplan/shared':      path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@openplan/annotations': path.resolve(__dirname, '../../packages/annotations/src/index.ts'),
      '@openplan/toolbar':     path.resolve(__dirname, '../../packages/toolbar/src/index.ts'),
    },
  },
  build: {
    // Emit straight into the Go embed dir. emptyOutDir:false preserves the
    // tracked .gitkeep; the build script clears stale assets beforehand.
    outDir: '../cli/internal/opendocs/server/ui/dist',
    emptyOutDir: false,
  },
  server: {
    // `opendocs serve --port 7433` for a proxyable dev backend.
    proxy: {
      '/api': 'http://127.0.0.1:7433',
    },
  },
})
