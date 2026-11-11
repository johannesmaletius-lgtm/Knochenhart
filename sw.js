// Offline cache. The page itself is loaded from the network first (so an update shows up at once)
// and only falls back to the cache offline; fonts, icons and libraries are served from the cache.
const CACHE = 'volleyskull-premium-7';
const ASSETS = ["./", "index.html", "js/engine.js", "js/skills.js", "js/ai.js", "js/ui.js", "js/shop.js", "js/profile.js", "js/mp.js", "js/render.js", "js/main.js", "manifest.webmanifest", "icons/favicon-32.png", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "fonts/silkscreen-400-latin.woff2", "fonts/silkscreen-700-latin.woff2", "fonts/jersey10-latin.woff2", "lib/trystero.min.js"];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const page = req.mode === 'navigate' || /\/$|\.html$|\.js$|\.webmanifest$/.test(url.pathname);
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(page ? new Request(req, { cache: 'no-cache' }) : req).then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    });
    if (page) return net.catch(() => hit || caches.match('index.html'));
    return hit || net.catch(() => hit);
  }));
});
