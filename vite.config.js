import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: './',
  server: {
    port: 5173,
    open: false,
    strictPort: false
  },
  build: {
    outDir: 'dist-build',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html')
    }
  }
})
