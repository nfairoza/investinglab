// Minimal service worker for web push (M1.2). Registered by the push opt-in
// flow. It does NOT cache anything — personal financial data must never be
// cached by a SW (the fuller offline-shell caching is Serwist, M1.1). This file
// only handles receiving a push and deep-linking on click.

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
      // Focus an existing tab on that URL if open; else open a new one.
      for (const c of clients) {
        if (c.url.includes(url) && "focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
