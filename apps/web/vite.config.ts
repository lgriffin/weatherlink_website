import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

export default defineConfig({
  plugins: [TanStackRouterVite({ quoteStyle: 'single' }), react()],
  server: {
    proxy: {
      '/api': 'http://localhost:1456',
      '/health': 'http://localhost:1456',
      '/metrics': 'http://localhost:1456',
    },
  },
});
