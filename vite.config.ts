import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/nownodes': {
        target: 'https://btcbook.nownodes.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nownodes/, ''),
      },
    },
  },
});
