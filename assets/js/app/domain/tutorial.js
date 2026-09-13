/**
 * tutorial.js —— 新手引导唯一状态源（Stage 1 · C11）
 *
 * 设计前提：
 *   · 步骤定义在 assets/data/tutorial.json（铁律 1：改文案/顺序只改 JSON）。
 *   · **事件驱动、非强制**：每步只给「去哪儿 + 干什么」，玩家自己做到就算过
 *     （判定 = metric 当前值 ≥ target）。不锁 UI、不阻断操作，随时可跳过。
 *     放置类单机的引导一旦锁死操作，玩家只会想关掉它。
 *   · 状态存 gameData.tutorial：{ v, active, skipped, finished, claimed, done[] }
 *   · **老存档不打扰**：ensure() 见到没有 tutorial 字段的老档 → 直接判定 finished
 *     （人家早就会玩了，弹引导是纯骚扰）。想重看走 ui 的 restart()。
 *
 * ⚠️ 裸标识符依赖（铁律 5）：gameData 是内联顶层 `let`，不挂 window，
 *    一律 try/catch 包 TDZ；本模块加载早于内联主脚本。
 */
(() => {
  'use strict';

  /* 兜底步骤：与 tutorial.json 同值（JSON 加载失败时引导照常可用） */
  const FALLBACK = {
    version: 1,
    finishTitle: '出师',
    finishText: '核心循环你已经全走通了：升级 → 召唤 → 推关 → 扫荡 → 挂机。剩下的就是变强。',
    finishReward: { gems: 300, gold: 5000 },
    steps: [
      { id: 'welcome', title: '欢迎来到幻卡传说', text: '跟着引导走 2 分钟，把核心循环过一遍。', page: 'home', anchor: '', metric: 'manual', target: 1 },
      { id: 'levelup', title: '第一步 · 一键升级', text: '去养成页点「一键升级」用掉攒下的经验。', page: 'characters', anchor: '#quickLevelUp', metric: 'levelUps', target: 1 },
      { id: 'gacha', title: '第二步 · 召唤伙伴', text: '来一发单抽。', page: 'gacha', anchor: '#singleGacha', metric: 'gachaTotal', target: 1 },
      { id: 'battle', title: '第三步 · 打第一关', text: '挑战「新手村外围」。', page: 'stages', anchor: '[data-stage="stage_001"]', metric: 'mainCleared', target: 1 },
      { id: 'sweep', title: '第四步 · 扫荡囤资源', text: '通关过的关卡可直接扫荡。', page: 'stages', anchor: '[data-sweep]', metric: 'sweeps', target: 1 },
      { id: 'idle', title: '最后一步 · 挂机收益', text: '离线也在打钱，回来记得领。', page: 'home', anchor: '#claimOfflineRewards', metric: 'idleClaims', target: 1 }
    ]
  };

  function data() {
    try {
      return (typeof tutorialData !== 'undefined' && tutorialData && Array.isArray(tutorialData.steps))
        ? tutorialData
        : FALLBACK;
    } catch (e) { return FALLBACK; }
  }

  function gd() {
    try { return (typeof gameData !== 'undefined' && gameData) ? gameData : null; } catch (e) { return null; }
  }

  function statVal(key) {
    const st = window.__stats;
    if (!st || typeof st.get !== 'function') return 0;
    return Number(st.get(key)) || 0;
  }

  /* ── 度量：每步的"做到了没"判定（纯函数，不写盘）────────────── */
  const METRICS = {
    /** manual：不由状态判定，只能 UI 显式 complete()（如欢迎页点「开始」） */
    manual: () => 0,
    formationCount: () => {
      const d = gd();
      if (!d || !Array.isArray(d.formation)) return 0;
      return d.formation.filter(x => !!x).length;
    },
    mainCleared: () => {
      const d = gd();
      if (!d) return 0;
      let ms = [];
      try {
        ms = (typeof stagesData !== 'undefined' && Array.isArray(stagesData))
          ? stagesData.filter(s => s && s.id && !String(s.id).startsWith('daily_') && !String(s.id).startsWith('tower_'))
          : [];
      } catch (e) { ms = []; }
      if (!ms.length) return 0;
      const i = ms.findIndex(s => s.id === d.currentStage);
      return i <= 0 ? 0 : i;
    },
    levelUps: () => statVal('levelUps'),
    gachaTotal: () => statVal('gachaTotal'),
    sweeps: () => statVal('sweeps'),
    idleClaims: () => statVal('idleClaims')
  };

  function metricValue(key) {
    const fn = METRICS[key];
    return fn ? (Number(fn()) || 0) : 0;
  }

  /* ── 状态 ─────────────────────────────────────────────────── */

  function ensure() {
    const d = gd();
    if (!d) return null;
    if (!d.tutorial || typeof d.tutorial !== 'object') {
      // 老存档（无 tutorial 字段）：判定为已完成，绝不打扰（想重看走 restart）
      d.tutorial = { v: 1, active: false, skipped: true, finished: true, claimed: true, done: [] };
    }
    const t = d.tutorial;
    if (typeof t.v !== 'number') t.v = 1;
    if (typeof t.active !== 'boolean') t.active = !t.finished;
    if (typeof t.skipped !== 'boolean') t.skipped = false;
    if (typeof t.finished !== 'boolean') t.finished = false;
    if (typeof t.claimed !== 'boolean') t.claimed = false;
    if (!Array.isArray(t.done)) t.done = [];
    return t;
  }

  function st() { return ensure(); }

  function steps() { return data().steps.slice(); }

  function stepOf(id) { return steps().filter(s => s && s.id === id)[0] || null; }

  function isDone(step) {
    if (!step) return true;
    const t = st();
    if (!t) return true;
    if (t.done.indexOf(step.id) >= 0) return true;
    if (step.metric === 'manual') return false;
    return metricValue(step.metric) >= (Number(step.target) || 1);
  }

  /** 当前该做的步骤（第一个未完成的） */
  function current() {
    const t = st();
    if (!t || t.finished || t.skipped) return null;
    const list = steps();
    for (const s of list) if (!isDone(s)) return s;
    return null;
  }

  /** 已完成的步骤 id 列表（含由 metric 判定为完成的） */
  function doneIds() {
    return steps().filter(isDone).map(s => s.id);
  }

  function progress() {
    const list = steps();
    const done = list.filter(isDone).length;
    return { done, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
  }

  function state() {
    const t = st() || {};
    const p = progress();
    const cur = current();
    return {
      v: t.v || 1,
      active: !!t.active,
      skipped: !!t.skipped,
      finished: !!t.finished,
      claimed: !!t.claimed,
      done: p.done,
      total: p.total,
      pct: p.pct,
      currentId: cur ? cur.id : null,
      current: cur
    };
  }

  /* ── 动作 ─────────────────────────────────────────────────── */

  /** 把「metric 已达成」的步骤落进 done[]，返回本次新完成的步骤 */
  function sync() {
    const t = st();
    if (!t || t.finished || t.skipped) return [];
    const fresh = [];
    steps().forEach(s => {
      if (!s) return;
      if (t.done.indexOf(s.id) >= 0) return;
      if (s.metric !== 'manual' && metricValue(s.metric) >= (Number(s.target) || 1)) {
        t.done.push(s.id);
        fresh.push(s);
      }
    });
    if (!current() && !t.finished) t.finished = true;
    return fresh;
  }

  /** 显式完成某步（仅 manual 类需要；其他步由 sync 自动判） */
  function complete(id) {
    const t = st();
    if (!t) return { ok: false, reason: 'no-data' };
    const s = stepOf(id);
    if (!s) return { ok: false, reason: 'no-step' };
    if (t.done.indexOf(id) < 0) t.done.push(id);
    sync();
    return { ok: true, step: s, state: state() };
  }

  /** 跳过引导（不再出现，不发奖） */
  function skip() {
    const t = st();
    if (!t) return { ok: false };
    t.active = false;
    t.skipped = true;
    t.finished = true;
    return { ok: true, state: state() };
  }

  /**
   * 重看引导 / 新档启用
   * @param {{fresh?: boolean}} opts fresh=true 连"已领过出师奖"一起清（只有**新档**能用，
   *        否则重看一次就能再领一次 300 钻，等于无限刷）。
   */
  function restart(opts) {
    const t = st();
    if (!t) return { ok: false };
    const fresh = !!(opts && opts.fresh);
    t.v = 1;
    t.active = true;
    t.skipped = false;
    t.finished = false;
    t.done = [];
    if (fresh) t.claimed = false;
    return { ok: true, state: state() };
  }

  /** 领出师奖（走 goals.grant 单一发奖通道，不另写加钱逻辑） */
  function claimFinish() {
    const t = st();
    if (!t) return { ok: false, reason: 'no-data' };
    if (!t.finished) return { ok: false, reason: 'unfinished' };
    if (t.claimed) return { ok: false, reason: 'claimed' };
    const rw = data().finishReward || {};
    const g = window.__goals;
    if (!g || typeof g.grant !== 'function') return { ok: false, reason: 'no-grant' };
    const given = g.grant(rw);
    t.claimed = true;
    t.active = false;
    return { ok: true, reward: rw, given: given || [] };
  }

  const api = {
    ensure, steps, stepOf, state, current, progress, doneIds,
    metricValue, sync, complete, skip, restart, claimFinish,
    finishInfo: () => ({ title: data().finishTitle, text: data().finishText, reward: data().finishReward })
  };

  // A3 命名空间契约（check-contract 盯着）
  const segs = 'Game.domain.tutorial'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__tutorial = api;
})();
