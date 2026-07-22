/* 말랑 서비스워커 — 앱 셸 캐싱 (오프라인 실행 + 홈 화면 앱 경험) */

const CACHE = 'mallang-v1';
const ASSETS = [
  '.',
  'index.html',
  'css/style.css',
  'js/store.js',
  'js/sound.js',
  'js/mallang.js',
  'js/gif.js',
  'js/hero.js',
  'js/play.js',
  'js/app.js',
  'manifest.webmanifest',
  'assets/icon-180.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // 페이지 이동은 네트워크 우선(항상 최신), 실패 시 캐시
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
    );
    return;
  }

  // 정적 자원은 캐시 우선, 백그라운드 갱신
  e.respondWith(
    caches.match(req).then((cached) => {
      const refresh = fetch(req)
        .then((res) => {
          if (res.ok && new URL(req.url).origin === location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || refresh;
    })
  );
});
