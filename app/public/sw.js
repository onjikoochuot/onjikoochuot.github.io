// Viko service worker: app shell offline, network-first for pages, cache-first for built assets. Market data is never cached here.
const CACHE = "viko-v1.0.1";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./index.html", "./manifest.webmanifest", "./icon-192.png"]))); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (e.request.mode === "navigate") { e.respondWith(fetch(e.request).then((r) => { caches.open(CACHE).then((c) => c.put("./index.html", r.clone())); return r; }).catch(() => caches.match("./index.html"))); return; }
  if (u.pathname.includes("/assets/")) e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { const cl = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cl)); return r; })));
});
