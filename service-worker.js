const CACHE_NAME = 'card-game-v3'; // 更新版本号以强制刷新
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './assets/data/characters.json',
  './assets/data/items.json',
  './assets/data/inscriptions.json',
  './assets/data/stages.json',
  './assets/sprites/虚空主宰·卡修斯.png',
  './assets/sprites/星海歌姬·莉莉丝.png',
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
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // 仅缓存有效的同域请求
        if (networkResponse && networkResponse.status === 200 && 
            (event.request.url.startsWith(self.location.origin) || 
             event.request.url.includes('cdn') || 
             event.request.url.includes('cdnjs'))) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
          });
        }
        return networkResponse;
      }).catch(() => {
        // 网络请求失败时，如果缓存也没有，可以返回兜底资源
        return cachedResponse;
      });

      // 优先返回缓存，后台发起网络请求更新缓存
      return cachedResponse || fetchPromise;
    })
  );
});
