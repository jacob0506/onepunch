/* ════════════════════════════════════════════════════════════════
   幻卡传说 · 日常副本（Stage 1 · C7）—— 数值单源
   ────────────────────────────────────────────────────────────────
   本文件是「日常副本」的唯一真相源：副本/难度定义、敌人构造、奖励计算、
   每日次数管理全在这里。界面层（ui/daily.js）只读不改。

   设计口径（为什么这么做）：
   · **强度跟随主线**：不另起一套成长曲线。基准取主线当前关的
     recommendedPower / rewards，各档乘系数（初级 0.8×）。好处是永远不会
     出现"后期回来刷初级本毫无意义"，也不会"新号打不过日常本"的死锁
     —— 初级档比主线当前关还弱，卡关时正好靠它攒资源。
   · **次数跨日重置**：次数存在 `gameData.daily.runs`，与 C5 的今日目标共用
     同一个 `daily` 容器（goals.ensureDaily 跨日整体重建，runs 顺带清零）。
   · **战斗走同一套结算**：副本 stage 带 `isDaily: true` 进 stagesData，
     复用 battle/rewards.js 的 rollRewards；主线进度推进分支已排除（见
     battle/fallback_hud.js 的 isDailyStage 分支）。

   ⚠️ 铁律 5：gameData / stagesData / materialsData 都是 index.html 顶层的
      `let`，**不会挂到 window**。取值必须走裸标识符（写 window.gameData
      会得到 undefined），且因为本模块加载早于内联脚本，只能在函数体内读。

   ⚠️ stage id 前缀 `daily_` 是刻意的：主线/无尽塔的过滤都按 `stage_` /
     `tower_` 前缀做，互不干扰。
   ════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const STAGE_PREFIX = 'daily_';

  /* 兜底配置：dailies.json 加载失败时仍然能玩（数值与 JSON 保持一致） */
  const FALLBACK = {
    version: 1,
    runsPerDay: 2,
    tiers: [
      { key: 'junior', name: '初级', desc: '轻松热身', powerMul: 0.80, rewardMul: 1.0 },
      { key: 'senior', name: '中级', desc: '主力难度', powerMul: 1.00, rewardMul: 2.2 },
      { key: 'elite',  name: '高级', desc: '战力不够别碰', powerMul: 1.28, rewardMul: 4.0 }
    ],
    dungeons: [
      { key: 'gold', name: '黄金矿脉', icon: 'fa-money', tone: 'gold', desc: '金币定向产出，附带少量经验', reward: { goldMul: 2.6, expMul: 0.30 } },
      { key: 'exp', name: '经验秘境', icon: 'fa-star', tone: 'exp', desc: '经验定向产出，附带少量金币', reward: { expMul: 3.0, goldMul: 0.20 } },
      { key: 'material', name: '材料矿坑', icon: 'fa-cubes', tone: 'material', desc: '强化石 / 铭文粉尘稳定产出', reward: { expMul: 0.35, goldMul: 0.35, matsBase: { enhanceStone: 10, inscriptionDust: 6 } } },
      { key: 'boss', name: '深渊讨伐', icon: 'fa-bullseye', tone: 'boss', desc: '装备 / 铭文随机掉落，必掉锁定核心', reward: { expMul: 0.60, goldMul: 0.60, lootFromStage: true, matsBase: { lockCrystal: 1 } } }
    ]
  };

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

  /** 配置：dailiesData（内联顶层 let）→ window 兜底 → 内置兜底 */
  function cfg() {
    try {
      if (typeof dailiesData !== 'undefined' && dailiesData && Array.isArray(dailiesData.dungeons)) return dailiesData;
    } catch (e) { /* TDZ */ }
    const w = window.dailiesData;
    if (w && Array.isArray(w.dungeons)) return w;
    return FALLBACK;
  }

  const list = () => cfg().dungeons || [];
  const tiers = () => cfg().tiers || [];
  const runsPerDay = () => Math.max(1, Number(cfg().runsPerDay) || 2);
  const dungeonDef = (key) => list().filter(x => x && x.key === key)[0] || null;
  const tierDef = (key) => tiers().filter(x => x && x.key === key)[0] || null;
  const stageIdOf = (dungeonKey, tierKey) => `${STAGE_PREFIX}${dungeonKey}_${tierKey}`;

  /* ── 主线基准 ─────────────────────────────────────────────── */

  function mainStages() {
    return dataList('stagesData').filter(s => s && typeof s.id === 'string' && s.id.startsWith('stage_'));
  }

  /** 主线进度序号（1-based）；取不到就是 1（新号） */
  function stageIndex() {
    const ms = mainStages();
    if (!ms.length) return 1;
    const d = gd();
    const i = ms.findIndex(s => s.id === ((d && d.currentStage) || ''));
    return i >= 0 ? i + 1 : 1;
  }

  /** 基准关卡 = 主线当前关（可能还没通关，正好代表"你正要面对的强度"） */
  function baseStage() {
    const ms = mainStages();
    if (!ms.length) return null;
    const d = gd();
    return ms.find(s => s.id === ((d && d.currentStage) || '')) || ms[0];
  }

  /* ── 每日次数 ─────────────────────────────────────────────── */

  /** 保证 daily 容器是今天且 runs 齐全（跨日重置借 goals.ensureDaily 完成） */
  function ensureDailyState(target) {
    const d = target || gd();
    if (!d) return null;
    const goals = window.__goals;
    let st = null;
    if (goals && typeof goals.ensureDaily === 'function') st = goals.ensureDaily(d);
    if (!st) {
      const today = (goals && typeof goals.dayKey === 'function') ? goals.dayKey() : new Date().toDateString();
      if (!d.daily || d.daily.date !== today) d.daily = { date: today, progress: {}, claimed: [] };
      st = d.daily;
    }
    if (!st.runs || typeof st.runs !== 'object') st.runs = {};
    const per = runsPerDay();
    list().forEach(dg => {
      const v = Number(st.runs[dg.key]);
      st.runs[dg.key] = Number.isFinite(v) ? Math.max(0, Math.min(per, v)) : per;
    });
    return st;
  }

  function runsLeft(key, target) {
    const st = ensureDailyState(target);
    if (!st) return 0;
    return Number(st.runs[key]) || 0;
  }

  /* ── 数值 ─────────────────────────────────────────────────── */

  function materialByKey(key) {
    return dataList('materialsData').find(m => m && (m.key === key || m.id === key)) || null;
  }
  function materialByName(key) {
    const m = materialByKey(key);
    if (m) return m.name || m.key || key;
    const idle = window.__idle;
    if (idle && typeof idle.materialName === 'function') return idle.materialName(key);
    return key;
  }
  function itemMeta(itemId) {
    if (dataList('equipmentData').some(x => x && x.id === itemId)) return 'equipment';
    if (dataList('inscriptionsData').some(x => x && x.id === itemId)) return 'inscription';
    if (materialByKey(itemId)) return 'material';
    return null;
  }

  /**
   * 奖励计算（纯函数）—— 界面预览与实战掉落都调它，永远同一个数。
   * 基数取主线当前关，dungeon.reward 给各产出系数，tier.rewardMul 给档位倍率；
   * 材料数量额外按主线进度线性放大（第 60 关约为新号的 6 倍）。
   */
  function rewardsFor(dungeonKey, tierKey) {
    const dg = dungeonDef(dungeonKey);
    const tr = tierDef(tierKey);
    const base = baseStage();
    const br = (base && base.rewards) || {};
    const out = { exp: 0, gold: 0, items: [] };
    if (!dg || !tr) return out;
    const mul = Number(tr.rewardMul) || 1;
    const r = dg.reward || {};
    const baseExp = Number(br.exp) || 100;
    const baseGold = Number(br.gold) || 400;

    out.exp = Math.max(0, Math.floor(baseExp * (Number(r.expMul) || 0) * mul));
    out.gold = Math.max(0, Math.floor(baseGold * (Number(r.goldMul) || 0) * mul));

    const prog = 1 + Math.max(0, stageIndex() - 1) / 12;
    Object.keys(r.matsBase || {}).forEach(k => {
      const m = materialByKey(k);
      if (!m) return;
      const qty = Math.max(1, Math.round((Number(r.matsBase[k]) || 0) * prog * mul));
      out.items.push({ id: m.id, quantity: qty, dropRate: 1 });
    });

    // 装备 / 铭文：沿用主线当前关的掉落表（不另造稀有度池），概率按档位放大
    if (r.lootFromStage && Array.isArray(br.items)) {
      const bonus = { junior: 1, senior: 1.25, elite: 1.5 }[tierKey] || 1;
      br.items.forEach(it => {
        if (!it || !it.id) return;
        const kind = itemMeta(it.id);
        if (kind !== 'equipment' && kind !== 'inscription') return;
        const p = Math.min(0.9, (Number(it.dropRate) || 0) * bonus);
        if (p <= 0) return;
        out.items.push({ id: it.id, quantity: 1, dropRate: p });
      });
    }
    return out;
  }

  function buildEnemies(dungeonKey, tierKey) {
    const base = baseStage();
    const tr = tierDef(tierKey) || { powerMul: 1 };
    const mul = Number(tr.powerMul) || 1;
    const src = (base && Array.isArray(base.enemies) && base.enemies.length)
      ? base.enemies
      : [{ name: '训练假人', class: 'warrior', health: 800, attack: 60, defense: 20, speed: 100 }];
    const n = Math.min(4, Math.max(3, src.length));
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = src[i % src.length];
      out.push({
        id: `${STAGE_PREFIX}${dungeonKey}_${tierKey}_${i + 1}`,
        name: t.name,
        class: t.class,
        imageUrl: t.imageUrl,
        health: Math.max(1, Math.floor((Number(t.health) || 600) * mul)),
        attack: Math.max(1, Math.floor((Number(t.attack) || 60) * mul)),
        defense: Math.max(0, Math.floor((Number(t.defense) || 20) * mul)),
        speed: Math.floor((Number(t.speed) || 100) * (0.95 + mul * 0.05)),
        isBoss: false
      });
    }
    if (dungeonKey === 'boss') {
      const t = src[0];
      const hpMul = mul * (tierKey === 'elite' ? 1.9 : 1.55);
      out.push({
        id: `${STAGE_PREFIX}${dungeonKey}_${tierKey}_boss`,
        name: `${String(t.name || '首领').replace(/·.*$/, '')}·讨伐目标`,
        class: t.class,
        imageUrl: t.imageUrl,
        health: Math.max(1, Math.floor((Number(t.health) || 600) * hpMul)),
        attack: Math.max(1, Math.floor((Number(t.attack) || 60) * mul * 1.15)),
        defense: Math.max(0, Math.floor((Number(t.defense) || 20) * mul * 1.2)),
        speed: Math.floor((Number(t.speed) || 100) * 0.9),
        isBoss: true
      });
    }
    return out;
  }

  /** 生成 stage 对象（纯函数，不写 stagesData） */
  function buildStage(dungeonKey, tierKey) {
    const dg = dungeonDef(dungeonKey);
    const tr = tierDef(tierKey);
    const base = baseStage();
    if (!dg || !tr) return null;
    const pow = Math.max(1, Math.floor(((base && base.recommendedPower) || 1000) * (Number(tr.powerMul) || 1)));
    return {
      id: stageIdOf(dungeonKey, tierKey),
      name: `${dg.name} · ${tr.name}`,
      chapter: '日常副本',
      difficulty: 'daily',
      recommendedPower: pow,
      enemies: buildEnemies(dungeonKey, tierKey),
      // 不给 bossMechanics ⇒ 讨伐目标只是"血厚的精英"，不引入机制 BOSS 的复杂度
      modifiers: { enrageRound: 8, boss: dungeonKey === 'boss', affixes: [] },
      rewards: rewardsFor(dungeonKey, tierKey),
      isDaily: true,
      dailyKey: dungeonKey,
      dailyTier: tierKey
    };
  }

  /**
   * 把全部副本 stage 重建进 stagesData（先清旧再插新）。
   * ⚠️ 必须重建而不是只插一次：强度/奖励跟着主线进度走，进度变了旧对象就过期了。
   *    战斗入口（scene.js）与结算（fallback_hud.js）都按 id 从 stagesData 查找，
   *    所以只要 id 稳定就安全。
   */
  function ensureDailyStages() {
    const all = dataList('stagesData');
    if (!Array.isArray(all) || !all.length) return [];
    for (let i = all.length - 1; i >= 0; i--) {
      const s = all[i];
      if (s && typeof s.id === 'string' && s.id.startsWith(STAGE_PREFIX)) all.splice(i, 1);
    }
    const out = [];
    list().forEach(dg => {
      tiers().forEach(tr => {
        const st = buildStage(dg.key, tr.key);
        if (!st) return;
        all.push(st);
        out.push(st);
      });
    });
    return out;
  }

  function findDailyStage(dungeonKey, tierKey) {
    const id = stageIdOf(dungeonKey, tierKey);
    return dataList('stagesData').find(s => s && s.id === id) || null;
  }

  function isDailyStage(stage) {
    if (!stage) return false;
    if (stage.isDaily) return true;
    return typeof stage.id === 'string' && stage.id.startsWith(STAGE_PREFIX);
  }

  /* ── 结算 ─────────────────────────────────────────────────── */

  /** 胜利消耗一次（失败不扣，避免"打不过还亏次数"）；返回剩余次数 */
  function consume(dungeonKey, target) {
    const st = ensureDailyState(target);
    if (!st) return 0;
    const left = Number(st.runs[dungeonKey]) || 0;
    if (left <= 0) return 0;
    st.runs[dungeonKey] = left - 1;
    return st.runs[dungeonKey];
  }

  /** 扫荡：扣 N 次 + 走与挂机同一套结算引擎（复用的前提是 rewards 已按副本算好） */
  function sweep(dungeonKey, tierKey, times) {
    const d = gd();
    const st = ensureDailyState(d);
    if (!d || !st) return { ok: false, reason: 'nodata' };
    const stage = findDailyStage(dungeonKey, tierKey) || buildStage(dungeonKey, tierKey);
    if (!stage) return { ok: false, reason: 'nostage' };
    const left = Number(st.runs[dungeonKey]) || 0;
    if (left <= 0) return { ok: false, reason: 'noruns', left: 0 };
    const idle = window.__idle || (window.Game && window.Game.domain && window.Game.domain.idle);
    if (!idle || typeof idle.sweepStage !== 'function') return { ok: false, reason: 'noengine' };
    const n = Math.max(1, Math.min(left, Math.floor(Number(times) || 1)));
    st.runs[dungeonKey] = left - n;
    const res = idle.sweepStage(stage, n);
    return { ok: true, times: n, stage, rewards: (res && res.rewards) || null, left: st.runs[dungeonKey] };
  }

  /* ── 界面视图 ─────────────────────────────────────────────── */

  function getDungeons() {
    const st = ensureDailyState();
    const power = (typeof window.calculateTotalPower === 'function') ? window.calculateTotalPower() : 0;
    return list().map(dg => ({
      key: dg.key,
      name: dg.name,
      icon: dg.icon,
      tone: dg.tone,
      desc: dg.desc,
      left: st ? (Number(st.runs[dg.key]) || 0) : 0,
      max: runsPerDay(),
      tiers: tiers().map(tr => {
        const stage = buildStage(dg.key, tr.key);
        return {
          key: tr.key,
          name: tr.name,
          desc: tr.desc,
          stageId: stage ? stage.id : null,
          recommendedPower: stage ? stage.recommendedPower : 0,
          enough: !!(stage && power >= stage.recommendedPower),
          rewards: stage ? stage.rewards : { exp: 0, gold: 0, items: [] }
        };
      })
    }));
  }

  function summary() {
    const st = ensureDailyState();
    if (!st) return { left: 0, max: runsPerDay(), dungeons: list().length, any: false };
    let left = 0;
    list().forEach(dg => { left += Number(st.runs[dg.key]) || 0; });
    return { left, max: runsPerDay() * list().length, dungeons: list().length, any: left > 0 };
  }

  /* ── 导出 ─────────────────────────────────────────────────── */

  const api = {
    STAGE_PREFIX, FALLBACK,
    config: cfg, list, tiers, runsPerDay, dungeonDef, tierDef, stageIdOf,
    stageIndex, baseStage,
    ensureDailyState, runsLeft,
    rewardsFor, buildEnemies, buildStage, ensureDailyStages, findDailyStage,
    isDailyStage, consume, sweep,
    getDungeons, summary, materialName: materialByName
  };

  const segs = 'Game.domain.daily'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__daily = api;
})();
