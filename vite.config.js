import { defineConfig } from 'vite';

export default defineConfig({
  root: 'www',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022'
  }
});
