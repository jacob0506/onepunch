/* ════════════════════════════════════════════════════════════════
   幻卡传说 · 红点界面层（Stage 1 · C5）
   ────────────────────────────────────────────────────────────────
   只做一件事：把 domain/reddot.js 算出的 spot 集合映射到 DOM。
   任何地方想加红点，在对应元素上加 `data-dot="home gacha"` 即可，
   本文件自动接管显示/隐藏 —— 不要再造专用 id + 专用函数（TD-21 同类）。

   刷新时机：初始化 + 每 5 秒轮询 + 各操作后手动调 refreshRedDots()。
   （轮询是刻意的：红点不需要毫秒级实时，轮询比给每个业务函数插桩可靠。）
   ════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const TICK_MS = 5000;
  let timer = null;

  function refreshRedDots() {
    const api = window.__reddot;
    if (!api) return;
    api.refresh();
    const spots = api.getSpots();
    const nodes = document.querySelectorAll('[data-dot]');
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      const keys = String(el.getAttribute('data-dot') || '').split(/\s+/).filter(Boolean);
      const on = keys.some(k => spots.has(k));
      el.classList.toggle('hidden', !on);
    }
  }

  function initRedDot() {
    refreshRedDots();
    if (timer) return;
    timer = window.setInterval(refreshRedDots, TICK_MS);
  }

  const api = { refreshRedDots, initRedDot };
  const segs = 'Game.ui.reddot'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__reddotUI = api;

  window.refreshRedDots = refreshRedDots;
  window.initRedDot = initRedDot;
})();
