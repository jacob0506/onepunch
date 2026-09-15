/**
 * E8 镜像竞技场 —— 数值单源
 * ==========================================================================
 * 一句话：**打"更强的自己"或系统名宿阵容，用段位把成长量化。**
 *
 * 规则：
 *  1. **段位进度 = 连续总星数** `total`（`rankIdx = floor(total / starsPerRank)`）——
 *     赢 +1 星、输 -1 星（0 星不掉段）；满星自动升段；王者满星封顶。
 *  2. **对手强度跟着你走**：名宿阵容的属性 = 基础公式 × 我方队伍平均等级 × 段位系数。
 *     换弱阵容不会让对手变弱（系数 > 1 恒成立），堵死"自降阵容刷分"。
 *  3. **升段赛 = 镜像**（每段最后一星）：对手就是自己上阵队伍的副本 × 段位系数。
 *  4. **段位越高对手越强**（0.85 → 1.45），12 套名宿主题带职业构成与属性修正，
 *     逼出"针对阵容"，而不是一套阵容打到底。
 *  5. **周结算**：跨周按（降段前的）最高段位发周奖并降一段（不低于青铜），
 *     历史最高段位永久保留。
 *  6. **禁 Math.random**（铁律 18）：对手由种子 PRNG 生成（周序号 + 段位进度 + 场次），
 *     同状态必得同对手，不做不可复现的随机。
 *
 * 配置：assets/data/arena.json（拿不到时用内置同值兜底）
 * 导出：Game.domain.arena + window.__arena
 */
