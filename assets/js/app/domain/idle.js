/**
 * idle.js —— 放置闭环的数值单源（C1 挂机 / C2 扫荡 / C3 收益可视化）
 *
 * ⚠️ 设计前提：在线挂机与离线收益**必须是同一套速率**，否则会出现两份互相漂移的
 *    数值（本项目历史上最大的 bug 来源）。因此 checkOfflineRewards / claimOfflineRewards
 *    （ui/offline.js）只是转发壳，真正计算全在本文件。
 *
 * ⚠️ 裸标识符依赖：本模块加载**早于**内联主脚本，只能读 gd() / stagesData /
 *    materialsData / equipmentData / inscriptionsData，且只能在函数体内读（模块顶层会 TDZ）。
 *    不改动任何战斗数值 —— `npm run check:numbers` 6 场快照不受影响。
 */
(() => {
  'use strict';

  const IDLE_CONFIG = {
    capHours: 12,          // 挂机/离线累积上限（睡一觉也吃满）
    baseClearSeconds: 20,  // 战力刚好达标时的单次清关耗时
    minSpeedFactor: 0.5,   // 战力远低于推荐 → 最多慢一半
    maxSpeedFactor: 3,     // 战力碾压 → 最多快 3 倍
    sweepMax: 10,
    sweepOptions: [1, 5, 10],
    tickMs: 30000,         // 面板刷新间隔
    redDotMinutes: 1       // 达到 1 分钟才亮红点
  };

  function clamp(n, a, b) {
    const x = Number(n);
    if (!Number.isFinite(x)) return a;
    return Math.max(a, Math.min(b, x));
  }

  /**
   * ⚠️ 铁律 5：内联顶层的 `let/const` **不会挂到 window**（只有 var / function 声明会）。
   *    gameData / stagesData / materialsData 都是 `let` ⇒ 必须用**裸标识符**读，
   *    写 gd() 只会拿到 undefined（本模块第一版就踩了这个坑）。
   *    又因为本模块加载早于内联脚本，裸标识符访问会命中 TDZ ⇒ 包 try/catch。
   */
  function gd() {
    try { return (typeof gameData !== 'undefined' && gameData) ? gameData : null; } catch (e) { return null; }
  }

  function dataList(name) {
    try {
      if (name === 'stagesData') return Array.isArray(stagesData) ? stagesData : [];
      if (name === 'materialsData') return Array.isArray(materialsData) ? materialsData : [];
      if (name === 'equipmentData') return Array.isArray(equipmentData) ? equipmentData : [];
      if (name === 'inscriptionsData') return Array.isArray(inscriptionsData) ? inscriptionsData : [];
    } catch (e) { /* 内联脚本尚未执行（TDZ） */ }
    const v = window[name];
    return Array.isArray(v) ? v : [];
  }

  function mulberry32(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6D2B79F5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(s) {
    let h = 2166136261;
    const str = String(s || '');
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /* ── 状态 ────────────────────────────────────────────────── */

  function ensureIdleState(target) {
    const d = target || gd();
    if (!d) return null;
    if (!d.idle || typeof d.idle !== 'object') d.idle = {};
    if (typeof d.idle.stageId !== 'string' || !d.idle.stageId) d.idle.stageId = d.currentStage || 'stage_001';
    // 老存档没有 idle 字段 —— 用 lastLogin 作为起点，升级后立刻能领到离线收益（不重复计）
    if (typeof d.idle.since !== 'number') {
      d.idle.since = (d.player && typeof d.player.lastLogin === 'number')
        ? d.player.lastLogin
        : new Date().getTime();
    }
    if (typeof d.idle.totalMinutes !== 'number') d.idle.totalMinutes = 0;
    return d.idle;
  }

  /** 挂机关卡：默认跟当前进度，推关后自动跟进 */
  function idleStage() {
    const d = gd();
    if (!d) return null;
    ensureIdleState(d);
    const list = dataList('stagesData');
    let st = list.find(s => s && s.id === d.idle.stageId);
    if (!st) st = list.find(s => s && s.id === d.currentStage);
    if (!st) st = list.find(s => s && typeof s.id === 'string' && s.id.startsWith('stage_')) || list[0] || null;
    return st || null;
  }

  function syncIdleStage() {
    const d = gd();
    if (!d || !d.currentStage) return idleStage();
    const idle = ensureIdleState(d);
    if (idle.stageId !== d.currentStage) idle.stageId = d.currentStage;
    return idleStage();
  }

  /* ── 速率 ────────────────────────────────────────────────── */

  function speedFactor(totalPower, recommendedPower) {
    const rec = Number(recommendedPower) || 1;
    const ratio = (Number(totalPower) || 0) / rec;
    return clamp(ratio, IDLE_CONFIG.minSpeedFactor, IDLE_CONFIG.maxSpeedFactor);
  }

  /** 材料 id（item_001）→ 存档 key（enhanceStone）；非材料返回 null */
  function materialKeyOf(itemId) {
    const m = dataList('materialsData').find(x => x && x.id === itemId);
    return m ? (m.key || m.id) : null;
  }

  function stageItemMeta(itemId) {
    const eq = dataList('equipmentData').find(i => i && i.id === itemId);
    if (eq) return { kind: 'equipment', data: eq };
    const ins = dataList('inscriptionsData').find(i => i && i.id === itemId);
    if (ins) return { kind: 'inscription', data: ins };
    const key = materialKeyOf(itemId);
    if (key) return { kind: 'material', key, data: dataList('materialsData').find(m => m && m.id === itemId) };
    return null;
  }

  /** 每分钟产出（挂机与离线共用） */
  function ratePerMinute(stage, totalPower) {
    const empty = { gold: 0, exp: 0, materials: {}, clearsPerMinute: 0 };
    if (!stage) return empty;
    const speed = speedFactor(totalPower, stage.recommendedPower);
    const clears = (60 / IDLE_CONFIG.baseClearSeconds) * speed;
    const rw = stage.rewards || {};
    const out = {
      gold: Math.floor((Number(rw.gold) || 0) * clears),
      exp: Math.floor((Number(rw.exp) || 0) * clears),
      materials: {},
      clearsPerMinute: Math.round(clears * 100) / 100
    };
    (rw.items || []).forEach(it => {
      const key = materialKeyOf(it.id);
      if (!key) return; // 装备/铭文不进挂机产出，避免背包爆炸
      const p = typeof it.dropRate === 'number' ? it.dropRate : 1;
      const q = (typeof it.quantity === 'number' ? it.quantity : 1) * p * clears;
      out.materials[key] = (out.materials[key] || 0) + q;
    });
    Object.keys(out.materials).forEach(k => {
      out.materials[k] = Math.round(out.materials[k] * 100) / 100;
    });
    return out;
  }

  /* ── 累积与领取 ──────────────────────────────────────────── */

  function getPending(nowMs) {
    const d = gd();
    if (!d || !d.player) return null;
    const now = Number(nowMs) || new Date().getTime();
    const idle = ensureIdleState(d);
    syncIdleStage();
    const stage = idleStage();
    const capMs = IDLE_CONFIG.capHours * 3600 * 1000;
    const elapsed = Math.max(0, now - idle.since);
    const capped = Math.min(elapsed, capMs);
    const minutes = Math.floor(capped / 60000);
    const power = (typeof window.calculateTotalPower === 'function') ? window.calculateTotalPower() : 0;
    const rate = ratePerMinute(stage, power);
    const rewards = {
      gold: Math.floor(rate.gold * minutes),
      exp: Math.floor(rate.exp * minutes),
      materials: {}
    };
    Object.keys(rate.materials).forEach(k => {
      const v = Math.floor(rate.materials[k] * minutes);
      if (v > 0) rewards.materials[k] = v;
    });
    return {
      stage,
      stageId: idle.stageId,
      minutes,
      elapsedMs: elapsed,
      cappedMs: capped,
      atCap: elapsed >= capMs,
      capHours: IDLE_CONFIG.capHours,
      rate,
      rewards,
      power,
      claimable: minutes > 0,
      redDot: minutes >= IDLE_CONFIG.redDotMinutes
    };
  }

  function claimIdle(nowMs) {
    const d = gd();
    if (!d) return { ok: false, reason: 'no-data' };
    const now = Number(nowMs) || new Date().getTime();
    const p = getPending(now);
    if (!p) return { ok: false, reason: 'no-data' };
    if (!p.claimable) return { ok: false, reason: 'empty', pending: p };

    d.player.gold = (Number(d.player.gold) || 0) + p.rewards.gold;
    d.player.exp = (Number(d.player.exp) || 0) + p.rewards.exp;

    const prog = window.__progression || (window.Game && window.Game.domain && window.Game.domain.progression);
    if (prog && typeof prog.ensurePlayerMaterials === 'function') prog.ensurePlayerMaterials(d);
    if (prog && typeof prog.applyMaterialsDelta === 'function') prog.applyMaterialsDelta(p.rewards.materials, d);

    // 只吃掉整分钟，零头继续累积；超过上限的部分直接丢弃
    d.idle.since = (d.idle.since || now) + p.minutes * 60000;
    d.idle.totalMinutes = (d.idle.totalMinutes || 0) + p.minutes;
    const capMs = IDLE_CONFIG.capHours * 3600 * 1000;
    if (now - d.idle.since > capMs) d.idle.since = now - capMs;
    d.player.lastLogin = now;

    if (prog && typeof prog.checkPlayerLevelUp === 'function') prog.checkPlayerLevelUp(d);
    else if (typeof checkPlayerLevelUp === 'function') checkPlayerLevelUp();
    // C5：埋点放在 domain 出口 —— 首页按钮走 bridge→ui/offline 转发壳、一键领取走
    // domain/quickOps，两条路径都经过这里，避免"某条路径漏记"（曾经漏过）。
    if (typeof window.bumpGoal === 'function') window.bumpGoal('idle_claim', 1);
    if (typeof window.saveGameProgress === 'function') window.saveGameProgress();
    return { ok: true, rewards: p.rewards, minutes: p.minutes, stage: p.stage };
  }

  /* ── 扫荡（C2） ──────────────────────────────────────────── */

  function sweepStage(stage, times, opts) {
    const d = gd();
    if (!d || !stage) return { ok: false, reason: 'no-stage' };
    const n = clamp(Math.floor(Number(times) || 1), 1, IDLE_CONFIG.sweepMax);
    const seed = (opts && typeof opts.seed === 'number')
      ? (opts.seed >>> 0)
      : ((hashString(stage.id) ^ (n * 7919) ^ ((d.idle && d.idle.totalMinutes) || 0)) >>> 0);
    const rand = mulberry32(seed);

    const total = { gold: 0, exp: 0, materials: {}, items: [] };
    for (let i = 0; i < n; i++) {
      const rw = stage.rewards || {};
      total.gold += Number(rw.gold) || 0;
      total.exp += Number(rw.exp) || 0;
      (rw.items || []).forEach(it => {
        const p = typeof it.dropRate === 'number' ? it.dropRate : 1;
        const qty = typeof it.quantity === 'number' ? it.quantity : 1;
        if (rand() >= p) return;
        const meta = stageItemMeta(it.id);
        if (!meta) return;
        if (meta.kind === 'material') {
          total.materials[meta.key] = (total.materials[meta.key] || 0) + qty;
        } else {
          const inst = Object.assign({}, meta.data, { uid: `${meta.data.id}_${Date.now()}_${i}` });
          if (meta.kind === 'equipment') d.equipment.push(inst);
          else d.inscriptions.push(inst);
          const ex = total.items.find(x => x.id === meta.data.id);
          if (ex) ex.qty += qty;
          else total.items.push({
            id: meta.data.id, name: meta.data.name, rarity: meta.data.rarity,
            qty, kind: meta.kind, iconUrl: meta.data.iconUrl || ''
          });
        }
      });
    }

    d.player.gold = (Number(d.player.gold) || 0) + total.gold;
    d.player.exp = (Number(d.player.exp) || 0) + total.exp;
    const prog = window.__progression || (window.Game && window.Game.domain && window.Game.domain.progression);
    if (prog && typeof prog.ensurePlayerMaterials === 'function') prog.ensurePlayerMaterials(d);
    if (prog && typeof prog.applyMaterialsDelta === 'function') prog.applyMaterialsDelta(total.materials, d);
    if (prog && typeof prog.checkPlayerLevelUp === 'function') prog.checkPlayerLevelUp(d);
    else if (typeof checkPlayerLevelUp === 'function') checkPlayerLevelUp();
    // C5：扫荡次数记入今日目标（按实际次数，不是按钮次数）
    if (typeof window.bumpGoal === 'function') window.bumpGoal('sweep', n);
    if (typeof window.saveGameProgress === 'function') window.saveGameProgress();
    return { ok: true, times: n, stage, rewards: total };
  }

  /* ── 展示辅助 ────────────────────────────────────────────── */

  function formatDuration(ms) {
    const total = Math.max(0, Math.floor(Number(ms) || 0) / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = Math.floor(total % 60);
    if (h > 0) return `${h} 小时 ${m} 分`;
    if (m > 0) return `${m} 分 ${s} 秒`;
    return `${s} 秒`;
  }

  /** 材料 key → 展示名（单源：materialsData） */
  function materialName(key) {
    const m = dataList('materialsData').find(x => x && (x.key === key || x.id === key));
    return m ? m.name : key;
  }

  const api = {
    IDLE_CONFIG,
    ensureIdleState,
    idleStage,
    syncIdleStage,
    speedFactor,
    ratePerMinute,
    getPending,
    claimIdle,
    sweepStage,
    materialKeyOf,
    stageItemMeta,
    formatDuration,
    materialName,
    mulberry32
  };

  const segs = 'Game.domain.idle'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__idle = api;

  window.idleStage = idleStage;
  window.syncIdleStage = syncIdleStage;
  window.claimIdle = claimIdle;
  window.sweepStage = sweepStage;
})();
