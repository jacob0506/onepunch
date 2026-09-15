/**
 * season_trial.js —— 赛季秘境（E6-2，2026-09-16）—— 数值单源
 *
 * 为什么做：E6 第一版只有「赛季等级轨」，主题只是**文案**（名字/标语/任务）。
 * 本批把主题变成**真玩法**：每个赛季主题自带一套 5 层秘境，逐层一条**主题词缀**
 * （只作用于秘境敌人，不碰主线与其它任何玩法），通关喂「赛季经验」——
 * 于是「打什么」由本季主题决定，赛季从"数值轨"升级为"主题玩法赛季"。
 *
 * 设计要点：
 *  1. **全确定性**：敌人按 seed(seasonNo, layer) 由 mulberry32 抽取，同季同层必得
 *     同一波敌人（铁律 17/18：禁 Math.random，不挪战斗 RNG 流 ⇒ 不污染数值快照）。
 *  2. **词缀只改敌人数值**（enemyHp / enemyAtk / enemyDef / enemyExtra / rewardMult），
 *     玩家单位走引擎默认阵型路径 ⇒ **零引擎改动**，主线与其它玩法逐字节不变。
 *  3. **不推进主线**：stage 前缀 `tr_`，走 fallback_hud 的 isTrialStage 分支。
 *  4. **发奖走单源** `window.__goals.grant`（金币 / 钻石 / 材料），不自己加钱。
 *  5. **进度随赛季重置**：seasonNo 变了就整季清零（新主题 = 新秘境）。
 *  6. 通关上报 `bumpGoal('trial', 1)` ⇒ stats.trialClears +1 ⇒ 被 season.xpWeights
 *     自动吃到（零新增埋点，沿用 C8 的既有链路）。
 *
 * 配置：assets/data/season.json（trial 段 + 每个主题的 trial.affixes）
 * 导出：Game.domain.seasonTrial + window.__trial（⚠️ 不能用 __season* 前缀 ——
 *       check-season 有一条「fallback_hud 不出现 __season」的源码断言）
 */
