import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    dedupe: [
      'firebase',
      '@firebase/app',
      '@firebase/auth',
      '@firebase/database',
      '@firebase/component',
      '@firebase/util'
    ]
  },
  server: {
    port: 5173,
    open: false,
    host: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true
  }
});
