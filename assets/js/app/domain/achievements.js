/* ════════════════════════════════════════════════════════════════
   幻卡传说 · 成就系统（Stage 1 · C8）—— 数值单源
   ────────────────────────────────────────────────────────────────
   本文件是「成就」的唯一真相源：定义读取、进度计算、奖励发放全在这里。
   界面层（ui/codex.js）只读不改。

   设计口径（为什么这么做）：
   · **进度全部现算，不落盘**。存档里只存 `gameData.achievements.claimed`
     —— 谁领过了。理由：进度是「当前状态的函数」（图鉴 42 个角色、战力 8 万），
     落盘就会和真实状态不一致（改存档 / 调数值 / 回滚版本都会分叉）。
     现算的代价是每次打开面板遍历 99 个角色 + 几十条定义，可忽略。
   · **累计型指标走 domain/stats.js**（gameData.stats），那是唯一需要历史计数
     的部分，且埋点只有一处（goals.bump 内部）。
   · **奖励发放复用 goals.grant**（C5 单源）—— 不在这里再写一套发金币/发钻石，
     否则「加钻石」这件事会有两份实现（本项目头号陷阱）。
   · **定义来自 assets/data/achievements.json**，拿不到就退回内置精简兜底
     （仍然能玩，只是成就少几条）。

   ⚠️ 铁律 5：gameData / charactersData / stagesData 是 index.html 顶层
      `let`，**不挂 window**。取值走裸标识符，且只能在函数体内读。
   ════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  /* 兜底成就（achievements.json 加载失败时用；数值与 JSON 保持一致） */
  const FALLBACK = {
    version: 1,
    groups: [
      { key: 'collection', name: '星海收藏', icon: 'fa-book', tone: 'primary' },
      { key: 'growth', name: '成长之路', icon: 'fa-arrow-up', tone: 'accent' },
      { key: 'power', name: '战力阶梯', icon: 'fa-bolt', tone: 'gold' },
      { key: 'battle', name: '征战记录', icon: 'fa-shield', tone: 'danger' },
      { key: 'daily', name: '日常习惯', icon: 'fa-calendar-check-o', tone: 'primary' }
    ],
    achievements: [
      { id: 'codex_01', group: 'collection', name: '初见星海', desc: '图鉴收录 10 名角色', metric: 'codexCount', target: 10, reward: { gems: 100 } },
      { id: 'codex_03', group: 'collection', name: '星海过半', desc: '图鉴收录 50 名角色', metric: 'codexCount', target: 50, reward: { gems: 400 } },
      { id: 'grow_lv30', group: 'growth', name: '小有所成', desc: '任意角色达到 30 级', metric: 'maxLevel', target: 30, reward: { gold: 10000 } },
      { id: 'power_1w', group: 'power', name: '初露锋芒', desc: '总战力达到 10,000', metric: 'totalPower', target: 10000, reward: { gold: 8000 } },
      { id: 'battle_10', group: 'battle', name: '初战告捷', desc: '累计战斗胜利 10 次', metric: 'battleWins', target: 10, reward: { gold: 5000 } },
      { id: 'daily_gacha10', group: 'daily', name: '召唤新手', desc: '累计召唤 10 次', metric: 'gachaTotal', target: 10, reward: { gems: 100 } }
    ]
  };

  function gd() {
    try { return (typeof gameData !== 'undefined' && gameData) ? gameData : null; }
    catch (e) { return null; }
  }

  function chars() {
    const d = gd();
    return (d && Array.isArray(d.characters)) ? d.characters : [];
  }

  function mainStages() {
    try {
      if (typeof stagesData !== 'undefined' && Array.isArray(stagesData)) {
        return stagesData.filter(s => s && typeof s.id === 'string' && s.id.startsWith('stage_'));
      }
    } catch (e) { /* TDZ */ }
    return [];
  }

  /* ── 配置 ─────────────────────────────────────────────────── */

  function cfg() {
    try {
      if (typeof achievementsData !== 'undefined' && achievementsData &&
        Array.isArray(achievementsData.achievements)) return achievementsData;
    } catch (e) { /* TDZ */ }
    const w = window.achievementsData;
    if (w && Array.isArray(w.achievements)) return w;
    return FALLBACK;
  }

  const defs = () => (cfg().achievements || []).filter(a => a && a.id && a.metric);
  const groups = () => (cfg().groups || []);
  const groupDef = (key) => groups().filter(g => g && g.key === key)[0] || { key, name: key, icon: 'fa-star', tone: 'primary' };
  const defOf = (id) => defs().filter(a => a.id === id)[0] || null;

  /* ── 度量（metric → 当前值）─────────────────────────────────
     全部是「当前状态的纯函数」：不写盘、不改 gameData。
     新增成就时在这里补一个 key 即可（定义只在 achievements.json）。 */
  const METRICS = {
    codexCount: () => {
      const cx = window.__codex;
      return cx && typeof cx.count === 'function' ? cx.count() : 0;
    },
    codexSur: () => {
      const cx = window.__codex;
      if (!cx || typeof cx.summary !== 'function') return 0;
      const s = cx.summary();
      return (s.byRarity && s.byRarity.SUR) ? s.byRarity.SUR.owned : 0;
    },
    maxLevel: () => chars().reduce((m, c) => Math.max(m, Number(c && c.level) || 0), 0),
    maxStars: () => chars().reduce((m, c) => Math.max(m, Number(c && c.stars) || 0), 0),
    awakenCount: () => chars().filter(c => c && c.awakened).length,
    totalPower: () => (typeof window.calculateTotalPower === 'function') ? (Number(window.calculateTotalPower()) || 0) : 0,
    mainCleared: () => {
      const ms = mainStages();
      const d = gd();
      if (!ms.length || !d) return 0;
      const i = ms.findIndex(s => s.id === d.currentStage);
      return i <= 0 ? 0 : i;
    },
    towerBest: () => {
      const d = gd();
      return (d && d.tower) ? (Number(d.tower.bestFloor) || 0) : 0;
    },
    gachaTotal: () => statVal('gachaTotal'),
    battleWins: () => statVal('battleWins'),
    levelUps: () => statVal('levelUps'),
    sweeps: () => statVal('sweeps'),
    idleClaims: () => statVal('idleClaims')
  };

  function statVal(key) {
    const st = window.__stats;
    if (!st || typeof st.get !== 'function') return 0;
    return Number(st.get(key)) || 0;
  }

  const metricKeys = () => Object.keys(METRICS);
  const metricValue = (metric) => {
    const fn = METRICS[metric];
    return fn ? (Number(fn()) || 0) : 0;
  };

  /* ── 状态 ─────────────────────────────────────────────────── */

  function ensure(target) {
    const d = target || gd();
    if (!d) return null;
    if (!d.achievements || typeof d.achievements !== 'object') d.achievements = {};
    if (!Array.isArray(d.achievements.claimed)) d.achievements.claimed = [];
    return d.achievements;
  }

  /* ── 视图 ─────────────────────────────────────────────────── */

  function list() {
    const d = gd();
    const st = ensure(d);
    return defs().map(a => {
      const target = Math.max(1, Number(a.target) || 1);
      const cur = Math.min(target, metricValue(a.metric));
      const claimed = !!(st && st.claimed.indexOf(a.id) >= 0);
      return {
        id: a.id,
        group: a.group,
        groupName: groupDef(a.group).name,
        name: a.name,
        desc: a.desc,
        metric: a.metric,
        target,
        cur,
        reward: a.reward || {},
        claimed,
        done: cur >= target,
        claimable: cur >= target && !claimed,
        pct: Math.round((cur / target) * 100)
      };
    });
  }

  /** 按分组聚合（界面按组渲染；组内排序：可领取 → 进行中 → 已领取） */
  function byGroup() {
    const all = list();
    const ordered = groups().map(g => g.key).concat(
      [...new Set(all.map(a => a.group))].filter(k => !groupDef(k).key || !groups().some(g => g.key === k))
    );
    const rank = (a) => a.claimable ? 0 : (a.claimed ? 2 : 1);
    return ordered.map(key => {
      const items = all.filter(a => a.group === key).sort((x, y) => rank(x) - rank(y) || (x.pct > y.pct ? -1 : 1));
      if (!items.length) return null;
      return { key, def: groupDef(key), items };
    }).filter(Boolean);
  }

  function summary() {
    const all = list();
    const done = all.filter(a => a.done).length;
    const claimable = all.filter(a => a.claimable).length;
    const claimed = all.filter(a => a.claimed).length;
    return {
      done, claimable, claimed,
      total: all.length,
      pct: all.length ? Math.round((done / all.length) * 100) : 0
    };
  }

  const hasClaimable = () => list().some(a => a.claimable);

  /* ── 领取 ─────────────────────────────────────────────────── */

  function grant(reward, d) {
    const goals = window.__goals;
    if (goals && typeof goals.grant === 'function') return goals.grant(reward, d);
    return [];
  }

  function claim(id) {
    const d = gd();
    const st = ensure(d);
    const a = defOf(id);
    if (!d || !st || !a) return { ok: false, reason: 'nodata' };
    if (st.claimed.indexOf(id) >= 0) return { ok: false, reason: 'claimed' };
    const target = Math.max(1, Number(a.target) || 1);
    if (metricValue(a.metric) < target) return { ok: false, reason: 'unfinished' };
    st.claimed.push(id);
    const given = grant(a.reward, d);
    if (typeof window.saveGameProgress === 'function') window.saveGameProgress();
    return { ok: true, achievement: a, given };
  }

  function claimAll() {
    const d = gd();
    if (!d) return { ok: false, count: 0, given: [] };
    const ready = list().filter(a => a.claimable);
    if (!ready.length) return { ok: false, count: 0, given: [], reason: 'none' };
    const given = [];
    let count = 0;
    ready.forEach(a => {
      const r = claim(a.id);
      if (r && r.ok) { count++; given.push(...(r.given || [])); }
    });
    return { ok: true, count, given };
  }

  /** 调试 / 回归用：清空领取记录（不影响其它存档字段） */
  function resetClaims(target) {
    const st = ensure(target);
    if (!st) return false;
    st.claimed = [];
    return true;
  }

  const api = {
    FALLBACK,
    defs, groups, groupDef, defOf,
    METRICS, metricKeys, metricValue,
    ensure, list, byGroup, summary, hasClaimable,
    claim, claimAll, resetClaims
  };

  const segs = 'Game.domain.achievements'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__achievements = api;
})();
