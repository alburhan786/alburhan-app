// Al Burhan Tours & Travels — Service Worker v5.0 (Caching + FCM Push)
const CACHE = "alburhan-v5";
const STATIC = ["/manifest.json"];

// Install — cache static shell
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

// Activate — wipe old caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || !url.origin.includes(self.location.hostname)) return;

  const devPaths = ["/@vite", "/@react-refresh", "/@fs", "/src/", "/node_modules/", "/__vite"];
  if (devPaths.some(p => url.pathname.startsWith(p))) return;

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

// ── Push Notifications (VAPID + Firebase FCM) ────────────────────────────────
// FCM sends: { notification: { title, body, icon }, data: { url } }
// Legacy VAPID sends: { title, body, url, icon }
self.addEventListener("push", event => {
  if (!event.data) return;

  let raw = {};
  try { raw = event.data.json(); } catch { return; }

  // Normalize both FCM nested format and flat legacy format
  const notif  = (raw.notification && typeof raw.notification === "object") ? raw.notification : {};
  const dat    = (raw.data && typeof raw.data === "object") ? raw.data : {};

  const title = notif.title || raw.title || "Al Burhan Tours & Travels";
  const body  = notif.body  || raw.body  || "You have a new notification.";
  const url   = dat.url     || raw.url   || notif.click_action || "/customer/dashboard";
  const icon  = notif.icon  || dat.icon  || raw.icon || "/opengraph.jpg";

  const options = {
    body,
    icon,
    badge: "/favicon.ico",
    tag: dat.tag || raw.tag || "alburhan",
    renotify: true,
    requireInteraction: false,
    data: { url },
  };
  if (notif.image) options.image = notif.image;

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click: open correct page ─────────────────────────────────────
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification.data?.url || "/customer/dashboard";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      // Focus existing window at that path
      const target = list.find(c => c.url.includes(new URL(url, self.location.origin).pathname));
      if (target && "focus" in target) { target.focus(); return; }
      // Focus any open window and navigate
      const any = list.find(c => "focus" in c);
      if (any) { any.focus(); if ("navigate" in any) any.navigate(url); return; }
      // Open new window
      return clients.openWindow(url);
    })
  );
});

// Message from main thread (e.g. SKIP_WAITING)
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
