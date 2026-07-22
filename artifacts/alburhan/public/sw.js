// Al Burhan Tours & Travels — Service Worker v2.0
const CACHE = "alburhan-v2";
const STATIC = [
  "/",
  "/index.html",
  "/manifest.json",
];

// Install — cache static shell
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

// Activate — clean old caches (including stale alburhan-v1)
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - API calls: network-first (always fresh)
// - Vite dev / source files: network-only (never cache dynamic modules)
// - Static assets: cache-first with network fallback
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // Skip non-GET and cross-origin
  if (e.request.method !== "GET" || !url.origin.includes(self.location.hostname)) return;

  // API: network-first
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(e.request).then(r => r || new Response(JSON.stringify({ error: "Offline" }), {
          headers: { "Content-Type": "application/json" }
        }))
      )
    );
    return;
  }

  // Vite dev server / source files: always network (never cache)
  const devPaths = ["/@vite", "/@react-refresh", "/@fs", "/src/", "/node_modules/", "/__vite"];
  if (devPaths.some(p => url.pathname.startsWith(p))) {
    return; // pass through — do NOT intercept
  }

  // Static assets: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (!resp || resp.status !== 200 || resp.type !== "basic") return resp;
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return resp;
      }).catch(() => caches.match("/index.html")); // SPA fallback
    })
  );
});
