/* ════════════════════════════════════════════════════════════════
   幻卡传说 · 红点框架（Stage 1 · C5）—— 唯一真相源
   ────────────────────────────────────────────────────────────────
   为什么要有它：C1 的挂机红点是**就地**写在 ui/idle.js 里的
   （updateIdleRedDot 直接 toggle #idleRedDot），每加一处红点就要
   再写一个专用函数 + 一个 id，最终变成"红点各写各的"。这里把它们
   统一成「规则注册 + 广播」：

     register(key, spots, fn)   fn() 返回 true = 该规则亮
     refresh()                  重算全部规则 → 通知订阅者
     getSpots()                 当前亮着的 spot 集合（页面 id）

   界面层（ui/reddot.js）只做一件事：把 spot 映射到 [data-dot] 元素。

   ⚠️ 铁律：fn 必须便宜且**无副作用**（refresh 会被定时器反复调用）。
      fn 抛错只让该规则熄灭，不影响其它规则（catch 掉）。
   ⚠️ 铁律 5：gameData / GAME_CONFIG 是顶层 let/const，不挂 window，
      取值用裸标识符（直接写 gameData 即可，不要写 window.gameData）。
   ════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const rules = [];        // [{ key, spots, fn }]
  const subs = [];         // [fn(spots, keys)]
  let spotsCache = new Set();
  let keysCache = new Set();

  /** key 唯一，重复注册覆盖旧规则（模块热重载/重复引入不会叠加） */
  function register(key, spots, fn) {
    if (!key || typeof fn !== 'function') return;
    const list = Array.isArray(spots) ? spots : [spots];
    const exist = rules.filter(r => r.key === key)[0];
    if (exist) { exist.spots = list; exist.fn = fn; return; }
    rules.push({ key, spots: list, fn });
  }

  function unregister(key) {
    for (let i = rules.length - 1; i >= 0; i--) {
      if (rules[i].key === key) rules.splice(i, 1);
    }
  }

  /** 重算所有规则，更新缓存并广播 */
  function refresh() {
    const spots = new Set();
    const keys = new Set();
    rules.forEach(r => {
      let on = false;
      try { on = !!r.fn(); } catch (e) { on = false; }
      if (!on) return;
      keys.add(r.key);
      r.spots.forEach(s => { if (s) spots.add(s); });
    });
    spotsCache = spots;
    keysCache = keys;
    subs.forEach(fn => {
      try { fn(spotsCache, keysCache); } catch (e) { /* 订阅者自己挂了不影响广播 */ }
    });
    return { spots: spotsCache, keys: keysCache };
  }

  const getSpots = () => spotsCache;
  const getKeys = () => keysCache;
  const hasSpot = (spot) => !!spot && spotsCache.has(spot);
  const hasKey = (key) => !!key && keysCache.has(key);

  function subscribe(fn) {
    if (typeof fn === 'function') subs.push(fn);
    return () => {
      const i = subs.indexOf(fn);
      if (i >= 0) subs.splice(i, 1);
    };
  }

  /* ── 内置规则 ──────────────────────────────────────────────
     新增红点：在这里加一条 register 即可，界面层无需改动。

     ⚠️ 红点语义 =「这里有你可以**领取/回收**的东西」。
        不要注册"常亮"规则（如"钻石够抽一次""还有下一关可打"）——
        那会让红点 100% 亮着，等于没有红点（红点疲劳）。
        下面是历史尝试过的反例，保留作参考，不要再启用：

        // ❌ register('gacha', ['gacha'], () => gems >= 单抽价);   // 永远亮
        // ❌ register('characters', ['characters'], () => 有角色升得起); // 永远亮
        // ❌ register('stages', ['stages'], () => 还有下一关);      // 永远亮
     */

  // 挂机收益可领取（数值来自 domain/idle.js 单源）
  register('idle', ['home'], () => {
    const idle = window.__idle;
    if (!idle || typeof idle.getPending !== 'function') return false;
    const p = idle.getPending();
    return !!(p && p.claimable);
  });

  // 每日目标有可领奖励
  register('goals', ['home'], () => {
    const g = window.__goals;
    if (!g || typeof g.hasClaimable !== 'function') return false;
    return !!g.hasClaimable();
  });

  /* ── 导出 ─────────────────────────────────────────────────── */

  const api = {
    register, unregister, refresh, subscribe,
    getSpots, getKeys, hasSpot, hasKey,
    ruleKeys: () => rules.map(r => r.key)
  };

  const segs = 'Game.domain.reddot'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__reddot = api;
})();
