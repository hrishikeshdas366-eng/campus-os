// Campus OS service worker — keeps the app opening offline, and shows reminder notifications.
// Strategy: network first (so a new deploy is always picked up), cached copy when offline.
const CACHE = "campus-os-v1";
const SHELL = ["./", "index.html", "css/app.css", "js/app.js", "assets/icon.svg", "assets/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;   // never touch Firebase, CDNs or the local API
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), 6000))]);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (_) {
      const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === "navigate" ? await cache.match("index.html") || await cache.match("./") : null);
      return hit || Response.error();
    }
  })());
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) { await c.focus(); try { c.postMessage({ type: "go", url: target }); } catch (_) { /* ignore */ } return; }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
