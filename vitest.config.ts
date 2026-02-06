import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@shared': new URL('./shared', import.meta.url).pathname,
      '@electron': new URL('./electron', import.meta.url).pathname,
    },
  },
});
