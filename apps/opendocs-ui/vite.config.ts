import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'

const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, './package.json'), 'utf-8'))

const isGitHubPages = process.env.VITE_GITHUB_PAGES === 'true'
// Hosted web app: static build served at opendocs.smithgajjar.dev/app/ (no Go server).
const isWeb = process.env.VITE_WEB === 'true'

export default defineConfig({
  base: isWeb ? '/app/' : isGitHubPages ? '/opendocs-app/' : '/',
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
    // Server build: straight into the Go embed dir (emptyOutDir:false keeps the tracked
    // .gitkeep; the build script clears stale assets). Web build: into the landing site.
    outDir: isWeb ? '../opendocs-landing/dist/app' : '../cli/internal/opendocs/server/ui/dist',
    emptyOutDir: isWeb,
  },
  server: {
    // `opendocs serve --port 7433` for a proxyable dev backend.
    proxy: {
      '/api': 'http://127.0.0.1:7433',
    },
  },
})
