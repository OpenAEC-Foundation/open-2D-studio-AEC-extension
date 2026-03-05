/**
 * Deploy script — copies built extension to Tauri appData extensions dir.
 *
 * Tauri identifier: com.openndstudio.app
 * Target: %APPDATA%/com.openndstudio.app/extensions/aec/
 */

import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { env } from 'process';

const appData = env.APPDATA;
if (!appData) {
  console.error('APPDATA environment variable not set');
  process.exit(1);
}

const targetDir = join(appData, 'com.openndstudio.app', 'extensions', 'aec');

if (!existsSync(targetDir)) {
  mkdirSync(targetDir, { recursive: true });
  console.log(`Created directory: ${targetDir}`);
}

const distDir = join(import.meta.dirname, '..', 'dist');
const mainJs = join(distDir, 'main.js');

if (!existsSync(mainJs)) {
  console.error('dist/main.js not found. Run "npm run build" first.');
  process.exit(1);
}

copyFileSync(mainJs, join(targetDir, 'main.js'));
copyFileSync(join(import.meta.dirname, '..', 'manifest.json'), join(targetDir, 'manifest.json'));

console.log(`Deployed AEC extension to: ${targetDir}`);
