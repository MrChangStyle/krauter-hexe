import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

// `vite build` never opens a socket, so PORT is only needed when this config
// serves the dev server. A production build on a host that injects PORT only at
// runtime (Render, most containers) would otherwise fail during the build.
const isBuild = process.argv.includes('build');

const rawPort = process.env.PORT;

if (!isBuild && !rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = rawPort ? Number(rawPort) : undefined;

if (port !== undefined && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    VitePWA({
      // "prompt" (instead of autoUpdate) so a new version does NOT silently
      // swap in. Instead the app registers the waiting worker and we show the
      // user a popup ("Neue Version verfügbar"). Registration is done manually
      // via the useRegisterSW() hook in <UpdatePrompt />, so we disable the
      // auto-injected registration to avoid registering twice.
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        id: basePath,
        name: 'Kräuterhexe',
        short_name: 'Kräuterhexe',
        description:
          'Scanne Wildpflanzen und erfahre sofort, ob sie für dich und deine Tiere sicher sind.',
        start_url: basePath,
        scope: basePath,
        display: 'standalone',
        background_color: '#F4F1EA',
        theme_color: '#2F5B44',
        orientation: 'portrait',
        lang: 'de',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'maskable-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Adds the push + notificationclick handlers to the generated worker
        // so server-sent reminders arrive even when the app is closed.
        importScripts: ['push-sw.js'],
        navigateFallbackDenylist: [/^\/api\//],
        // Order matters: the first matching rule wins.
        runtimeCaching: [
          {
            // Plant photos are immutable per id - cache them aggressively so
            // the archive/detail images are visible offline.
            urlPattern: /\/api\/plants\/\d+\/image/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'plant-images',
              expiration: {
                maxEntries: 400,
                maxAgeSeconds: 60 * 60 * 24 * 60, // 60 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Archive / detail / category JSON: use the network when it's
            // reachable (so data stays fresh) but fall back to the last known
            // copy when offline or on a weak connection, so the whole archive
            // stays readable without a signal.
            urlPattern: /\/api\/(plants|categories)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'plant-data',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Auth, scans, user management and every other API call must always
            // hit the network - never serve a stale session or scan result.
            urlPattern: /\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
