import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'client'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'client/src'),
      '@shared': path.resolve(import.meta.dirname, 'shared'),
    },
  },
  server: { host: '0.0.0.0', allowedHosts: true },
  build: { outDir: path.resolve(import.meta.dirname, 'dist/public'), emptyOutDir: true },
});