(() => {
  'use strict';

  const FALLBACK = {
    version: 1,
    cycleDays: 7,
    anchorDate: '2026-09-14',
    dailyTries: 5,
    starsPerRank: 3,
    winStreakBonus: 3,
    unit: {},
    mirror: {},
    ranks: [{ id: 'bronze', name: '青铜', icon: 'fa-shield', scale: 1, weekly: {} }],
    themes: []
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

  function cfg() {
    const d = (typeof arenaData !== 'undefined' && arenaData) ? arenaData : FALLBACK;
    return d && typeof d === 'object' ? d : FALLBACK;
  }
  function gd() { return (typeof gameData !== 'undefined' && gameData) ? gameData : null; }
  function save() { if (typeof saveGameProgress === 'function') saveGameProgress(); }
  function tplList() {
    return (typeof charactersData !== 'undefined' && Array.isArray(charactersData))
      ? charactersData.filter(c => c && c.id) : [];
  }

  /* ── 周期 ─────────────────────────────────────────────────────────────── */
  function dayKey(ts) {
    const d = ts ? new Date(ts) : new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function daysSinceAnchor(ts) {
    const c = cfg();
    const a = new Date(`${c.anchorDate || '2026-09-14'}T00:00:00`);
    const now = ts ? new Date(ts) : new Date();
    const a0 = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
    const n0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return Math.floor((n0 - a0) / 86400000);
  }
  function weekNo(ts) {
    const cyc = Math.max(1, Number(cfg().cycleDays) || 7);
    return Math.floor(Math.max(0, daysSinceAnchor(ts)) / cyc);
  }
  function daysLeft() {
    const cyc = Math.max(1, Number(cfg().cycleDays) || 7);
    const rem = ((daysSinceAnchor() % cyc) + cyc) % cyc;
    return Math.max(0, cyc - 1 - rem);
  }

  /* ── 段位 ─────────────────────────────────────────────────────────────── */
  function ranks() {
    const r = cfg().ranks;
    return Array.isArray(r) ? r.filter(x => x && x.id) : [];
  }
  function starsPerRank() { return Math.max(1, Number(cfg().starsPerRank) || 3); }
  function maxTotal() { return Math.max(0, ranks().length * starsPerRank() - 1); }
  function clampTotal(v) { return Math.max(0, Math.min(maxTotal(), Math.floor(Number(v) || 0))); }
  function rankIndexOf(total) {
    const list = ranks();
    if (!list.length) return 0;
    return Math.max(0, Math.min(list.length - 1, Math.floor(clampTotal(total) / starsPerRank())));
  }
  function rankOf(total) {
    const list = ranks();
    return list[rankIndexOf(total)] || null;
  }
  function segment(total) {
    const sp = starsPerRank();
    const t = clampTotal(total);
    return {
      total: t,
      rankIdx: rankIndexOf(t),
      rank: rankOf(t),
      star: t % sp,
      starsPerRank: sp,
      isMax: t >= maxTotal(),
      // 升段赛：本段最后一星（也是镜像场）
      isPromotion: (t % sp) === sp - 1 && t < maxTotal()
    };
  }

  /* ── 存档 ─────────────────────────────────────────────────────────────── */
  function ensure() {
    const d = gd();
    if (!d) return null;
    if (!d.arena || typeof d.arena !== 'object') d.arena = {};
    const a = d.arena;
    const wk = weekNo();
    const sp = starsPerRank();
    const maxTries = Math.max(1, Number(cfg().dailyTries) || 5);
    if (typeof a.weekNo !== 'number') a.weekNo = wk;
    if (typeof a.dayKey !== 'string') a.dayKey = dayKey();
    if (typeof a.triesLeft !== 'number') a.triesLeft = maxTries;
    if (typeof a.total !== 'number') a.total = 0;
    if (typeof a.bestTotal !== 'number') a.bestTotal = 0;
    if (typeof a.streak !== 'number') a.streak = 0;
    if (typeof a.wins !== 'number') a.wins = 0;
    if (typeof a.losses !== 'number') a.losses = 0;
    if (typeof a.runs !== 'number') a.runs = 0;
    if (typeof a.weekRuns !== 'number') a.weekRuns = 0;
    if (!a.last || typeof a.last !== 'object') a.last = null;
    a.total = clampTotal(a.total);
    if (a.bestTotal < a.total) a.bestTotal = a.total;

    // 跨日：次数回满
    const today = dayKey();
    if (a.dayKey !== today) {
      a.dayKey = today;
      a.triesLeft = maxTries;
    }
    // 跨周：按上周段位发周奖 → 降一段 → 状态复位（幂等：只在周序号变化时执行一次）
    if (a.weekNo !== wk) {
      const prevRank = rankOf(a.total);
      const lines = [];
      if (prevRank && a.weekRuns > 0) {
        const grant = (window.__goals && typeof window.__goals.grant === 'function') ? window.__goals.grant : null;
        const got = grant ? grant(prevRank.weekly || {}, gd()) : [];
        (got || []).forEach(l => lines.push(l));
      }
      a.lastWeekly = {
        weekNo: a.weekNo,
        rankName: prevRank ? prevRank.name : '',
        lines,
        settled: !!prevRank && a.weekRuns > 0
      };
      a.total = clampTotal(a.total - sp);
      a.weekNo = wk;
      a.weekRuns = 0;
      a.streak = 0;
      a.last = null;
      a.dayKey = dayKey();
      a.triesLeft = maxTries;
    }
    return a;
  }

  /* ── 我方队伍（真实练度 —— 与 E3 同口径） ─────────────────────────────── */
  function formationUnits() {
    const d = gd();
    if (!d) return [];
    const ids = Array.isArray(d.formation) ? d.formation.filter(Boolean) : [];
    return ids.map((id, i) => {
      const inst = (d.characters || []).find(c => c && c.id === id);
      if (!inst) return null;
      let stats = null;
      try {
        stats = (typeof calculateTotalStats === 'function') ? calculateTotalStats(inst) : null;
      } catch (e) { stats = null; }
      if (!stats) stats = { attack: 200, defense: 100, health: 2000, speed: 100 };
      const tpl = tplList().find(c => c && c.id === id);
      const maxHp = Math.max(1, Math.floor(Number(stats.health) || 2000));
      return {
        id,
        name: inst.name || (tpl && tpl.name) || id,
        displayName: inst.name || (tpl && tpl.name) || id,
        class: (tpl && tpl.class) || inst.class || 'warrior',
        position: i < 3 ? 'front' : 'back',
        imageUrl: inst.imageUrl || (tpl && tpl.imageUrl) || '',
        level: Number(inst.level) || 1,
        stars: Number(inst.stars) || 1,
        maxHp,
        currentHp: maxHp,
        attack: Math.max(1, Math.floor(Number(stats.attack) || 200)),
        defense: Math.max(0, Math.floor(Number(stats.defense) || 100)),
        speed: Math.max(1, Math.floor(Number(stats.speed) || 100)),
        critRate: Number(stats.critRate) || 0,
        critDmg: Number(stats.critDmg) || 150,
        blockRate: Number(stats.blockRate) || 0,
        dmgReduc: 0,
        shield: 0,
        skills: (tpl && Array.isArray(tpl.skills)) ? JSON.parse(JSON.stringify(tpl.skills)) : [],
        passiveText: (tpl && tpl.passiveText) || '',
        passiveRuntime: null,
        isEnemy: false
      };
    }).filter(Boolean);
  }
  function teamLevel() {
    const t = formationUnits();
    if (!t.length) return 60;
    return Math.max(1, Math.round(t.reduce((s, u) => s + (u.level || 1), 0) / t.length));
  }
  function teamPower() {
    const t = formationUnits();
    const sumHp = t.reduce((s, u) => s + (u.maxHp || 0), 0);
    const sumAtk = t.reduce((s, u) => s + (u.attack || 0), 0);
    const sumDef = t.reduce((s, u) => s + (u.defense || 0), 0);
    return Math.max(1, sumHp + sumAtk * 12 + sumDef * 8);
  }

  /* ── 对手生成（确定性） ───────────────────────────────────────────────── */
  /** 按主题的职业构成从角色池抽人（同种子必得同阵容） */
  function pickMembers(theme, rnd) {
    const all = tplList();
    if (!all.length) return [];
    const byClass = {};
    all.forEach(t => {
      const k = t.class || 'warrior';
      (byClass[k] = byClass[k] || []).push(t);
    });
    const used = new Set();
    const out = [];
    const comp = (theme && Array.isArray(theme.comp) && theme.comp.length) ? theme.comp : ['warrior', 'mage', 'archer', 'tank', 'healer', 'assassin'];
    comp.forEach((cls) => {
      const pool = (byClass[cls] && byClass[cls].length) ? byClass[cls] : all;
      let pick = null;
      for (let n = 0; n < 6 && !pick; n++) {
        const cand = pool[Math.floor(rnd() * pool.length)];
        if (cand && !used.has(cand.id)) pick = cand;
      }
      if (!pick) pick = pool[Math.floor(rnd() * pool.length)] || null;
      if (pick) { used.add(pick.id); out.push(pick); }
    });
    return out;
  }

  /** 当前对手（升段赛 = 镜像，其余 = 名宿阵容） */
  function opponent() {
    const a = ensure();
    if (!a) return null;
    const seg = segment(a.total);
    const c = cfg();
    const rnd = mulberry32(hashStr(`ar_${a.weekNo}_${a.total}_${a.runs}`));
    const scale = Number(seg.rank && seg.rank.scale) || 1;

    if (seg.isPromotion) {
      // 升段赛：镜像自己（属性副本 × 段位系数）
      const team = formationUnits();
      const m = c.mirror || {};
      return {
        type: 'mirror',
        isMirror: true,
        isPromotion: true,
        id: 'mirror_self',
        name: '镜像 · 更强的自己',
        desc: '对面站着的，是你自己',
        hint: '升段赛：赢下这场，就能迈进下一段',
        scale,
        mods: {
          hpMul: Number(m.hpMul) || 1,
          atkMul: Number(m.atkMul) || 1,
          defMul: Number(m.defMul) || 1
        },
        mirrorTeam: team,
        members: team.map(u => ({ id: u.id, name: u.name, imageUrl: u.imageUrl, class: u.class, level: u.level }))
      };
    }

    const themes = Array.isArray(c.themes) ? c.themes.filter(t => t && t.id) : [];
    if (!themes.length) return null;
    const theme = themes[Math.floor(rnd() * themes.length)];
    const picked = pickMembers(theme, rnd);
    return {
      type: 'legend',
      isMirror: false,
      isPromotion: false,
      id: theme.id,
      name: theme.name,
      desc: theme.desc || '',
      hint: theme.hint || '',
      scale,
      mods: {
        hpMul: Number((theme.mods || {}).hpMul) || 1,
        atkMul: Number((theme.mods || {}).atkMul) || 1,
        spdMul: Number((theme.mods || {}).spdMul) || 1
      },
      members: picked.map(t => ({ id: t.id, name: t.name, imageUrl: t.imageUrl, class: t.class, level: teamLevel() }))
    };
  }

  /** 构造敌方单位（铁律 19：health 与 maxHp 双写）*/
  function buildEnemies(oppArg) {
    const opp = oppArg || opponent();
    if (!opp) return [];
    const c = cfg();
    const u = c.unit || {};
    const lv = teamLevel();
    const scale = opp.scale || 1;
    const mods = opp.mods || {};
    const hpMul = Number(mods.hpMul) || 1;
    const atkMul = Number(mods.atkMul) || 1;
    const spdMul = Number(mods.spdMul) || 1;

    // 镜像：直接复制我方单位的属性（× 系数），连装备与星级都一致
    if (opp.isMirror) {
      return (opp.mirrorTeam || []).map((mu, i) => {
        const hp = Math.max(1, Math.floor((mu.maxHp || 2000) * scale * hpMul));
        return {
          id: `ar_m_${i}`,
          name: mu.name,
          displayName: mu.name,
          class: mu.class || 'warrior',
          isEnemy: true,
          isBoss: false,
          position: i < 3 ? 'front' : 'back',
          level: mu.level || lv,
          stars: mu.stars || 1,
          imageUrl: mu.imageUrl || '',
          maxHp: hp,
          health: hp,
          currentHp: hp,
          attack: Math.max(1, Math.floor((mu.attack || 200) * scale * atkMul)),
          defense: Math.max(0, Math.floor((mu.defense || 100) * scale)),
          speed: Math.max(1, Math.floor((mu.speed || 100) * spdMul)),
          critRate: Number(mu.critRate) || 0,
          critDmg: Number(mu.critDmg) || 150,
          blockRate: Number(mu.blockRate) || 0,
          dmgReduc: 0,
          shield: 0,
          skills: Array.isArray(mu.skills) ? JSON.parse(JSON.stringify(mu.skills)) : [],
          passiveText: mu.passiveText || '',
          passiveRuntime: null,
          statuses: []
        };
      });
    }

    // 名宿：属性以**我方队伍平均属性**为基准（强度跟着你走 —— 这是"更强的自己"的
    // 唯一自洽做法：换弱阵容对手同样变弱，而系数 > 1 恒成立，堵死自降阵容刷分）。
    // unit.* 只在队伍为空时兜底（正常路径不会走到）。
    const team = formationUnits();
    const n = Math.max(1, team.length);
    const avg = {
      hp: team.reduce((s, x) => s + (x.maxHp || 0), 0) / n,
      atk: team.reduce((s, x) => s + (x.attack || 0), 0) / n,
      def: team.reduce((s, x) => s + (x.defense || 0), 0) / n,
      spd: team.reduce((s, x) => s + (x.speed || 0), 0) / n
    };
    const lvlBase = (bb, pp) => Math.floor(bb + lv * pp);
    const src = {
      hp: avg.hp > 0 ? avg.hp : lvlBase(Number(u.hpBase) || 2200, Number(u.hpPerLevel) || 120),
      atk: avg.atk > 0 ? avg.atk : lvlBase(Number(u.atkBase) || 180, Number(u.atkPerLevel) || 12),
      def: avg.def > 0 ? avg.def : lvlBase(Number(u.defBase) || 90, Number(u.defPerLevel) || 6),
      spd: avg.spd > 0 ? avg.spd : (Number(u.spdBase) || 92)
    };
    const tplPool = tplList();
    return (opp.members || []).map((m, i) => {
      const tpl = tplPool.find(x => x && x.id === m.id) || null;
      // 前 3 偏硬（承伤）、后 3 偏输出 —— 与玩家布阵（E2）同构，只看 i 所以仍是确定性的
      const front = i < 3;
      const hp = Math.max(1, Math.floor(src.hp * scale * hpMul * (front ? 1.06 : 0.94)));
      return {
        id: `ar_e_${i}`,
        name: m.name || (tpl && tpl.name) || '名宿',
        displayName: m.name || (tpl && tpl.name) || '名宿',
        class: (tpl && tpl.class) || m.class || 'warrior',
        isEnemy: true,
        isBoss: false,
        position: front ? 'front' : 'back',
        level: lv,
        stars: 1,
        imageUrl: (tpl && tpl.imageUrl) || m.imageUrl || '',
        maxHp: hp,
        health: hp,
        currentHp: hp,
        attack: Math.max(1, Math.floor(src.atk * scale * atkMul * (front ? 0.94 : 1.06))),
        defense: Math.max(0, Math.floor(src.def * scale * (front ? 1.05 : 0.95))),
        speed: Math.max(1, Math.floor(src.spd * spdMul) + (i % 3)),
        critRate: 5,
        critDmg: 150,
        blockRate: 2,
        dmgReduc: 0,
        shield: 0,
        skills: (tpl && Array.isArray(tpl.skills)) ? JSON.parse(JSON.stringify(tpl.skills)) : [],
        passiveText: '',
        passiveRuntime: null,
        statuses: []
      };
    });
  }

  function enemyPower(oppArg) {
    const es = buildEnemies(oppArg);
    const sumHp = es.reduce((s, x) => s + (x.maxHp || 0), 0);
    const sumAtk = es.reduce((s, x) => s + (x.attack || 0), 0);
    const sumDef = es.reduce((s, x) => s + (x.defense || 0), 0);
    return Math.max(1, sumHp + sumAtk * 12 + sumDef * 8);
  }

  /* ── 构造 stage ───────────────────────────────────────────────────────── */
  function buildStage() {
    const a = ensure();
    if (!a) return null;
    const seg = segment(a.total);
    const opp = opponent();
    if (!opp) return null;
    const enemies = buildEnemies();
    if (!enemies.length) return null;
    const stage = {
      id: `ar_${a.weekNo}_${seg.total}`,
      name: `竞技场 · ${(seg.rank && seg.rank.name) || ''}${seg.star + 1} 星${opp.isMirror ? '（升段赛）' : ' · ' + opp.name}`,
      isArena: true,
      chapter: opp.isMirror ? '升段赛 · 镜像' : '名宿阵容',
      arenaInfo: {
        total: seg.total, rankIdx: seg.rankIdx, star: seg.star,
        rankId: seg.rank ? seg.rank.id : '', rankName: seg.rank ? seg.rank.name : '',
        isPromotion: seg.isPromotion, oppType: opp.type, oppName: opp.name, scale: opp.scale
      },
      enemies,
      rewards: { exp: 0, gold: 0, items: [] },
      modifiers: { affixes: [] }
    };
    if (Array.isArray(stagesData)) {
      const at = stagesData.findIndex(s => s && s.id === stage.id);
      if (at >= 0) stagesData[at] = stage; else stagesData.push(stage);
    }
    return stage;
  }

  /* ── 开打 / 结算 ──────────────────────────────────────────────────────── */
  function canFight() {
    const a = ensure();
    if (!a) return { ok: false, reason: 'no_save' };
    if (formationUnits().length === 0) return { ok: false, reason: 'empty_formation' };
    if (a.triesLeft <= 0) return { ok: false, reason: 'no_tries' };
    return { ok: true, left: a.triesLeft };
  }

  function start() {
    const chk = canFight();
    if (!chk.ok) return chk;
    const a = ensure();
    const stage = buildStage();
    if (!stage) return { ok: false, reason: 'build_failed' };
    a.triesLeft -= 1;
    a.runs += 1;
    a.weekRuns += 1;
    save();
    return { ok: true, stageId: stage.id };
  }

  /** 战斗结束回写成绩（scene.js 由 fallback_hud 调用） */
  function captureResult(isWin) {
    const a = ensure();
    if (!a) return { ok: false };
    const win = !!isWin;
    const before = a.total;
    const segBefore = segment(before);
    const beforeRankIdx = segBefore.rankIdx;
    let starDelta = 0;
    let streakBonus = 0;

    if (win) {
      a.wins += 1;
      a.streak += 1;
      starDelta = 1;
      // 连胜奖励：每连赢 winStreakBonus 场额外 +1 星
      const bonusEvery = Math.max(0, Number(cfg().winStreakBonus) || 0);
      if (bonusEvery > 0 && a.streak % bonusEvery === 0) {
        starDelta += 1;
        streakBonus = 1;
      }
      if (before < maxTotal()) a.total = clampTotal(before + starDelta);
      else starDelta = 0;
    } else {
      a.losses += 1;
      a.streak = 0;
      starDelta = before > 0 ? -1 : 0;
      a.total = clampTotal(before + starDelta);
    }
    if (a.total > a.bestTotal) a.bestTotal = a.total;

    const segAfter = segment(a.total);
    const promoted = segAfter.rankIdx > beforeRankIdx;
    const demoted = segAfter.rankIdx < beforeRankIdx;

    a.last = {
      win,
      at: Date.now(),
      totalBefore: before,
      totalAfter: a.total,
      starDelta,
      streakBonus,
      promoted,
      demoted,
      streak: a.streak,
      rankName: segAfter.rank ? segAfter.rank.name : '',
      bestTotal: a.bestTotal,
      isMax: segAfter.isMax
    };
    // 埋点：胜利计入今日目标 / 累计统计（单源，不自己加钱）
    if (win && typeof window.bumpGoal === 'function') {
      try { window.bumpGoal('arena_win', 1); } catch (e) { /* 埋点失败不影响战斗结算 */ }
    }
    save();
    return { ok: true, ...a.last };
  }

  /** 手动放弃当前段位进度（不清次数，用于测试/重置）*/
  function resetProgress() {
    const a = ensure();
    if (!a) return { ok: false };
    a.total = 0;
    a.streak = 0;
    save();
    return { ok: true };
  }

  /* ── 摘要（UI） ───────────────────────────────────────────────────────── */
  function summary() {
    const a = ensure();
    if (!a) return null;
    const seg = segment(a.total);
    const list = ranks();
    const sp = starsPerRank();
    const opp = opponent();
    return {
      weekNo: a.weekNo,
      daysLeft: daysLeft(),
      total: seg.total,
      maxTotal: maxTotal(),
      rankIdx: seg.rankIdx,
      rank: seg.rank,
      rankCount: list.length,
      star: seg.star,
      starsPerRank: sp,
      isMax: seg.isMax,
      isPromotion: seg.isPromotion,
      bestTotal: a.bestTotal,
      bestRank: rankOf(a.bestTotal),
      triesLeft: a.triesLeft,
      maxTries: Math.max(1, Number(cfg().dailyTries) || 5),
      streak: a.streak,
      winStreakBonus: Math.max(0, Number(cfg().winStreakBonus) || 0),
      wins: a.wins,
      losses: a.losses,
      runs: a.runs,
      weekRuns: a.weekRuns,
      last: a.last || null,
      lastWeekly: a.lastWeekly || null,
      opponent: opp ? {
        type: opp.type, isMirror: opp.isMirror, isPromotion: opp.isPromotion,
        id: opp.id, name: opp.name, desc: opp.desc, hint: opp.hint,
        scale: opp.scale, power: enemyPower(opp),
        members: opp.members || []
      } : null,
      myPower: teamPower(),
      ranks: list.map((r, i) => ({
        id: r.id, name: r.name, icon: r.icon, scale: r.scale,
        weekly: r.weekly || {},
        reached: a.bestTotal >= (i + 1) * sp - 1,
        current: i === seg.rankIdx
      }))
    };
  }

  const api = {
    cfg, weekNo, dayKey, daysLeft,
    ranks, rankOf, rankIndexOf, segment, starsPerRank, maxTotal, clampTotal,
    ensure, formationUnits, teamLevel, teamPower,
    opponent, buildEnemies, enemyPower, buildStage,
    canFight, start, captureResult, resetProgress, summary
  };
  if (window.Game && window.Game.domain) window.Game.domain.arena = api;
  window.__arena = api;
})();
