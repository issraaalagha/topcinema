/**
 * TopCinema Service Worker
 * Enterprise-grade caching + Ad blocking for iframe embeds
 * @version 2.0.0
 */

const CACHE = 'topcinema-v2';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg'];

// Ad blocking patterns
const AD_PATTERNS = [
  /doubleclick\.net/i,
  /googleadservices\.com/i,
  /googlesyndication\.com/i,
  /pagead2\.googlesyndication/i,
  /advertising\.com/i,
  /adnxs\.com/i,
  /adsystem\.com/i,
  /analytics\.google\.com/i,
  /\/ads\//i,
  /\/banner/i,
  /\/popup/i,
  /clickadu\.com/i,
  /exoclick\.com/i,
  /popcash\.net/i,
  /propellerads\.com/i,
  /adsterra\.com/i,
  /popads\.net/i,
  /\/player\/ads\//i,
  /\/vast\.xml/i,
  /preroll/i,
  /midroll/i,
];

self.addEventListener('install', (e) => {
  console.log('[SW] Installing v2.0...');
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  console.log('[SW] Activating v2.0...');
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  
  // Block ads
  if (shouldBlockRequest(url.href)) {
    console.log('[SW] 🛡️ Blocked:', url.hostname);
    e.respondWith(new Response('', { status: 204 }));
    return;
  }

  // Video streaming: network-only (no cache)
  if (e.request.destination === 'video' || 
      url.pathname.includes('.m3u8') || 
      url.pathname.includes('.ts') ||
      url.pathname.includes('.mp4')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // API: network-first, fallback cache
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Static assets: cache-first
  if (e.request.method === 'GET' && url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then((hit) => {
        if (hit) return hit;
        return fetch(e.request).then((res) => {
          if (res.ok && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        });
      })
    );
  }
});

function shouldBlockRequest(url) {
  return AD_PATTERNS.some(pattern => pattern.test(url));
}

// Handle messages
self.addEventListener('message', (e) => {
  if (e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
