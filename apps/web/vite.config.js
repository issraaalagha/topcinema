import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/hls.js')) {
            return 'vendor-hls';
          }
          if (id.includes('node_modules/plyr')) {
            return 'vendor-plyr';
          }
          if (id.includes('node_modules/svelte')) {
            return 'vendor-svelte';
          }
        },
      },
    },
  },
});
