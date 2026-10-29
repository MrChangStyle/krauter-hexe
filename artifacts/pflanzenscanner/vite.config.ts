import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';

import { SEO_PAGES, pageHtml, sitemapXml } from './src/lib/site-meta';

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
  // Shown under Mehr and after an update (lib/app-version.ts).
  define: { __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    // SEO (docs/seo.md): one HTML file per public page with its own title,
    // description and link preview, plus sitemap.xml. The server sends these
    // to whoever opens such a page; everything else gets index.html.
    {
      name: 'seo-pages',
      apply: 'build',
      // index.html itself (also the app shell) carries the homepage's tags;
      // done here so the service worker caches the final file.
      transformIndexHtml: (html) => pageHtml(html, SEO_PAGES[0]!),
      closeBundle() {
        const outDir = path.resolve(import.meta.dirname, 'dist/public');
        const indexHtml = readFileSync(path.join(outDir, 'index.html'), 'utf8');
        for (const page of SEO_PAGES.slice(1)) {
          mkdirSync(path.join(outDir, page.path), { recursive: true });
          writeFileSync(path.join(outDir, page.path, 'index.html'), pageHtml(indexHtml, page));
        }
        writeFileSync(path.join(outDir, 'sitemap.xml'), sitemapXml(new Date().toISOString().slice(0, 10)));
      },
    },
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
        // The manifest id (basePath) stays the same, so installed apps keep
        // working and only pick up the new name.
        name: 'Little Farming',
        short_name: 'Little Farming',
        description:
          'Little Farming – deine App für Garten, Hof und Tiere. Scanne Wildpflanzen, Pilze und Insekten, plane Beete und führe deine Tiere.',
        // The installed app starts in the app; "/" in a browser tab is the homepage (lib/app-entry.ts).
        start_url: `${basePath}app`,
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
        // Long-press on the app icon: straight to the stall (docs/stall.md).
        shortcuts: [
          {
            name: 'Am Stall',
            short_name: 'Am Stall',
            description: 'Eier und Stall-Aufgaben mit einem Tipp',
            url: `${basePath.replace(/\/$/, '')}/farm/stall`,
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        // Adds the push + notificationclick handlers to the generated worker
        // so server-sent reminders arrive even when the app is closed.
        importScripts: ['push-sw.js'],
        navigateFallbackDenylist: [/^\/api\//],
        // The app is one bundle of a little over 2 MiB (Workbox's default
        // limit); it must be precached or the app does not start offline.
        // Splitting it per page is part of the quality step (docs/LAUNCH-PLAN.md, 17).
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
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
            // Insect photos via the legacy endpoint, same rules as plants.
            urlPattern: /\/api\/insects\/\d+\/image/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'insect-images',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 60, // 60 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Photos on the image CDN. The app shows these URLs directly, so
            // without this rule every archive photo was missing offline. A
            // CDN URL never changes its content (new photo = new URL), so
            // cache-first is safe.
            urlPattern: ({ url }) => url.hostname === 'res.cloudinary.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdn-images',
              expiration: {
                maxEntries: 600,
                maxAgeSeconds: 60 * 60 * 24 * 90, // 90 days
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Archive / detail / category JSON: use the network when it's
            // reachable (so data stays fresh) but fall back to the last known
            // copy when offline or on a weak connection, so the whole archive
            // stays readable without a signal. Insects included: their
            // archive used to be empty offline.
            urlPattern: /\/api\/(plants|categories|insects)/,
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
