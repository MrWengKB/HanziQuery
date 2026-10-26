/*
 * 离线缓存（Service Worker）
 * - 网页、脚本、样式、CSV：优先联网获取最新版，没网或太慢时用缓存 → 改网页后用户会自动拿到新版
 * - 字体文件：优先用缓存（文件大、很少改）。如果更换了字体，把下面的 FONT_CACHE 版本号加 1
 */
const CORE_CACHE = 'hanzi-core';
const FONT_CACHE = 'hanzi-fonts-v1';
const NETWORK_TIMEOUT_MS = 3000;

const CORE_FILES = [
  './',
  'index.html',
  'style.css',
  'hanzilist.csv',
  'js/parser.js',
  'js/modal.js',
  'js/app.js',
  'js/oracle.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];
const FONT_FILES = ['kaiti.ttf', 'FZ-oracle.ttf'];

self.addEventListener('install', event => {
  event.waitUntil(Promise.all([
    caches.open(CORE_CACHE).then(c => c.addAll(CORE_FILES.map(u => new Request(u, { cache: 'reload' })))),
    caches.open(FONT_CACHE).then(c => c.addAll(FONT_FILES))
  ]).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('hanzi-fonts-') && k !== FONT_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('.ttf')) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(networkFirst(req));
  }
});

// 字体：缓存优先
async function cacheFirst(req) {
  const cached = await caches.match(req, { ignoreSearch: true });
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) (await caches.open(FONT_CACHE)).put(req, res.clone());
  return res;
}

// 其他文件：联网优先，超时或失败时用缓存
async function networkFirst(req) {
  const cache = await caches.open(CORE_CACHE);
  const network = fetch(req, { cache: 'no-cache' }).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });

  const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch (e) { /* 没网，下面用缓存 */ }

  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;
  return network; // 缓存里也没有，只能继续等网络
}
