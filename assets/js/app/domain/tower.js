/**
 * tower.js —— 无尽塔赛季化唯一数值源（C10，2026-09-14）
 *
 * 设计（阿靖拍板：手动重置制）：
 *  - `gameData.tower.floor` / `bestFloor` 仍是「当前赛季」进度 —— 战斗结算
 *    （battle/fallback_hud.js 胜利分支）**零改动**。
 *  - 新增 `tower.seasonNo`（从 1 起）与 `tower.history[]`（历史赛季档案，
 *    纯本地"排行"：第 N 赛季 · 最远层数 · 起止时间）。
 *  - 重置 = 归档本季 → 发结算奖励（最远层数 × 10 钻石，需 ≥30 层）→
 *    floor/bestFloor 清零、seasonNo+1。无时间周期，离线不会被强制重置。
 *
 * ⚠️ 本模块加载早于内联主脚本：顶层只做函数定义，读写 gameData 一律在函数体内。
 * 对外：Game.domain.tower + window.__tower。
 */
(() => {
  'use strict';

  const RESET_MIN_BEST = 30;   // 最远层数达到才可重置（防开局误触清进度）
  const GEMS_PER_FLOOR = 10;   // 结算奖励：最远层数 × 10 钻石

  function td() {
    if (typeof gameData === 'undefined' || !gameData) return null;
    if (!gameData.tower || typeof gameData.tower !== 'object') gameData.tower = {};
    return gameData.tower;
  }

  /** 迁移旧档：补 seasonNo / history / startedAt（幂等，可反复调用） */
  function ensure() {
    const t = td();
    if (!t) return null;
    if (typeof t.floor !== 'number') t.floor = 1;
    if (typeof t.bestFloor !== 'number') t.bestFloor = 0;
    if (typeof t.seasonNo !== 'number' || t.seasonNo < 1) t.seasonNo = 1;
    if (!Array.isArray(t.history)) t.history = [];
    if (typeof t.startedAt !== 'number') t.startedAt = Date.now();
    return t;
  }

  /** 结算奖励预览（纯函数，不动档） */
  function seasonReward(bestFloor) {
    const b = Math.max(0, Number(bestFloor) || 0);
    return { gems: b < RESET_MIN_BEST ? 0 : b * GEMS_PER_FLOOR };
  }

  function canReset() {
    const t = ensure();
    return !!t && t.bestFloor >= RESET_MIN_BEST;
  }

  /** 历史最高层（含当前赛季）—— 成就 metric 用这个，不受重置影响 */
  function historyBest() {
    const t = ensure();
    if (!t) return 0;
    let best = t.bestFloor || 0;
    (t.history || []).forEach(h => { best = Math.max(best, Number(h.bestFloor) || 0); });
    return best;
  }

  /**
   * 重置赛季：归档 + 发奖 + 开新赛季。
   * @returns {{ok:boolean, reason?:string, archived?:object, granted?:string[]}}
   */
  function resetSeason() {
    const t = ensure();
    if (!t) return { ok: false, reason: 'no_save' };
    if (t.history.some(h => h && h.seasonNo === t.seasonNo)) {
      // 防御：本季已在档案里（重复重置/存档回滚），拒绝而非双份发奖
      return { ok: false, reason: 'already_archived' };
    }
    if (t.bestFloor < RESET_MIN_BEST) return { ok: false, reason: 'min_floor' };

    const reward = seasonReward(t.bestFloor);
    const archived = {
      seasonNo: t.seasonNo,
      bestFloor: t.bestFloor,
      startedAt: t.startedAt || Date.now(),
      endedAt: Date.now(),
      rewardGems: reward.gems
    };
    t.history.push(archived);

    const grant = (window.__goals && typeof window.__goals.grant === 'function')
      ? window.__goals.grant
      : null;
    const granted = grant ? grant({ gems: reward.gems }) : [];

    t.floor = 1;
    t.bestFloor = 0;
    t.pageBase = 1;
    t.seasonNo += 1;
    t.startedAt = Date.now();

    if (typeof saveGameProgress === 'function') saveGameProgress();
    return { ok: true, archived, granted };
  }

  /** 界面摘要（ui/stages.js 的「赛季档案」弹窗用） */
  function summary() {
    const t = ensure();
    if (!t) return null;
    return {
      seasonNo: t.seasonNo,
      floor: t.floor || 1,
      bestFloor: t.bestFloor || 0,
      startedAt: t.startedAt || Date.now(),
      canReset: t.bestFloor >= RESET_MIN_BEST,
      resetMin: RESET_MIN_BEST,
      reward: seasonReward(t.bestFloor),
      history: (t.history || []).slice().sort((a, b) => (b.seasonNo || 0) - (a.seasonNo || 0))
    };
  }

  const api = { ensure, seasonReward, canReset, resetSeason, historyBest, summary, RESET_MIN_BEST, GEMS_PER_FLOOR };
  const segs = 'Game.domain.tower'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__tower = api;
})();
