/**
 * E3 周期挑战（周常机制首领）—— 数值单源
 * ==========================================================================
 * 设计要点：
 *  1. **全确定性**：机制按周序号轮换（cycleDays=7，锚点 anchorDate），Boss 属性
 *     由上阵队伍推导 —— 无 Math.random（铁律 18：不能动全局 RNG 流，否则
 *     数值快照会"无缘无故"漂移）。回归可断言"同一周同一队伍必得同一 Boss"。
 *  2. **分数 = 累计伤害**：首领血量刻意打不完，打满回合上限为止；分数进档位发奖。
 *     档位是**固定数值**，而队伍会成长 ⇒ 练度提升直接兑换成更高档位（长线目标）。
 *  3. **不推进主线**：与 daily/expedition 同构，走 fallback_hud 的 isChallengeStage 分支。
 *  4. **发奖走单源**：`window.__goals.grant`（金币 / 钻石 / 材料），不自己加钱。
 *
 * 配置：assets/data/challenge.json（拿不到时用内置同值兜底）
 * 导出：Game.domain.challenge + window.__challenge
 */
(() => {
  const FALLBACK = {
    version: 1,
    cycleDays: 7,
    anchorDate: '2026-09-14',
    dailyTries: 3,
    boss: { hpPerPower: 8, atkPerPower: 0.05, defPerPower: 0.06, spd: 96, critRate: 10, dmgReduc: 5 },
    bosses: [],
    mechanics: {},
    tiers: [],
    rewards: { perTryGold: 2000 }
  };

  function cfg() {
    const d = (typeof challengeData !== 'undefined' && challengeData) ? challengeData : FALLBACK;
    return d && typeof d === 'object' ? d : FALLBACK;
  }
  function gd() { return (typeof gameData !== 'undefined' && gameData) ? gameData : null; }
  function save() { if (typeof saveGameProgress === 'function') saveGameProgress(); }

  /* ── 周期计算 ─────────────────────────────────────────────────────────── */
  function dayKey(ts) {
    const d = ts ? new Date(ts) : new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  /** 从锚点起算的天数（本地时区，按天取整） */
  function daysSinceAnchor(ts) {
    const c = cfg();
    const a = new Date(`${c.anchorDate || '2026-09-14'}T00:00:00`);
    const now = ts ? new Date(ts) : new Date();
    const a0 = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
    const n0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return Math.floor((n0 - a0) / 86400000);
  }
  function weekNo(ts) {
    const c = cfg();
    const cyc = Math.max(1, Number(c.cycleDays) || 7);
    return Math.floor(Math.max(0, daysSinceAnchor(ts)) / cyc);
  }

  /** 本周首领（确定性轮换：weekNo % bosses.length） */
  function currentBoss(ts) {
    const c = cfg();
    const list = Array.isArray(c.bosses) ? c.bosses.filter(b => b && b.id) : [];
    if (!list.length) return null;
    const i = weekNo(ts) % list.length;
    return list[i];
  }
  function mechanicOf(id) {
    const c = cfg();
    const m = c.mechanics || {};
    const def = m[id];
    if (!def) return null;
    return { id, ...def };
  }
  /** 本周机制（含 params 与回合上限） */
  function currentMechanic(ts) {
    const b = currentBoss(ts);
    if (!b || !b.mechanic) return null;
    return mechanicOf(b.mechanic);
  }

  /* ── 存档结构 ─────────────────────────────────────────────────────────── */
  function ensure() {
    const d = gd();
    if (!d) return null;
    if (!d.challenge || typeof d.challenge !== 'object') d.challenge = {};
    const e = d.challenge;
    const wk = weekNo();
    if (typeof e.weekNo !== 'number') e.weekNo = wk;
    if (typeof e.dayKey !== 'string') e.dayKey = dayKey();
    if (typeof e.triesLeft !== 'number') e.triesLeft = Math.max(1, Number(cfg().dailyTries) || 3);
    if (typeof e.best !== 'number') e.best = 0;
    if (typeof e.historyBest !== 'number') e.historyBest = 0;
    if (typeof e.historyMaxHit !== 'number') e.historyMaxHit = 0;
    if (typeof e.runs !== 'number') e.runs = 0;
    if (!Array.isArray(e.claimed)) e.claimed = [];
    if (!e.last || typeof e.last !== 'object') e.last = null;
    // 跨周 / 跨日重置（次数每日回满，档位每周重领，历史最佳永不重置）
    const today = dayKey();
    if (e.dayKey !== today) {
      e.dayKey = today;
      e.triesLeft = Math.max(1, Number(cfg().dailyTries) || 3);
    }
    if (e.weekNo !== wk) {
      e.weekNo = wk;
      e.best = 0;
      e.claimed = [];
      e.last = null;
    }
    return e;
  }

  /* ── 队伍与首领属性 ───────────────────────────────────────────────────── */
  /** 上阵队伍的镜像单位（与 E1 同口径：统一档位、无装备 —— 但不是必须，这里取真实养成）
   *  ⚠️ 周期挑战用**真实练度**：这是"我这套阵容到底行不行"的标尺，镜像就失去意义了。 */
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
      const tpl = (typeof charactersData !== 'undefined' && Array.isArray(charactersData))
        ? charactersData.find(c => c && c.id === id) : null;
      return {
        id,
        name: inst.name || (tpl && tpl.name) || id,
        displayName: inst.name || (tpl && tpl.name) || id,
        class: (tpl && tpl.class) || (inst.class) || 'warrior',
        position: i < 3 ? 'front' : 'back',
        imageUrl: inst.imageUrl || (tpl && tpl.imageUrl) || '',
        level: Number(inst.level) || 1,
        stars: Number(inst.stars) || 1,
        maxHp: Math.max(1, Math.floor(Number(stats.health) || 2000)),
        currentHp: Math.max(1, Math.floor(Number(stats.health) || 2000)),
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

  /** 由队伍推导首领属性（确定性 —— 同队伍必得同首领） */
  function buildBossUnit() {
    const c = cfg();
    const bc = c.boss || {};
    const team = formationUnits();
    const n = team.length || 1;
    const sumHp = team.reduce((s, u) => s + (u.maxHp || 0), 0);
    const sumAtk = team.reduce((s, u) => s + (u.attack || 0), 0);
    const sumDef = team.reduce((s, u) => s + (u.defense || 0), 0);
    // 队伍强度 = 生命 + 攻/防折算（与 calculateCharacterPower 思路一致但独立，避免耦合）
    const power = Math.max(1, sumHp + sumAtk * 12 + sumDef * 8);
    const boss = currentBoss();
    const hp = Math.max(1000, Math.floor(power * (Number(bc.hpPerPower) || 8)));
    return {
      id: (boss && boss.id) || 'ch_boss',
      name: (boss && boss.name) || '周常首领',
      displayName: (boss && boss.name) || '周常首领',
      class: (boss && boss.class) || 'warrior',
      isEnemy: true,
      isBoss: true,
      position: 'front',
      level: Math.max(1, Math.round(team.reduce((s, u) => s + (u.level || 1), 0) / n)),
      stars: 5,
      maxHp: hp,
      currentHp: hp,
      attack: Math.max(1, Math.floor(sumAtk / n * (Number(bc.atkPerPower) || 0.05) * 20)),
      defense: Math.max(0, Math.floor(sumDef / n * (Number(bc.defPerPower) || 0.06) * 20)),
      speed: Number(bc.spd) || 96,
      critRate: Number(bc.critRate) || 10,
      critDmg: 150,
      blockRate: 0,
      dmgReduc: Number(bc.dmgReduc) || 5,
      shield: 0,
      imageUrl: (boss && boss.imageUrl) || '',
      skills: [],
      passiveText: '',
      passiveRuntime: null,
      statuses: []
    };
  }

  /* ── 构造 stage ───────────────────────────────────────────────────────── */
  function buildStage() {
    const e = ensure();
    if (!e) return null;
    const boss = currentBoss();
    const mech = currentMechanic();
    if (!boss) return null;
    const unit = buildBossUnit();
    const stage = {
      id: `ch_${weekNo()}`,
      name: `${(cfg().boss && cfg().boss.namePrefix) || '周常首领'} · ${boss.name}`,
      isChallenge: true,
      chapter: (boss.title || ''),
      enemies: [unit],
      challengeMechanics: mech ? { id: mech.id, params: mech, roundLimit: Number(mech.roundLimit) || 15 } : null,
      rewards: { exp: 0, gold: Number((cfg().rewards || {}).perTryGold) || 0, items: [] },
      modifiers: { affixes: [] }
    };
    if (Array.isArray(stagesData)) {
      const at = stagesData.findIndex(s => s && s.id === stage.id);
      if (at >= 0) stagesData[at] = stage; else stagesData.push(stage);
    }
    return stage;
  }

  /* ── 挑战流程 ─────────────────────────────────────────────────────────── */
  function canFight() {
    const e = ensure();
    if (!e) return { ok: false, reason: 'no_save' };
    if (formationUnits().length === 0) return { ok: false, reason: 'empty_formation' };
    if (e.triesLeft <= 0) return { ok: false, reason: 'no_tries' };
    return { ok: true, left: e.triesLeft };
  }

  /** 开打：扣次数 + 返回 stageId */
  function start() {
    const chk = canFight();
    if (!chk.ok) return chk;
    const e = ensure();
    const stage = buildStage();
    if (!stage) return { ok: false, reason: 'build_failed' };
    e.triesLeft -= 1;
    e.runs += 1;
    save();
    return { ok: true, stageId: stage.id };
  }

  /** 战斗结束回写分数（scene.js 在 closeBattleSceneDebug 前调用） */
  function captureDamage(total, maxHit, isWin) {
    const e = ensure();
    if (!e) return { ok: false };
    const dmg = Math.max(0, Math.floor(Number(total) || 0));
    const hit = Math.max(0, Math.floor(Number(maxHit) || 0));
    e.last = { damage: dmg, maxHit: hit, win: !!isWin, at: Date.now() };
    const isRecord = dmg > (e.best || 0);
    if (isRecord) e.best = dmg;
    if (dmg > (e.historyBest || 0)) e.historyBest = dmg;
    if (hit > (e.historyMaxHit || 0)) e.historyMaxHit = hit;

    // 档位发奖（走 goals.grant 单源）—— 只发新达成的
    const tiers = Array.isArray(cfg().tiers) ? cfg().tiers : [];
    const gained = [];
    tiers.forEach((t, i) => {
      if (dmg < (Number(t.damage) || 0)) return;
      if (e.claimed.includes(i)) return;
      e.claimed.push(i);
      const grant = (window.__goals && typeof window.__goals.grant === 'function')
        ? window.__goals.grant : null;
      const lines = grant ? grant(t.rewards || {}, gd()) : [];
      gained.push({ index: i, label: t.label || `第 ${i + 1} 档`, damage: t.damage, lines });
    });
    save();
    return { ok: true, damage: dmg, isRecord, gained };
  }

  /* ── 摘要（UI） ───────────────────────────────────────────────────────── */
  function tierProgress() {
    const e = ensure();
    const best = e ? (e.best || 0) : 0;
    const tiers = Array.isArray(cfg().tiers) ? cfg().tiers : [];
    return tiers.map((t, i) => ({
      index: i,
      damage: Number(t.damage) || 0,
      label: t.label || `第 ${i + 1} 档`,
      rewards: t.rewards || {},
      reached: best >= (Number(t.damage) || 0),
      claimed: e ? e.claimed.includes(i) : false,
      pct: Math.min(100, Math.round(best / Math.max(1, Number(t.damage) || 1) * 100))
    }));
  }

  function summary() {
    const e = ensure();
    const boss = currentBoss();
    const mech = currentMechanic();
    const c = cfg();
    if (!e) return null;
    return {
      weekNo: weekNo(),
      boss: boss || null,
      mechanic: mech || null,
      triesLeft: e.triesLeft,
      maxTries: Math.max(1, Number(c.dailyTries) || 3),
      best: e.best || 0,
      historyBest: e.historyBest || 0,
      historyMaxHit: e.historyMaxHit || 0,
      last: e.last || null,
      tiers: tierProgress(),
      // 距离重置还有几天（周期内剩余天数）
      daysLeft: Math.max(0, (Math.max(1, Number(c.cycleDays) || 7) - (daysSinceAnchor() % Math.max(1, Number(c.cycleDays) || 7))) % Math.max(1, Number(c.cycleDays) || 7))
    };
  }

  const api = {
    cfg, weekNo, dayKey, currentBoss, currentMechanic, mechanicOf,
    ensure, formationUnits, buildBossUnit, buildStage,
    canFight, start, captureDamage, tierProgress, summary
  };
  if (window.Game && window.Game.domain) window.Game.domain.challenge = api;
  window.__challenge = api;
})();
