const CACHE_NAME = 'card-game-v26';
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
  './assets/js/app/dev.js',
  './assets/js/app/bridge.js',
  './assets/js/app/core/logger.js',
  './assets/js/app/core/format.js',
  './assets/js/app/core/names.js',
  './assets/js/app/core/storage.js',
  './assets/js/app/data/loader.js',
  './assets/js/app/ui/materials.js',
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
  './assets/js/app/battle/vfx.js',
  './assets/js/app/battle/boss_mechanics.js',
  './assets/js/app/battle/rewards.js?v=26',
  './assets/js/app/battle/scene.js?v=26',
  // ── P5（2026-09-12）从 index.html 内联主脚本搬出的 9 个模块 ──
  './assets/js/app/data/bootstrap.js?v=26',
  './assets/js/app/data/characters.js?v=26',
  './assets/js/app/data/stage_expand.js?v=26',
  './assets/js/app/domain/character_ops.js?v=26',
  './assets/js/app/ui/home.js?v=26',
  './assets/js/app/ui/character_view.js?v=26',
  './assets/js/app/battle/loadout_text.js?v=26',
  './assets/js/app/battle/fallback_hud.js?v=26',
  './assets/js/app/debug/cheats.js?v=26',
  // 品牌素材（背景 / Logo / 抽卡横幅 / PWA 图标），由 tools/gen-brand.mjs 生成
  './assets/brand/bg-space.svg',
  './assets/brand/stardust.svg',
  './assets/brand/logo.svg',
  './assets/brand/gacha-single.svg',
  './assets/brand/gacha-ten.svg',
  './assets/brand/favicon.svg',
  './assets/brand/icon-192.png',
  './assets/brand/icon-512.png',
  './assets/brand/icon-512.svg',
  './assets/brand/apple-touch-icon.png',
  './assets/sprites/虚空主宰·卡修斯.png',
  './assets/sprites/星海歌姬·莉莉丝.png',
  './assets/items/material_enhance_stone.svg',
  './assets/items/material_inscription_dust.svg',
  './assets/items/material_reforge_dust.svg',
  './assets/items/material_lock_crystal.svg',
  './assets/icon/rogue.svg',
  './assets/icon/sinusoidal-beam.svg',
  // 装备图标（33 个，SVG 体积极小，适合预缓存）
  './assets/items/不屈战盔.svg',
  './assets/items/不灭之盾.svg',
  './assets/items/冠冕·日曜.svg',
  './assets/items/反伤肩甲.svg',
  './assets/items/命运王冠.svg',
  './assets/items/复生胸针.svg',
  './assets/items/大魔导师之戒.svg',
  './assets/items/审判徽章.svg',
  './assets/items/屠戮长刃.svg',
  './assets/items/屠龙宝刀.svg',
  './assets/items/影舞披风.svg',
  './assets/items/新手木剑.svg',
  './assets/items/时之靴.svg',
  './assets/items/星辉吊坠.svg',
  './assets/items/暗影之刃.svg',
  './assets/items/核心调谐器.svg',
  './assets/items/治愈坠饰.svg',
  './assets/items/深渊徽记.svg',
  './assets/items/猎魂匕首.svg',
  './assets/items/疾影披风.svg',
  './assets/items/疾风之靴.svg',
  './assets/items/相位战靴.svg',
  './assets/items/破旧布甲.svg',
  './assets/items/终焉之刃.svg',
  './assets/items/虚空护心镜.svg',
  './assets/items/虚空法杖.svg',
  './assets/items/血誓护符.svg',
  './assets/items/裂界长弓.svg',
  './assets/items/诡术面具.svg',
  './assets/items/踏风轻履.svg',
  './assets/items/银纹头盔.svg',
  './assets/items/镇心斗篷.svg',
  './assets/items/龙骨重铠.svg',
  // 铭文图标（15 个）
  './assets/inscriptions/不屈铭文.svg',
  './assets/inscriptions/反击铭文.svg',
  './assets/inscriptions/嗜血铭文.svg',
  './assets/inscriptions/坚毅铭文.svg',
  './assets/inscriptions/复苏铭文.svg',
  './assets/inscriptions/幻影铭文.svg',
  './assets/inscriptions/灵魄铭文.svg',
  './assets/inscriptions/狂暴铭文.svg',
  './assets/inscriptions/猩红铭文.svg',
  './assets/inscriptions/玄甲铭文.svg',
  './assets/inscriptions/破军铭文.svg',
  './assets/inscriptions/追猎铭文.svg',
  './assets/inscriptions/镇魂铭文.svg',
  './assets/inscriptions/雷鸣铭文.svg',
  './assets/inscriptions/魅惑铭文.svg',
  // 第三方库（本地化，见 tools/vendor-cdn.mjs）—— 必须预缓存，否则离线时会退化成无样式
  './assets/vendor/tailwind/tailwind.js?v=26',
  './assets/vendor/font-awesome/css/font-awesome.min.css?v=26',
  './assets/vendor/font-awesome/fonts/fontawesome-webfont.woff2?v=4.7.0',
  './assets/vendor/font-awesome/fonts/fontawesome-webfont.woff?v=4.7.0'
];

self.addEventListener('message', (event) => {
  if (!event || !event.data) return;
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

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
      const url = event.request && event.request.url ? String(event.request.url) : '';
      const isSameOrigin = url.startsWith(self.location.origin);
      const shouldBypassCache = isSameOrigin && (url.includes('/assets/js/') || url.includes('/assets/data/') || url.endsWith('.js') || url.endsWith('.json'));
      const req = shouldBypassCache ? new Request(event.request, { cache: 'no-store' }) : event.request;
      const fetchPromise = fetch(req).then((networkResponse) => {
        // 项目已无任何跨域资源（CDN 全部本地化），因此只缓存同源响应
        if (networkResponse && networkResponse.status === 200 &&
          event.request.url.startsWith(self.location.origin)) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);
      return fetchPromise || cachedResponse;
    })
  );
});
