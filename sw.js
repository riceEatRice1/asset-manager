const CACHE_NAME = 'asset-manager-v14';
const CDN_CACHE = 'asset-manager-cdn-v14';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/router.js',
  './js/db.js',
  './js/views/dashboard.js',
  './js/views/statistics.js',
  './js/views/account-detail.js',
  './js/views/components.js',
  './js/utils/format.js',
  './js/utils/charts.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/bank-icbc.svg',
  './icons/bank-abc.svg',
  './icons/bank-ningbo.svg',
  './icons/bank-cmb.svg',
  './icons/bank-web.svg',
  './icons/bank-other.svg',
  './icons/alipay.svg',
  './icons/wechat.svg',
  './icons/cash.svg',
  './icons/invest.svg',
  './icons/custom.svg'
];

const CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/dexie@3.2.7/dist/dexie.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js'
];

// Install: pre-cache app shell and CDN resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
      caches.open(CDN_CACHE).then((cache) => cache.addAll(CDN_URLS))
    ]).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME && name !== CDN_CACHE)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        // Don't cache non-ok responses
        if (!response || response.status !== 200) return response;

        const responseClone = response.clone();
        const cacheName = request.url.includes('cdn.jsdelivr.net') ? CDN_CACHE : CACHE_NAME;
        caches.open(cacheName).then((cache) => cache.put(request, responseClone));

        return response;
      }).catch(() => {
        // For navigation requests, return cached index.html
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