(() => {
  'use strict';

  const FALLBACK = {
    layers: 5,
    dailyTries: 3,
    enemyCountByLayer: [3, 3, 4, 5, 6],
    hpByLayer: [9000, 13000, 19000, 27000, 38000],
    atkByLayer: [900, 1200, 1600, 2100, 2800],
    defByLayer: [500, 650, 820, 1000, 1220],
    speedBase: 92,
    firstClearRewards: [],
    repeatReward: { gold: 1000 },
    failReward: { gold: 300 }
  };

  /* ── 种子 PRNG（禁 Math.random） ──────────────────────────────────────── */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261;
    const str = String(s || '');
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function gd() {
    try { return (typeof gameData !== 'undefined' && gameData) ? gameData : null; }
    catch (e) { return null; }
  }
  function save() { if (typeof saveGameProgress === 'function') { try { saveGameProgress(); } catch (e) { /* noop */ } } }

  /** 赛季模块（拿不到就退化为"无秘境"，不报错） */
  function S() { return window.__season || null; }

  /** 秘境数值（season.json 的 trial 段；主题词缀另取） */
  function cfg() {
    try {
      if (typeof seasonData !== 'undefined' && seasonData && seasonData.trial) return seasonData.trial;
    } catch (e) { /* TDZ / 未定义 */ }
    return FALLBACK;
  }

  /** 当前赛季主题（拿不到返回空主题） */
  function theme() {
    const s = S();
    if (s && typeof s.theme === 'function') {
      try { return s.theme() || {}; } catch (e) { /* fallthrough */ }
    }
    return {};
  }

  /** 本季秘境配置（标题 / 引言 / 逐层词缀） */
  function themeTrial() {
    const t = (theme() && theme().trial) || {};
    const affixes = Array.isArray(t.affixes) ? t.affixes : [];
    return {
      title: t.title || '无名秘境',
      intro: t.intro || '',
      layerCount: Math.max(1, Number(cfg().layers) || 5),
      affixes
    };
  }

  function layerCount() { return themeTrial().layerCount; }

  /** 第 layer 层（0 基）的词缀：按层取，词缀不足则循环 —— 纯函数、确定性 */
  function affixOf(layer) {
    const tt = themeTrial();
    const list = tt.affixes;
    if (!list.length) return { name: '无词缀', desc: '本层没有额外规则', enemyHp: 1, enemyAtk: 1, enemyDef: 1 };
    const a = list[((Number(layer) || 0) % list.length + list.length) % list.length] || {};
    return {
      name: a.name || '无词缀',
      desc: a.desc || '',
      enemyHp: Math.max(0.1, Number(a.enemyHp) || 1),
      enemyAtk: Math.max(0.1, Number(a.enemyAtk) || 1),
      enemyDef: Math.max(0.1, Number(a.enemyDef) || 1),
      enemyExtra: Math.max(0, Math.floor(Number(a.enemyExtra) || 0)),
      rewardMult: Math.max(0, Number(a.rewardMult) || 1)
    };
  }

  /* ── 存档结构 ─────────────────────────────────────────────────────────── */
  function dayKey(ts) {
    const d = ts ? new Date(ts) : new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function seasonNo() {
    const s = S();
    const d = gd();
    if (s && typeof s.ensure === 'function') {
      const se = s.ensure(d);
      if (se && Number(se.seasonNo) > 0) return Number(se.seasonNo);
    }
    return (d && d.season && Number(d.season.seasonNo)) || 1;
  }

  /** 保证 gameData.seasonTrial 结构完整；跨季 / 跨日自动重置（幂等） */
  function ensure() {
    const d = gd();
    if (!d) return null;
    if (!d.seasonTrial || typeof d.seasonTrial !== 'object') d.seasonTrial = {};
    const t = d.seasonTrial;
    const no = seasonNo();
    const n = layerCount();
    if (typeof t.seasonNo !== 'number') t.seasonNo = no;
    if (!Array.isArray(t.cleared)) t.cleared = [];
    if (typeof t.triesLeft !== 'number') t.triesLeft = Math.max(1, Number(cfg().dailyTries) || 3);
    if (typeof t.dayKey !== 'string') t.dayKey = dayKey();
    if (typeof t.runs !== 'number') t.runs = 0;
    if (typeof t.activeLayer !== 'number') t.activeLayer = -1;
    while (t.cleared.length < n) t.cleared.push(false);
    t.cleared.length = n;

    // 跨日：次数回满（进度不清）
    const today = dayKey();
    if (t.dayKey !== today) {
      t.dayKey = today;
      t.triesLeft = Math.max(1, Number(cfg().dailyTries) || 3);
    }
    // 跨季：整季清零（新主题 = 新秘境，避免"上季通关记录"污染新季）
    if (t.seasonNo !== no) {
      t.seasonNo = no;
      t.cleared = new Array(n).fill(false);
      t.triesLeft = Math.max(1, Number(cfg().dailyTries) || 3);
      t.runs = 0;
      t.activeLayer = -1;
    }
    return t;
  }

  /** 已通关层数 ⇒ 决定解锁到第几层 */
  function clearedCount() {
    const t = ensure();
    if (!t) return 0;
    return t.cleared.filter(Boolean).length;
  }

  function layerState(i) {
    const t = ensure();
    const n = layerCount();
    if (!t || i < 0 || i >= n) return { index: i, unlocked: false, cleared: false };
    return {
      index: i,
      cleared: t.cleared[i] === true,
      unlocked: i <= clearedCount(),
      affix: affixOf(i),
      reward: (cfg().firstClearRewards || [])[i] || {}
    };
  }

  /* ── 敌人构造（确定性） ───────────────────────────────────────────────── */
  function enemyPool() {
    const d = gd();
    const used = new Set();
    if (d && Array.isArray(d.formation)) d.formation.forEach(id => { if (id) used.add(id); });
    const all = (typeof charactersData !== 'undefined' && Array.isArray(charactersData)) ? charactersData : [];
    const pool = all.filter(c => c && c.id && !used.has(c.id));
    return pool.length ? pool : all.filter(c => c && c.id);
  }

  function at(arr, i, dflt) {
    const a = Array.isArray(arr) ? arr : [];
    if (!a.length) return dflt;
    return a[Math.min(i, a.length - 1)];
  }

  function buildEnemies(layer) {
    const c = cfg();
    const af = affixOf(layer);
    const rnd = mulberry32(hashStr(`tr_${seasonNo()}_${layer}`));
    const pool = enemyPool();
    const n = Math.max(1, (Number(at(c.enemyCountByLayer, layer, 3)) || 3) + af.enemyExtra);
    const hp0 = Math.max(1, Number(at(c.hpByLayer, layer, 9000)) || 9000) * af.enemyHp;
    const atk0 = Math.max(1, Number(at(c.atkByLayer, layer, 900)) || 900) * af.enemyAtk;
    const def0 = Math.max(0, Number(at(c.defByLayer, layer, 500)) || 500) * af.enemyDef;
    const spd = Number(c.speedBase) || 92;
    const out = [];
    for (let i = 0; i < n; i++) {
      const tpl = pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
      const lv = 55 + layer * 8;
      const hp = Math.floor(hp0);
      out.push({
        id: `tr_e_${layer}_${i}`,
        name: tpl ? tpl.name : '秘境守卫',
        displayName: tpl ? tpl.name : '秘境守卫',
        class: (tpl && tpl.class) || 'warrior',
        isEnemy: true,
        isBoss: i === 0 && layer === layerCount() - 1,
        position: i < 3 ? 'front' : 'back',
        level: lv, stars: 1,
        maxHp: hp,
        health: hp,                 // ⚠️ 铁律 19：scene.js 读 e.health，只写 maxHp 会全部兜底 1000 血
        currentHp: hp,
        attack: Math.floor(atk0),
        defense: Math.floor(def0),
        speed: spd + (i % 3) * 5,
        critRate: 5, critDmg: 150, blockRate: 2, dmgReduc: 0, shield: 0,
        imageUrl: (tpl && tpl.imageUrl) || '',
        skills: (tpl && Array.isArray(tpl.skills)) ? JSON.parse(JSON.stringify(tpl.skills)) : [],
        passiveText: '', passiveRuntime: null, statuses: []
      });
    }
    return out;
  }

  function buildStage(layer) {
    const d = gd();
    const t = ensure();
    if (!d || !t) return null;
    const tt = themeTrial();
    const af = affixOf(layer);
    const stage = {
      id: `tr_${seasonNo()}_${layer}`,
      name: `${tt.title} · 第 ${layer + 1} 层`,
      isSeasonTrial: true,
      trialLayer: layer,
      trialSeason: seasonNo(),
      chapter: `${tt.title} · ${af.name}`,
      enemies: buildEnemies(layer),
      rewards: { exp: 0, gold: 0, items: [] },
      modifiers: { affixes: [] }
    };
    if (Array.isArray(stagesData)) {
      const at2 = stagesData.findIndex(s => s && s.id === stage.id);
      if (at2 >= 0) stagesData[at2] = stage; else stagesData.push(stage);
    }
    return stage;
  }

  /* ── 流程 ─────────────────────────────────────────────────────────────── */
  function formationCount() {
    const d = gd();
    if (!d || !Array.isArray(d.formation)) return 0;
    return d.formation.filter(Boolean).length;
  }

  function canFight(layer) {
    const t = ensure();
    if (!t) return { ok: false, reason: 'no_save' };
    const i = Number(layer) || 0;
    if (i < 0 || i >= layerCount()) return { ok: false, reason: 'bad_layer' };
    if (formationCount() === 0) return { ok: false, reason: 'empty_formation' };
    if (i > clearedCount()) return { ok: false, reason: 'locked' };
    if (t.triesLeft <= 0) return { ok: false, reason: 'no_tries' };
    return { ok: true, left: t.triesLeft };
  }

  /** 开打：扣次数 + 返回 stageId */
  function start(layer) {
    const chk = canFight(layer);
    if (!chk.ok) return chk;
    const t = ensure();
    const i = Number(layer) || 0;
    const stage = buildStage(i);
    if (!stage) return { ok: false, reason: 'build_failed' };
    t.triesLeft -= 1;
    t.runs += 1;
    t.activeLayer = i;
    save();
    return { ok: true, stageId: stage.id, layer: i, left: t.triesLeft };
  }

  function scaleReward(r, mult) {
    const m = Math.max(0, Number(mult) || 1);
    const out = {};
    if (r && r.gold) out.gold = Math.floor(Number(r.gold) * m);
    if (r && r.gems) out.gems = Math.floor(Number(r.gems) * m);
    if (r && r.materials) {
      out.materials = {};
      Object.keys(r.materials).forEach(k => {
        const v = Math.floor(Number(r.materials[k]) * m);
        if (v > 0) out.materials[k] = v;          // 倍率为 0 时不出假数字（不写 Math.max(1,…)）
      });
    }
    return out;
  }

  function grant(rw) {
    const g = window.__goals;
    if (g && typeof g.grant === 'function') {
      try { return g.grant(rw) || []; } catch (e) { return []; }
    }
    return [];
  }

  /**
   * 战斗结束回写（fallback_hud 的 isTrialStage 分支调用，胜负都走）
   * 幂等：首通奖只发一次（cleared 标记），重复通关只给 repeatReward。
   */
  function advance(isWin) {
    const t = ensure();
    if (!t) return { ok: false, reason: 'no_save' };
    const i = Number(t.activeLayer);
    if (!(i >= 0) || i >= layerCount()) return { ok: false, reason: 'no_active' };
    const af = affixOf(i);
    const c = cfg();
    const first = !t.cleared[i];
    let given = [];
    let reward = {};

    if (isWin) {
      reward = first
        ? scaleReward((c.firstClearRewards || [])[i] || {}, af.rewardMult)
        : scaleReward(c.repeatReward || {}, af.rewardMult);
      given = grant(reward);
      t.cleared[i] = true;
      if (typeof window.bumpGoal === 'function') {
        try { window.bumpGoal('trial', 1); } catch (e) { /* noop */ }
      }
    } else {
      reward = scaleReward(c.failReward || {}, 1);
      given = grant(reward);
    }
    t.activeLayer = -1;
    save();
    return {
      ok: true, win: !!isWin, layer: i, firstClear: first && !!isWin,
      reward, given, clearedCount: clearedCount(), left: t.triesLeft
    };
  }

  /* ── 摘要（UI 用） ───────────────────────────────────────────────────── */
  function summary() {
    const t = ensure();
    if (!t) return null;
    const tt = themeTrial();
    const c = cfg();
    const n = layerCount();
    const layers = [];
    for (let i = 0; i < n; i++) layers.push(layerState(i));
    return {
      seasonNo: seasonNo(),
      title: tt.title,
      intro: tt.intro,
      themeName: (theme() && theme().name) || '',
      themeColor: (theme() && theme().color) || '#7dd3fc',
      themeIcon: (theme() && theme().icon) || 'fa-star',
      layers,
      clearedCount: clearedCount(),
      layerCount: n,
      allCleared: clearedCount() >= n,
      triesLeft: t.triesLeft,
      dailyTries: Math.max(1, Number(c.dailyTries) || 3),
      runs: t.runs,
      repeatReward: c.repeatReward || {},
      failReward: c.failReward || {}
    };
  }

  const api = {
    cfg, themeTrial, layerCount, affixOf, ensure, seasonNo, dayKey,
    clearedCount, layerState, buildEnemies, buildStage,
    canFight, start, advance, scaleReward, summary
  };

  const segs = 'Game.domain.seasonTrial'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__trial = api;          // ⚠️ 命名见文件头：不能叫 __seasonTrial
  window.initSeasonTrial = function () { ensure(); };
})();
