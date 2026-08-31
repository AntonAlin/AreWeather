/* Offline shell. Only same-origin static files are cached here — the weather
   payloads are cached by the app itself in localStorage, where it can reason
   about how old they are and tell you. */

const CACHE = 'areweather-shell-v2';
const SHELL = [
  './', './index.html', './methods.html', './styles.css', './manifest.webmanifest',
  './js/main.js', './js/config.js', './js/util.js', './js/api.js',
  './js/physics.js', './js/ml.js', './js/forecast.js', './js/charts.js', './js/ui.js',
  './js/methods.js',
  './fonts/inter-latin.woff2', './fonts/jetbrains-mono-latin.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Network first so a deploy is picked up immediately, cache as the fallback.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html'))),
  );
});
