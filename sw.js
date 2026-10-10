// Offline shell: network first so updates land immediately, cache as fallback for the gym basement.
const CACHE = "infinity-v12";
const SHELL = ["./", "index.html", "styles.css", "app.js", "data.js", "food.js", "native.js", "calendar.js", "fonts.css", "fonts/Barlow-400.woff2", "fonts/Barlow-500.woff2", "fonts/Barlow-600.woff2", "fonts/BarlowCondensed-500.woff2", "fonts/BarlowCondensed-600.woff2", "fonts/BarlowCondensed-700.woff2", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !fonts) return; // videos stream from YouTube, never cached
  e.respondWith(
    fetch(req)
      .then((res) => { if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
