import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import path from 'path';

// Rollup plugin to convert ESM output to CJS for Electron's sandboxed preload.
// Electron preloads MUST be CJS, but vite-plugin-electron ignores format:'cjs'
// when package.json has "type":"module". This plugin post-processes the bundle.
function preloadCjsPlugin() {
  return {
    name: 'preload-cjs-compat',
    generateBundle(_options: any, bundle: any) {
      for (const chunk of Object.values(bundle)) {
        if ((chunk as any).type === 'chunk') {
          let code: string = (chunk as any).code;
          // Convert ESM imports to CJS requires
          code = code.replace(
            /import\s*\{([^}]+)\}\s*from\s*["']electron["'];?/g,
            'const {$1} = require("electron");'
          );
          // Convert 'export default <expr>' to just '<expr>' (keeps the call)
          code = code.replace(/\bexport\s+default\s+/g, '');
          // Strip named ESM exports
          code = code
            .split('\n')
            .filter((line: string) => {
              const trimmed = line.trimStart();
              return !(trimmed.startsWith('export {') || trimmed.startsWith('export *'));
            })
            .join('\n');
          (chunk as any).code = code;
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'sql.js', 'fs', 'path', 'url', 'crypto'],
              output: {
                format: 'cjs',
                entryFileNames: '[name].js',
              },
            },
          },
          resolve: {
            alias: {
              '@shared': path.resolve(__dirname, './shared'),
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'es',
                entryFileNames: '[name].cjs',
              },
            },
          },
          plugins: [preloadCjsPlugin()],
        },
        onstart(args) {
          // Notify renderer process to reload when preload changes
          args.reload();
        },
      },
    ]),
  ],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
