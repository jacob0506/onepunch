/**
 * season.js —— 赛季活动循环唯一数值源（E6，2026-09-16）
 *
 * 设计（框架 v1）：
 *  - 赛季 = 一段固定时长（season.json durationDays，默认 28 天）。**按日期滚动**：
 *    到点即归档本季 → 按达到的赛季等级发结算奖 → 开新季（level/claimed/任务清零）。
 *  - **零新增埋点**：赛季经验不另开计数器，而是读 `gameData.stats`（C8 累计统计，
 *    domain/stats.js）**相对本季基线的增量** × 权重。因此「战斗/扫荡/升级/抽卡/
 *    挂机/派驻/竞技场」七个系统天然全部喂赛季 —— 加新事件只要在 stats.EVENT_KEYS
 *    补一行，赛季自动吃到。
 *  - 每个赛季一个**主题**（themePool 按 seasonNo 确定性轮换）：主题名 + 标语 +
 *    赛季任务（同样按 stats 增量判定） + 赛季专属奖励。
 *  - 奖励轨 20 级，逐级 `claim` 走 `goals.grant` 发奖单源（禁自写加钱）。
 *  - 数值全确定性（无 Math.random）⇒ 不污染 snapshot-numbers。
 *
 * ⚠️ 铁律 5：gameData / seasonData 是 index.html 顶层的 let，**不挂 window**。
 *    本模块加载早于内联主脚本 ⇒ 只能在**函数体内**读写（模块顶层会命中 TDZ）。
 * 对外：Game.domain.season + window.__season。
 */
