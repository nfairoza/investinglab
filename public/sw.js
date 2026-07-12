// rukMoney service worker (M1.1 offline shell + M1.2 web push).
//
// Caching policy — the hard rule: NEVER cache /api/* (personal financial data).
//   - /api/*            → network-only (never touched by the SW cache).
//   - navigations       → network-first; on failure, serve the precached
//                          /offline page (honesty: nothing rather than stale
//                          balances). Successful HTML is not cached (auth/data).
//   - static assets     → stale-while-revalidate (fonts, images, _next static).
// Push receipt + deep-link on click (M1.2).

const CACHE = "rukmoney-shell-v1";
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/brand/maskable_icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname.startsWith("/art/") ||
    /\.(?:woff2?|ttf|otf|png|jpg|jpeg|svg|webp|avif|ico|css|js)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API: never cache — always hit the network (personal financial data).
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: network-first; offline → the precached offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((r) => r || new Response("Offline", { status: 503 }))),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request).then((res) => {
          if (res && res.ok) cache.put(request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      }),
    );
  }
});

// ── M1.2 web push ──
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || "rukMoney";
  const options = {
    body: data.body || "",
    icon: "/brand/maskable_icon.png",
    badge: "/brand/maskable_icon.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if (c.url.includes(url) && "focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
