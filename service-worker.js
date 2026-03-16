const CACHE_NAME = 'card-game-v4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './service-worker.js',
  './assets/data/characters.json',
  './assets/data/items.json',
  './assets/data/materials.json',
  './assets/data/inscriptions.json',
  './assets/data/stages.json',
  './assets/js/app/globals.js',
  './assets/js/app/bridge.js',
  './assets/js/app/core/logger.js',
  './assets/js/app/core/format.js',
  './assets/js/app/core/storage.js',
  './assets/js/app/data/loader.js',
  './assets/js/app/ui/navigation.js',
  './assets/js/app/ui/stages.js',
  './assets/js/app/ui/cultivate.js',
  './assets/js/app/ui/modals.js',
  './assets/js/app/ui/backpack.js',
  './assets/js/app/ui/item_picker.js',
  './assets/js/app/ui/inventory.js',
  './assets/js/app/ui/offline.js',
  './assets/js/app/ui/gacha.js',
  './assets/js/app/domain/character.js',
  './assets/js/app/domain/inventory.js',
  './assets/js/app/domain/progression.js',
  './assets/js/app/battle/report.js',
  './assets/js/app/battle/rewards.js',
  './assets/js/app/battle/scene.js',
  './assets/sprites/虚空主宰·卡修斯.png',
  './assets/sprites/星海歌姬·莉莉丝.png',
  './assets/items/material_enhance_stone.svg',
  './assets/items/material_inscription_dust.svg',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css'
];

// 安装阶段：缓存静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Caching assets');
      // 使用 map 逐个添加，防止其中一个失败导致全部失败
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url => cache.add(url))
      );
    })
  );
  self.skipWaiting();
});

// 激活阶段：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache');
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 请求拦截：缓存优先策略 (Stale-while-revalidate)
self.addEventListener('fetch', (event) => {
  const isNavigation = event.request.mode === 'navigate';
  if (isNavigation) {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
        });
        return networkResponse;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 &&
          (event.request.url.startsWith(self.location.origin) ||
            event.request.url.includes('cdn') ||
            event.request.url.includes('cdnjs'))) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);
      return cachedResponse || fetchPromise;
    })
  );
});
