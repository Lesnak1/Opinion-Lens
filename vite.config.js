import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, cpSync, writeFileSync, readFileSync } from 'fs';
import { build } from 'vite';

// Main build config for popup, options, and service-worker
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup/popup.html'),
        options: resolve(__dirname, 'options/options.html'),
        'service-worker': resolve(__dirname, 'background/service-worker.js'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
        format: 'es'
      }
    },
    sourcemap: process.env.NODE_ENV === 'development',
    minify: true,
    target: 'esnext'
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'shared')
    }
  },
  plugins: [
    {
      name: 'build-content-scripts',
      async closeBundle() {
        const distDir = resolve(__dirname, 'dist');

        // Build content scripts as IIFE (self-contained, no imports)
        console.log('Building content scripts as IIFE...');

        // Build twitter-injector
        await build({
          configFile: false,
          build: {
            outDir: distDir,
            emptyOutDir: false,
            lib: {
              entry: resolve(__dirname, 'content/twitter-injector.js'),
              name: 'TwitterInjector',
              fileName: () => 'twitter-injector.js',
              formats: ['iife']
            },
            rollupOptions: {
              output: {
                inlineDynamicImports: true,
                extend: true,
              }
            },
            minify: true,
            sourcemap: false
          },
          resolve: {
            alias: {
              '@shared': resolve(__dirname, 'shared')
            }
          }
        });

        // Build opinion-injector
        await build({
          configFile: false,
          build: {
            outDir: distDir,
            emptyOutDir: false,
            lib: {
              entry: resolve(__dirname, 'content/opinion-injector.js'),
              name: 'OpinionInjector',
              fileName: () => 'opinion-injector.js',
              formats: ['iife']
            },
            rollupOptions: {
              output: {
                inlineDynamicImports: true,
                extend: true,
              }
            },
            minify: true,
            sourcemap: false
          },
          resolve: {
            alias: {
              '@shared': resolve(__dirname, 'shared')
            }
          }
        });

        console.log('✓ Built content scripts as IIFE');

        // Copy manifest.json
        copyFileSync(
          resolve(__dirname, 'manifest.prod.json'),
          resolve(distDir, 'manifest.json')
        );

        // Copy assets/icons
        const iconsDir = resolve(distDir, 'assets/icons');
        mkdirSync(iconsDir, { recursive: true });
        cpSync(
          resolve(__dirname, 'assets/icons'),
          iconsDir,
          { recursive: true }
        );

        // Copy content script CSS files
        const contentDir = resolve(distDir, 'content');
        mkdirSync(contentDir, { recursive: true });
        copyFileSync(
          resolve(__dirname, 'content/twitter-styles.css'),
          resolve(contentDir, 'twitter-styles.css')
        );
        copyFileSync(
          resolve(__dirname, 'content/opinion-styles.css'),
          resolve(contentDir, 'opinion-styles.css')
        );

        console.log('✓ Copied extension files to dist/');
      }
    }
  ]
});