(() => {
  'use strict';

  const DEFAULT_DURATION_DAYS = 28;
  const MAX_ROLLOVER = 200;      // 一次 sync 最多补滚多少个赛季（防脏存档死循环）
  const DEFAULT_THEME = {
    id: 'theme_default', name: '无名之季', tagline: '', icon: 'fa-star',
    color: '#7dd3fc', desc: '', task: { name: '', desc: '', stat: 'battleWins', target: 1 }, reward: {}
  };

  function gd() {
    try { return (typeof gameData !== 'undefined' && gameData) ? gameData : null; }
    catch (e) { return null; }
  }

  /** season.json（加载失败时退回空壳：赛季退化为"无内容"，但不报错） */
  function cfg() {
    try {
      if (typeof seasonData !== 'undefined' && seasonData && typeof seasonData === 'object') return seasonData;
    } catch (e) { /* TDZ / 未定义 */ }
    return {};
  }

  function durationMs() {
    const n = Number(cfg().durationDays);
    return (n > 0 ? n : DEFAULT_DURATION_DAYS) * 86400000;
  }

  /** 结构迁移（幂等，纯结构、不涉时间；可反复调用） */
  function ensure(d) {
    const data = d || gd();
    if (!data) return null;
    if (!data.season || typeof data.season !== 'object') data.season = {};
    const s = data.season;
    if (typeof s.seasonNo !== 'number' || s.seasonNo < 1) s.seasonNo = 1;
    if (!Array.isArray(s.claimed)) s.claimed = [];
    if (!Array.isArray(s.history)) s.history = [];
    if (typeof s.taskClaimed !== 'boolean') s.taskClaimed = false;
    if (!s.baseline || typeof s.baseline !== 'object') s.baseline = null;   // 首次 sync 建立
    return s;
  }

  function statSnap(d) {
    const st = window.__stats;
    if (st && typeof st.snapshot === 'function') {
      try { return st.snapshot(d || undefined); } catch (e) { /* fallthrough */ }
    }
    const data = d || gd();
    return (data && data.stats) ? Object.assign({}, data.stats) : {};
  }

  function grantReward(rw, d) {
    const g = window.__goals;
    if (g && typeof g.grant === 'function') {
      try { return g.grant(rw, d) || []; } catch (e) { return []; }
    }
    return [];
  }

  function save() {
    if (typeof saveGameProgress === 'function') {
      try { saveGameProgress(); } catch (e) { /* noop */ }
    }
  }

  /* ── 赛季经验 / 等级 ───────────────────────────────────────── */

  /** 本季经验 = Σ max(0, 当前统计 - 本季基线) × 权重（纯函数，不改档） */
  function xpOf(s, d) {
    const data = d || gd();
    const ss = s || ensure(data);
    if (!ss) return 0;
    const cur = statSnap(data);
    const base = ss.baseline || {};
    const w = cfg().xpWeights || {};
    const ed = edict(data);                     // E6-2：赛季法则 —— 本季重点玩法的经验加成
    let xp = 0;
    Object.keys(w).forEach(k => {
      const gain = Math.max(0, (Number(cur[k]) || 0) - (Number(base[k]) || 0));
      const mult = (ed.focus && k === ed.focus) ? ed.focusXpMult : 1;
      xp += gain * (Number(w[k]) || 0) * mult;
    });
    return Math.floor(xp);
  }

  /** 奖励轨（累计 need 由 need 累加而来，避免数据里维护两套数） */
  function levelTable() {
    const raw = Array.isArray(cfg().levels) ? cfg().levels : [];
    const out = [];
    let cum = 0;
    raw.forEach((l, i) => {
      const lv = Number(l && l.lv) || (i + 1);
      const need = Math.max(0, Number(l && l.need) || 0);
      cum += need;
      out.push({ lv, need, cum, rewards: (l && l.rewards) || {} });
    });
    return out;
  }

  function levelOf(xp) {
    const t = levelTable();
    if (!t.length) return 1;
    let lv = t[0].lv;
    for (let i = 0; i < t.length; i++) { if (xp >= t[i].cum) lv = t[i].lv; else break; }
    return lv;
  }

  function maxXp() {
    const t = levelTable();
    return t.length ? t[t.length - 1].cum : 0;
  }

  function progress(d) {
    const data = d || gd();
    const s = ensure(data);
    if (!s) return null;
    const xp = xpOf(s, data);
    const t = levelTable();
    const maxLv = t.length ? t[t.length - 1].lv : 1;
    const lv = levelOf(xp);
    const cur = t.filter(r => r.lv === lv)[0] || { cum: 0 };
    const next = t.filter(r => r.lv === lv + 1)[0] || null;
    const baseCum = cur.cum;
    const isMax = !next;
    const need = isMax ? Math.max(1, maxXp() - baseCum) : Math.max(1, next.cum - baseCum);
    const into = isMax ? need : Math.min(need, Math.max(0, xp - baseCum));
    return {
      xp, level: lv, maxLevel: maxLv, isMax,
      into, need, pct: isMax ? 1 : into / need, totalXp: maxXp()
    };
  }

  function levelsView(d) {
    const data = d || gd();
    const s = ensure(data);
    const p = progress(data);
    const claimed = (s && s.claimed) || [];
    return levelTable().map(r => ({
      lv: r.lv, need: r.need, cum: r.cum, rewards: r.rewards,
      reached: p ? p.xp >= r.cum : false,
      claimed: claimed.indexOf(r.lv) >= 0,
      current: p ? r.lv === p.level : false
    }));
  }

  /* ── 主题 + 赛季任务 ───────────────────────────────────────── */

  function theme(d) {
    const s = ensure(d);
    const pool = Array.isArray(cfg().themePool) ? cfg().themePool : [];
    if (!pool.length) return DEFAULT_THEME;
    const n = (s && s.seasonNo) || 1;
    const i = ((n - 1) % pool.length + pool.length) % pool.length;
    return pool[i] || DEFAULT_THEME;
  }

  /**
   * E6-2 赛季法则：本季重点玩法（focus）的赛季经验翻倍系数。
   * 主题没配就恒为 1 ⇒ 老主题/缺省数据下 XP 公式与从前逐字节一致。
   */
  function edict(d) {
    const th = theme(d) || {};
    const e = (th && th.edict) || null;
    if (!e || !e.focus) return { focus: '', focusXpMult: 1, text: '' };
    const m = Number(e.focusXpMult);
    return {
      focus: String(e.focus),
      focusXpMult: isFinite(m) && m > 0 ? m : 1,
      text: e.text || ''
    };
  }

  function taskProgress(d) {
    const data = d || gd();
    const s = ensure(data);
    const th = theme(data);
    const task = th.task || {};
    const key = task.stat || 'battleWins';
    const cur = statSnap(data)[key] || 0;
    const base = (s && s.baseline) ? (Number(s.baseline[key]) || 0) : 0;
    const done = Math.max(0, (Number(cur) || 0) - base);
    const target = Math.max(1, Number(task.target) || 1);
    return {
      name: task.name || '', desc: task.desc || '', stat: key,
      cur: done, target, reached: done >= target,
      claimed: !!(s && s.taskClaimed), reward: th.reward || {}
    };
  }

  /* ── 领取 ─────────────────────────────────────────────────── */

  function claim(lv, d) {
    const data = d || gd();
    const s = ensure(data);
    if (!s) return { ok: false, reason: 'nodata' };
    const row = levelTable().filter(r => r.lv === Number(lv))[0];
    if (!row) return { ok: false, reason: 'bad_level' };
    if (s.claimed.indexOf(row.lv) >= 0) return { ok: false, reason: 'claimed' };
    const p = progress(data);
    if (!p || p.xp < row.cum) return { ok: false, reason: 'locked' };
    s.claimed.push(row.lv);
    const given = grantReward(row.rewards, data);
    save();
    return { ok: true, lv: row.lv, rewards: row.rewards, given };
  }

  function claimableLevels(d) {
    return levelsView(d).filter(r => r.reached && !r.claimed).map(r => r.lv);
  }

  function claimableCount(d) {
    const t = taskProgress(d);
    return claimableLevels(d).length + ((t.reached && !t.claimed) ? 1 : 0);
  }

  function claimAll(d) {
    const data = d || gd();
    const lvs = claimableLevels(data);
    const given = [];
    lvs.forEach(lv => {
      const r = claim(lv, data);
      if (r.ok) given.push.apply(given, r.given);
    });
    const taskGiven = claimTask(data).given || [];
    return { ok: true, count: lvs.length, given, taskGiven };
  }

  function claimTask(d) {
    const data = d || gd();
    const s = ensure(data);
    if (!s) return { ok: false, reason: 'nodata' };
    const t = taskProgress(data);
    if (t.claimed) return { ok: false, reason: 'claimed' };
    if (!t.reached) return { ok: false, reason: 'locked' };
    s.taskClaimed = true;
    const given = grantReward(t.reward, data);
    save();
    return { ok: true, given, reward: t.reward };
  }

  /* ── 结算 / 归档 / 跨季滚动 ───────────────────────────────── */

  function settleReward(level) {
    const tiers = (Array.isArray(cfg().settleTiers) ? cfg().settleTiers.slice() : [])
      .sort((a, b) => (Number(a && a.minLevel) || 0) - (Number(b && b.minLevel) || 0));
    let gems = 0;
    tiers.forEach(t => { if (level >= (Number(t && t.minLevel) || 0)) gems = Number(t.gems) || 0; });
    return { gems };
  }

  /** 把当前赛季归档并结算，然后开新季（内部，由 sync 调用） */
  function archiveAndSettle(s, d) {
    const data = d || gd();
    const xp = xpOf(s, data);                       // 必须在重置 baseline 之前算
    const lv = levelOf(xp);
    const reward = settleReward(lv);
    const rec = {
      seasonNo: s.seasonNo,
      themeId: (theme(data) || {}).id || '',
      themeName: (theme(data) || {}).name || '',
      level: lv,
      xp,
      startedAt: s.startedAt,
      endedAt: s.endsAt,
      rewardGems: reward.gems,
      settled: true
    };
    s.history.push(rec);
    if (reward.gems > 0) grantReward({ gems: reward.gems }, data);

    s.seasonNo += 1;
    s.startedAt = s.endsAt;
    s.endsAt = s.startedAt + durationMs();
    s.claimed = [];
    s.taskClaimed = false;
    s.baseline = statSnap(data);                    // 新季从零开始
    return rec;
  }

  /**
   * 时间同步：补建窗口 + 跨季滚动（**会改档**，只在 init / 面板渲染 / 显式调用时执行；
   * 红点规则里不要调它）。
   */
  function sync(d) {
    const data = d || gd();
    const s = ensure(data);
    if (!s) return null;
    const now = Date.now();
    if (typeof s.startedAt !== 'number') s.startedAt = now;
    if (typeof s.endsAt !== 'number') s.endsAt = s.startedAt + durationMs();
    if (!s.baseline) s.baseline = statSnap(data);
    let guard = 0;
    while (now >= s.endsAt && guard < MAX_ROLLOVER) {
      guard += 1;
      archiveAndSettle(s, data);
    }
    return s;
  }

  /* ── 摘要（UI 用） ────────────────────────────────────────── */

  function summary(d) {
    const data = d || gd();
    const s = ensure(data);
    if (!s) return null;
    const th = theme(data);
    const p = progress(data);
    const t = taskProgress(data);
    return {
      seasonNo: s.seasonNo,
      startedAt: s.startedAt,
      endsAt: s.endsAt,
      msLeft: Math.max(0, (s.endsAt || 0) - Date.now()),
      theme: th,
      progress: p,
      levels: levelsView(data),
      task: t,
      claimable: claimableCount(data),
      settlePreview: settleReward(p ? p.level : 1),
      history: (s.history || []).slice().sort((a, b) => (b.seasonNo || 0) - (a.seasonNo || 0))
    };
  }

  const api = {
    cfg, durationMs, ensure, sync, xpOf, levelTable, levelOf, progress, levelsView,
    theme, edict, taskProgress, claim, claimableLevels, claimableCount, claimAll, claimTask,
    settleReward, archiveAndSettle, summary
  };

  const segs = 'Game.domain.season'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__season = api;
})();
