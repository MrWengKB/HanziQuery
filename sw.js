/*
 * 离线缓存（Service Worker）
 * - 网页、脚本、样式、CSV：优先联网获取最新版，没网或太慢时用缓存 → 改网页后用户会自动拿到新版
 * - 字体文件：优先用缓存（文件大、很少改）。如果更换了字体，把下面的 FONT_CACHE 版本号加 1
 * - 拼音音频（audio/ 目录）：第一次点播放时下载并缓存，之后离线也能听。
 *   如果更换了音频包，把下面的 AUDIO_CACHE 版本号加 1
 */
const CORE_CACHE = 'hanzi-core';
const FONT_CACHE = 'hanzi-fonts-v1';
const AUDIO_CACHE = 'hanzi-audio-v1';
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
  'README.md'
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
        keys.filter(k =>
          (k.startsWith('hanzi-fonts-') && k !== FONT_CACHE) ||
          (k.startsWith('hanzi-audio-') && k !== AUDIO_CACHE)
        ).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/audio/')) {
    event.respondWith(audioCacheFirst(req, url));
  } else if (url.pathname.endsWith('.ttf')) {
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

// 音频：缓存优先，第一次播放时下载完整文件存起来
// 注意：<audio> 会发带 Range 头的请求（尤其是 iOS Safari），
// 而缓存不能直接存「部分内容」，所以这里总是下载完整文件，再按需切出请求的那一段返回
async function audioCacheFirst(req, url) {
  const cache = await caches.open(AUDIO_CACHE);
  const key = url.origin + url.pathname; // 忽略 ?v= 之类的参数
  let res = await cache.match(key);
  if (!res) {
    res = await fetch(key); // 不带 Range，拿完整文件
    if (res.status !== 200) return res; // 404 等不缓存
    await cache.put(key, res.clone());
  }
  return withRange(req, res);
}

// 如果请求带 Range 头，返回 206 部分内容；否则原样返回
async function withRange(req, res) {
  const range = req.headers.get('range');
  if (!range) return res;

  const buf = await res.arrayBuffer();
  const total = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = 0;
  let end = total - 1;
  if (m) {
    if (m[1]) {
      start = Number(m[1]);
      if (m[2]) end = Math.min(Number(m[2]), total - 1);
    } else if (m[2]) { // bytes=-500：最后 500 字节
      start = Math.max(total - Number(m[2]), 0);
    }
  }
  if (start > end || start >= total) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes'
    }
  });
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
