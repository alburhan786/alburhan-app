// Al Burhan Tours & Travels — Service Worker v4.0 (with Web Push)
const CACHE = "alburhan-v3";
const STATIC = ["/manifest.json"];

// Install — cache static shell (NOT index.html — it must always be fresh)
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

// Activate — wipe ALL old caches (alburhan-v1, alburhan-v2, …)
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - API calls:        network-first (always fresh data)
// - index.html:       network-first with cache fallback (never serve stale app shell)
// - hashed JS/CSS:    cache-first (content-addressed, safe to cache forever)
// - everything else:  network-first with cache fallback
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // Skip non-GET and cross-origin
  if (e.request.method !== "GET" || !url.origin.includes(self.location.hostname)) return;

  // Vite dev server / source files: always network (never cache)
  const devPaths = ["/@vite", "/@react-refresh", "/@fs", "/src/", "/node_modules/", "/__vite"];
  if (devPaths.some(p => url.pathname.startsWith(p))) return;

  // API: network-first, no cache
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

  // index.html (and SPA routes): NETWORK-FIRST — must always load the latest app shell
  const isHtml = url.pathname === "/" || url.pathname === "/index.html" ||
    (!url.pathname.includes(".") && !url.pathname.startsWith("/api/"));
  if (isHtml) {
    e.respondWith(
      fetch(e.request, { cache: "no-cache" })
        .then(resp => {
          if (!resp || resp.status !== 200) return caches.match("/index.html") || resp;
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(new Request("/index.html"), clone));
          return resp;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Hashed static assets (JS/CSS with content hash in filename): cache-first, safe forever
  const isHashedAsset = /\.[0-9a-f]{8,}\.(js|css|woff2?|png|jpg|svg|ico)$/i.test(url.pathname);
  if (isHashedAsset) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(resp => {
          if (!resp || resp.status !== 200 || resp.type !== "basic") return resp;
          caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
          return resp;
        });
      })
    );
    return;
  }

  // Everything else: network-first with cache fallback
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then(resp => {
        if (!resp || resp.status !== 200 || resp.type !== "basic") return resp;
        caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── Web Push Notifications ─────────────────────────────────────────────────
self.addEventListener("push", event => {
  let data = { title: "Al Burhan Tours & Travels", body: "You have a new notification.", url: "/customer/dashboard" };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch { /* ignore parse error */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/imagesopengraph.jpg",
      badge: "/favicon.ico",
      tag: data.tag || "alburhan",
      renotify: true,
      requireInteraction: false,
      data: { url: data.url || "/customer/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification.data?.url || "/customer/dashboard";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ("focus" in client) { client.focus(); return; }
      }
      return clients.openWindow(url);
    })
  );
});
