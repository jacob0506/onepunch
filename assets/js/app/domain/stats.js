/* ════════════════════════════════════════════════════════════════
   幻卡传说 · 累计统计（Stage 1 · C8）—— 数值单源
   ────────────────────────────────────────────────────────────────
   为什么要有它：成就里有一半指标是「累计」型（累计召唤多少次、累计战斗
   胜利多少场），而存档里只有**当前状态**（现有角色、当前战力），没有历史
   计数。这里把历史计数集中到一个容器 `gameData.stats`，只增不减。

   埋点只有**一处**：domain/goals.js 的 bump() 内部顺带调用
   `stats.bumpFromEvent(event, n)`。因为 C5 已经把「抽卡 / 升级 / 战斗胜利 /
   领取挂机 / 扫荡」五个事件统一上报到 bumpGoal，所以这里零新增调用点 ——
   以后新增事件只要在 EVENT_KEYS 里补一行。

   ⚠️ 铁律 5：gameData 是 index.html 顶层的 `let`，**不挂 window**。
      取值必须走裸标识符（写 window.gameData 会 undefined），且本模块加载
      早于内联主脚本，只能在函数体内读。
   ════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  /** 事件名 → 需要累加的统计键（一个事件可累加多个键） */
  const EVENT_KEYS = {
    gacha: ['gachaTotal'],
    battle: ['battleWins'],
    levelup: ['levelUps'],
    sweep: ['sweeps'],
    idle_claim: ['idleClaims'],
    dispatch: ['dispatches']
  };

  /** 全部统计键（用于存档结构自检 / 界面展示） */
  const KEYS = ['gachaTotal', 'battleWins', 'levelUps', 'sweeps', 'idleClaims', 'dispatches'];

  function gd() {
    try { return (typeof gameData !== 'undefined' && gameData) ? gameData : null; }
    catch (e) { return null; }
  }

  /** 保证 stats 容器存在且所有键都是数字 */
  function ensure(target) {
    const d = target || gd();
    if (!d) return null;
    if (!d.stats || typeof d.stats !== 'object') d.stats = {};
    KEYS.forEach(k => { if (typeof d.stats[k] !== 'number' || !isFinite(d.stats[k])) d.stats[k] = 0; });
    return d.stats;
  }

  /** 读一个计数值（不初始化，读不到就是 0） */
  function get(key, target) {
    const st = ensure(target);
    return st ? (Number(st[key]) || 0) : 0;
  }

  /**
   * 累加一个统计键。
   * @returns 累加后的值（无存档时返回 0）
   */
  function bump(key, n, target) {
    const st = ensure(target);
    if (!st || !key) return 0;
    const add = Number(n) || 0;
    if (!add) return st[key] || 0;
    st[key] = (Number(st[key]) || 0) + add;
    return st[key];
  }

  /**
   * 按事件名累加（bumpGoal 内部调用）。
   * @returns 实际累加的键数量
   */
  function bumpFromEvent(event, n, target) {
    const keys = EVENT_KEYS[event];
    if (!keys || !keys.length) return 0;
    const add = Math.max(0, Number(n) || 0);
    if (!add) return 0;
    keys.forEach(k => bump(k, add, target));
    return keys.length;
  }

  /** 快照（成就度量 / 调试面板用） */
  function snapshot(target) {
    const st = ensure(target);
    const out = {};
    KEYS.forEach(k => { out[k] = st ? (Number(st[k]) || 0) : 0; });
    return out;
  }

  const api = { EVENT_KEYS, KEYS, ensure, get, bump, bumpFromEvent, snapshot };

  const segs = 'Game.domain.stats'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__stats = api;
})();
