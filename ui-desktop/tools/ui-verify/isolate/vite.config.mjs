import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const uiDesktop = resolve(here, '..', '..', '..');
export default defineConfig({
  root: here,
  plugins: [react()],
  // Mirror the aliases electron.vite.config declares for the renderer. Product
  // code imports through them (@renderer/...), so without these the isolate
  // cannot mount any component that uses one — it fails at resolve time, which
  // reads as "the component is broken" rather than "the harness can't see it".
  resolve: {
    alias: {
      '@renderer': resolve(uiDesktop, 'src', 'renderer', 'src'),
      src: resolve(uiDesktop, 'src'),
    },
  },
  server: { port: 5233, fs: { allow: [uiDesktop] } },
});
