/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

const base = process.env.VITE_BASE || '/study-review/';

export default defineConfig({
  base,
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
