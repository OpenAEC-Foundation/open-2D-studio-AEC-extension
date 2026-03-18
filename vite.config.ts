import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

function autoDeploy() {
  const appData = process.env.APPDATA;
  if (!appData) return { name: 'auto-deploy' };

  const targetDir = path.join(appData, 'com.open2dstudio.app', 'extensions', 'aec');
  return {
    name: 'auto-deploy',
    closeBundle() {
      if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
      copyFileSync(path.resolve(__dirname, 'dist/main.js'), path.join(targetDir, 'main.js'));
      copyFileSync(path.resolve(__dirname, 'manifest.json'), path.join(targetDir, 'manifest.json'));
      console.log(`\n  ✓ Deployed to ${targetDir}\n`);
    },
  };
}

export default defineConfig({
  plugins: [react(), autoDeploy()],
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
