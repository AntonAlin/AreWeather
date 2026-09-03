/* Offline shell. Only same-origin static files are cached here — the weather
   payloads are cached by the app itself in localStorage, where it can reason
   about how old they are and tell you. */

const CACHE = 'areweather-shell-v8';
const SHELL = [
  './', './index.html', './compare.html', './methods.html', './trip.html', './links.html', './warming.html', './outlook.html',
  './styles.css', './manifest.webmanifest',
  './js/main.js', './js/config.js', './js/util.js', './js/api.js',
  './js/physics.js', './js/ml.js', './js/forecast.js', './js/charts.js', './js/ui.js',
  './js/methods.js', './js/compare.js', './js/i18n.js', './js/observations.js',
  './js/climate.js', './js/trip.js', './js/links.js',
  './js/projection.js', './js/warming.js',
  './js/probability.js', './js/outlook.js', './404.html',
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
