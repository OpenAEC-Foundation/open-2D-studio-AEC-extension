import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.tsx'),
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: ['open-2d-studio', 'react', 'react/jsx-runtime', 'lucide-react'],
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: false,
  },
});
