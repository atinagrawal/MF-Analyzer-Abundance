// Abundance MF Calculator — Service Worker
// Strategy:
//   - App shell (HTML/fonts/chart.js) → Cache-first, background refresh
//   - API calls (/api/*) → Network-only, never cache live fund data
//   - Everything else → Network-first, cache fallback

const CACHE_NAME = 'abundance-mf-v1';
const CACHE_URLS = [
  '/',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap',
];

// ── Install: pre-cache app shell ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing logic ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 1. Never cache API calls — always go to network
  if (url.pathname.startsWith('/api/')) {
    return; // browser default (network)
  }

  // 2. Never cache OG image endpoint
  if (url.pathname.startsWith('/og')) {
    return;
  }

  // 3. App shell (HTML) — Network-first, fall back to cache
  //    Ensures users always get the latest version when online
  if (e.request.mode === 'navigate' || e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Update cache in background
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('/')))
    );
    return;
  }

  // 4. Static assets (fonts, CDN scripts, images) — Cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // Only cache successful opaque/same-origin responses for static assets
        if (res && (res.status === 200 || res.type === 'opaque')) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
