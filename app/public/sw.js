// Viko service worker: app shell offline, network-first for pages, cache-first for built assets. Market data is never cached here.
const CACHE = "viko-v1.4.0";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./index.html", "./manifest.webmanifest", "./icon-192.png"]))); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (e.request.mode === "navigate") { e.respondWith(fetch(e.request).then((r) => { caches.open(CACHE).then((c) => c.put("./index.html", r.clone())); return r; }).catch(() => caches.match("./index.html"))); return; }
  if (u.pathname.includes("/assets/")) e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { const cl = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cl)); return r; })));
});
// Trade alerts: shown even when Viko is closed.
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Viko", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Viko", { body: d.body || "", icon: "./icon-192.png", badge: "./icon-192.png", tag: d.tag, data: { url: d.url || "./#auto" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./#auto";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => { const c = cs.find((x) => "focus" in x); if (c) { c.navigate(url).catch(() => {}); return c.focus(); } return self.clients.openWindow(url); }));
});
