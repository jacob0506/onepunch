/**
 * E4 多队远征 —— 数值单源
 * ==========================================================================
 * 与 E1 肉鸽远征的分工：
 *   E1 = **局内随机**（镜像队伍 + 祝福 build，一局的变数）
 *   E4 = **局外规划**（真实练度 + 3 队轮换，把 111 角色池吃干净）
 *
 * 规则：
 *  1. 3 支队伍，每队最多 6 人，**成员跨队互不重复**（编队即策略：谁跟谁一组）。
 *  2. 一条 12 层推进线，每层选一支还有战斗力的队伍上阵；队伍生命**跨层累计**，
 *     到达营地（restLayers）全体按比例恢复。
 *  3. 某队全员倒下 ⇒ 该队出局；3 队全灭 ⇒ 本轮结束，按到达层数发奖。
 *  4. 每周重置（与 E3 同周期），历史最高层数永久保留。
 *  5. **禁 Math.random**（铁律 18）：地图/敌人用种子 PRNG，不碰全局 RNG 流。
 *
 * 配置：assets/data/squads.json（拿不到时用内置同值兜底）
 * 导出：Game.domain.squads + window.__squads
 */
(() => {
  const FALLBACK = {
    version: 1,
    cycleDays: 7,
    anchorDate: '2026-09-14',
    squadCount: 3,
    teamSize: 6,
    layers: 12,
    enemyScaleByLayer: [0.85, 0.95, 1.05, 1.15, 1.3, 1.45, 1.6, 1.75, 1.95, 2.15, 2.4, 2.7],
    restLayers: [4, 8],
    restHealPct: 30,
    rewards: { perLayerGold: 3000, perLayerExp: 500, clearByLayer: [] },
    nodeLabels: []
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
    const d = (typeof squadsData !== 'undefined' && squadsData) ? squadsData : FALLBACK;
    return d && typeof d === 'object' ? d : FALLBACK;
  }
  function gd() { return (typeof gameData !== 'undefined' && gameData) ? gameData : null; }
  function save() { if (typeof saveGameProgress === 'function') saveGameProgress(); }

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

  /* ── 编队存档 ─────────────────────────────────────────────────────────── */
  function teams() {
    const d = gd();
    if (!d) return [];
    if (!d.squads || typeof d.squads !== 'object') d.squads = {};
    const s = d.squads;
    const n = Math.max(1, Number(cfg().squadCount) || 3);
    const size = Math.max(1, Number(cfg().teamSize) || 6);
    if (!Array.isArray(s.teams) || s.teams.length !== n) {
      s.teams = Array.from({ length: n }, () => Array.from({ length: size }, () => null));
    }
    s.teams.forEach((t) => {
      if (!Array.isArray(t)) return;
      while (t.length < size) t.push(null);
    });
    // 清理：不存在 / 未拥有的角色，以及跨队重复（保留首次出现）
    const owned = new Set((d.characters || []).map(c => c && c.id));
    const seen = new Set();
    s.teams.forEach((t) => {
      for (let i = 0; i < t.length; i++) {
        const id = t[i];
        if (!id || !owned.has(id) || seen.has(id)) { t[i] = null; continue; }
        seen.add(id);
      }
    });
    return s.teams;
  }

  /** 放入成员；跨队互斥（同角色已在别队 ⇒ 拒绝） */
  function setMember(teamIdx, slotIdx, charId) {
    const d = gd();
    if (!d) return { ok: false, reason: 'no_save' };
    const ts = teams();
    const t = ts[teamIdx];
    if (!t) return { ok: false, reason: 'bad_team' };
    if (slotIdx < 0 || slotIdx >= t.length) return { ok: false, reason: 'bad_slot' };
    if (charId) {
      const dup = findTeamOf(charId);
      if (dup && !(dup.team === teamIdx && dup.slot === slotIdx)) {
        return { ok: false, reason: 'duplicate', team: dup.team, slot: dup.slot };
      }
    }
    t[slotIdx] = charId || null;
    save();
    return { ok: true };
  }
  function findTeamOf(charId) {
    const ts = teams();
    for (let i = 0; i < ts.length; i++) {
      const j = ts[i].indexOf(charId);
      if (j >= 0) return { team: i, slot: j };
    }
    return null;
  }
  /** 剩余未编入任何队伍的已拥有角色 */
  function pool() {
    const d = gd();
    if (!d) return [];
    const used = new Set();
    teams().forEach(t => t.forEach(id => { if (id) used.add(id); }));
    return (d.characters || []).filter(c => c && !used.has(c.id));
  }

  /** 一键编队：按战力降序轮转分配（0→1→2→0…），并尽量让每队职业均衡 */
  function autoDeploy() {
    const d = gd();
    if (!d) return { ok: false, reason: 'no_save' };
    const c = cfg();
    const size = Math.max(1, Number(c.teamSize) || 6);
    const n = Math.max(1, Number(c.squadCount) || 3);
    const owned = (d.characters || []).slice();
    const power = (ch) => {
      try { return (typeof calculateCharacterPower === 'function') ? calculateCharacterPower(ch) : 0; }
      catch (e) { return 0; }
    };
    owned.sort((a, b) => power(b) - power(a));
    const picked = owned.slice(0, size * n);
    if (!picked.length) return { ok: false, reason: 'no_chars' };
    const next = Array.from({ length: n }, () => []);
    // 轮转分配：保证三队强度接近（顺序贪心 + 蛇形，避免 1 队独强）
    picked.forEach((ch, i) => {
      const round = Math.floor(i / n);
      const idx = (round % 2 === 0) ? (i % n) : (n - 1 - (i % n));
      next[idx].push(ch.id);
    });
    const ts = teams();
    ts.forEach((t, i) => {
      for (let k = 0; k < t.length; k++) t[k] = (next[i] && next[i][k]) || null;
    });
    d.squads.teams = ts;
    save();
    return { ok: true, teams: ts.map(t => t.filter(Boolean).length) };
  }

  function clearTeams() {
    const ts = teams();
    ts.forEach(t => { for (let i = 0; i < t.length; i++) t[i] = null; });
    save();
    return { ok: true };
  }

  /* ── 推进存档 ─────────────────────────────────────────────────────────── */
  function run_() {
    const d = gd();
    if (!d) return null;
    if (!d.squads || typeof d.squads !== 'object') d.squads = {};
    const s = d.squads;
    const wk = weekNo();
    if (typeof s.weekNo !== 'number') s.weekNo = wk;
    if (!s.run || typeof s.run !== 'object') s.run = null;
    if (s.weekNo !== wk) { s.weekNo = wk; s.run = null; }   // 跨周重置
    if (typeof s.bestLayer !== 'number') s.bestLayer = 0;
    if (!Array.isArray(s.log)) s.log = [];
    return s.run;
  }

  function startRun() {
    const d = gd();
    if (!d) return { ok: false, reason: 'no_save' };
    const c = cfg();
    const s = d.squads;
    const ts = teams();
    if (!ts.some(t => t.some(Boolean))) return { ok: false, reason: 'empty_teams' };
    s.weekNo = weekNo();
    s.run = {
      weekNo: weekNo(),
      layer: 0,
      activeTeam: null,
      hp: {},          // { teamIdx: { charId: ratio } }
      cleared: false,
      gold: 0
    };
    s.log = [];
    save();
    return { ok: true, layer: 1, layers: Number(c.layers) || 12 };
  }

  function teamAliveRatio(teamIdx) {
    const r = run_();
    const ts = teams();
    if (!r) return 0;
    const t = ts[teamIdx] || [];
    const map = r.hp[teamIdx] || {};
    const ids = t.filter(Boolean);
    if (!ids.length) return 0;
    const sum = ids.reduce((acc, id) => acc + ratioOf(map[id]), 0);
    return sum / ids.length;
  }
  /** HP 比例读取：缺省视为满血，非法值兜底为 1（NaN 会让整支队伍判定失能） */
  function ratioOf(raw) {
    if (raw === undefined || raw === null) return 1;
    const v = Number(raw);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
  }
  function teamUsable(teamIdx) {
    const ts = teams();
    const t = ts[teamIdx] || [];
    if (!t.some(Boolean)) return false;
    return teamAliveRatio(teamIdx) > 0;
  }

  /* ── 单位构建 ─────────────────────────────────────────────────────────── */
  function buildTeamUnits(teamIdx) {
    const d = gd();
    const r = run_();
    const ts = teams();
    if (!d || !r) return [];
    const t = ts[teamIdx] || [];
    const map = r.hp[teamIdx] || {};
    return t.map((id, i) => {
      if (!id) return null;
      const inst = (d.characters || []).find(c => c && c.id === id);
      if (!inst) return null;
      let stats = null;
      try { stats = (typeof calculateTotalStats === 'function') ? calculateTotalStats(inst) : null; } catch (e) { stats = null; }
      if (!stats) stats = { attack: 200, defense: 100, health: 2000, speed: 100 };
      const tpl = (typeof charactersData !== 'undefined' && Array.isArray(charactersData))
        ? charactersData.find(c => c && c.id === id) : null;
      const ratio = ratioOf(map[id]);
      if (ratio <= 0) return null;   // 已阵亡，不上场
      const maxHp = Math.max(1, Math.floor(Number(stats.health) || 2000));
      return {
        id,
        name: inst.name || (tpl && tpl.name) || id,
        displayName: inst.name || (tpl && tpl.name) || id,
        class: (tpl && tpl.class) || 'warrior',
        position: i < 3 ? 'front' : 'back',
        imageUrl: inst.imageUrl || (tpl && tpl.imageUrl) || '',
        level: Number(inst.level) || 1,
        stars: Number(inst.stars) || 1,
        maxHp,
        currentHp: Math.max(1, Math.floor(maxHp * ratio)),
        attack: Math.max(1, Math.floor(Number(stats.attack) || 200)),
        defense: Math.max(0, Math.floor(Number(stats.defense) || 100)),
        speed: Math.max(1, Math.floor(Number(stats.speed) || 100)),
        critRate: Number(stats.critRate) || 0,
        critDmg: Number(stats.critDmg) || 150,
        blockRate: Number(stats.blockRate) || 0,
        dmgReduc: 0, shield: 0,
        skills: (tpl && Array.isArray(tpl.skills)) ? JSON.parse(JSON.stringify(tpl.skills)) : [],
        passiveText: (tpl && tpl.passiveText) || '',
        passiveRuntime: null,
        isEnemy: false
      };
    }).filter(Boolean);
  }

  /** 敌人：从角色模板按种子抽（复用现有立绘），属性 = 模板镜像 × 层系数 */
  function buildEnemies(layer) {
    const c = cfg();
    const r = run_();
    const scales = Array.isArray(c.enemyScaleByLayer) ? c.enemyScaleByLayer : [1];
    const scale = scales[Math.min(layer, scales.length - 1)] || 1;
    const rnd = mulberry32(hashStr(`sq_${r ? r.weekNo : 0}_${layer}`));
    const used = new Set();
    teams().forEach(t => t.forEach(id => { if (id) used.add(id); }));
    const poolList = (typeof charactersData !== 'undefined' && Array.isArray(charactersData))
      ? charactersData.filter(x => x && !used.has(x.id)) : [];
    const n = Math.max(1, Math.min(6, 3 + Math.floor(layer / 3)));
    const out = [];
    for (let i = 0; i < n; i++) {
      const tpl = poolList.length ? poolList[Math.floor(rnd() * poolList.length)] : null;
      const lv = 60 + layer * 4;
      const base = tpl ? {
        name: tpl.name, displayName: tpl.name, class: tpl.class || 'warrior',
        imageUrl: tpl.imageUrl || ''
      } : { name: '守军', displayName: '守军', class: 'warrior', imageUrl: '' };
      const hp = Math.floor((2200 + lv * 120) * scale);
      out.push({
        id: `sq_e_${layer}_${i}`,
        ...base,
        isEnemy: true,
        isBoss: layer === (Number(c.layers) || 12) - 1 && i === 0,
        position: i < 3 ? 'front' : 'back',
        level: lv, stars: 1,
        maxHp: hp, health: hp, currentHp: hp,
        attack: Math.floor((180 + lv * 12) * scale),
        defense: Math.floor((90 + lv * 6) * scale),
        speed: 90 + (i % 3) * 5,
        critRate: 5, critDmg: 150, blockRate: 2, dmgReduc: 0, shield: 0,
        skills: (tpl && Array.isArray(tpl.skills)) ? JSON.parse(JSON.stringify(tpl.skills)) : [],
        passiveText: '', passiveRuntime: null, statuses: []
      });
    }
    return out;
  }

  /** 构造本层 stage（teamIdx 决定上阵队伍） */
  function buildStage(teamIdx) {
    const d = gd();
    const r = run_();
    const c = cfg();
    if (!d || !r) return null;
    if (!teamUsable(teamIdx)) return null;
    const units = buildTeamUnits(teamIdx);
    if (!units.length) return null;
    const layer = r.layer || 0;
    const labels = Array.isArray(c.nodeLabels) ? c.nodeLabels : [];
    const stage = {
      id: `sq_${r.weekNo}_${layer}_${teamIdx}`,
      name: `远征队 · 第 ${layer + 1} 层${labels[layer] ? '·' + labels[layer] : ''}`,
      isSquadRun: true,
      squadTeam: teamIdx,
      squadLayer: layer,
      enemies: buildEnemies(layer),
      squadTeam_units: units,
      rewards: {
        exp: Number((c.rewards || {}).perLayerExp) || 0,
        gold: Number((c.rewards || {}).perLayerGold) || 0,
        items: []
      },
      modifiers: { affixes: [] }
    };
    if (Array.isArray(stagesData)) {
      const at = stagesData.findIndex(s => s && s.id === stage.id);
      if (at >= 0) stagesData[at] = stage; else stagesData.push(stage);
    }
    return stage;
  }

  /** 选队上阵：记录 activeTeam，返回 stageId */
  function choose(teamIdx) {
    const r = run_();
    if (!r) return { ok: false, reason: 'no_run' };
    if (r.cleared) return { ok: false, reason: 'finished' };
    if (!teamUsable(teamIdx)) return { ok: false, reason: 'team_down' };
    const st = buildStage(teamIdx);
    if (!st) return { ok: false, reason: 'build_failed' };
    r.activeTeam = teamIdx;
    save();
    return { ok: true, stageId: st.id, layer: (r.layer || 0) + 1 };
  }

  /** 战斗结束回写 HP（scene.js 在 closeBattleSceneDebug 前调用） */
  function captureTeam(units, isWin) {
    const d = gd();
    const r = run_();
    if (!d || !r || r.activeTeam === null || r.activeTeam === undefined) return { ok: false };
    const ti = r.activeTeam;
    if (!r.hp[ti]) r.hp[ti] = {};
    (units || []).forEach(u => {
      if (!u || !u.id) return;
      const ratio = Math.max(0, Math.min(1, (u.currentHp || 0) / Math.max(1, u.maxHp || 1)));
      r.hp[ti][u.id] = (u.currentHp > 0) ? ratio : 0;
    });
    // 没上场的成员（已在上一场倒下）保持 0
    save();
    return { ok: true, team: ti };
  }

  /** 结算本层并推进（胜利后调用） */
  function advance(isWin) {
    const d = gd();
    const r = run_();
    const c = cfg();
    if (!d || !r) return { ok: false, reason: 'no_run' };
    const total = Math.max(1, Number(c.layers) || 12);
    const res = { ok: true, win: !!isWin, reward: null, healed: false };

    if (!isWin) {
      // 失败：不推进，但队伍 HP 已保留（下次可换队再上）
      r.activeTeam = null;
      save();
      return res;
    }

    const layer = r.layer || 0;
    const gold = Number((c.rewards || {}).perLayerGold) || 0;
    const exp = Number((c.rewards || {}).perLayerExp) || 0;
    if (gold || exp) {
      const grant = (window.__goals && typeof window.__goals.grant === 'function') ? window.__goals.grant : null;
      const lines = grant ? grant({ gold }, gd()) : [];
      res.reward = { gold, exp, lines };
    }
    r.gold = (r.gold || 0) + gold;
    r.layer = layer + 1;
    r.activeTeam = null;
    d.squads.log = [`第 ${layer + 1} 层已通过`].concat(d.squads.log || []).slice(0, 20);
    if (r.layer > (d.squads.bestLayer || 0)) d.squads.bestLayer = r.layer;

    // 营地：全体恢复
    const rests = Array.isArray(c.restLayers) ? c.restLayers : [];
    if (rests.includes(r.layer)) {
      const pct = Math.max(0, Number(c.restHealPct) || 0) / 100;
      Object.keys(r.hp).forEach(ti => {
        Object.keys(r.hp[ti]).forEach(id => {
          r.hp[ti][id] = Math.min(1, Math.max(0, Number(r.hp[ti][id]) || 0) + pct);
        });
      });
      res.healed = true;
      d.squads.log = [`营地休整（全员 +${Math.round(pct * 100)}% 生命）`].concat(d.squads.log || []).slice(0, 20);
    }

    if (r.layer >= total) {
      r.cleared = true;
      res.cleared = true;
      res.finalRewards = grantClearRewards(r.layer);
    }
    save();
    return res;
  }

  function grantClearRewards(layer) {
    const c = cfg();
    const list = Array.isArray((c.rewards || {}).clearByLayer) ? c.rewards.clearByLayer : [];
    const out = [];
    list.forEach(x => {
      if (layer < (Number(x.layer) || 0)) return;
      if (x._done) return;
      const grant = (window.__goals && typeof window.__goals.grant === 'function') ? window.__goals.grant : null;
      const lines = grant ? grant({ gold: x.gold || 0, gems: x.gems || 0 }, gd()) : [];
      x._done = true;
      out.push({ layer: x.layer, lines });
    });
    return out;
  }

  function abandon() {
    const d = gd();
    if (!d || !d.squads) return { ok: false };
    d.squads.run = null;
    save();
    return { ok: true };
  }

  /** 三队是否全部失去战斗力 */
  function allDown() {
    const ts = teams();
    for (let i = 0; i < ts.length; i++) if (teamUsable(i)) return false;
    return true;
  }

  function summary() {
    const d = gd();
    const c = cfg();
    const r = run_();
    const ts = teams();
    const total = Math.max(1, Number(c.layers) || 12);
    return {
      weekNo: weekNo(),
      layers: total,
      layer: r ? (r.layer || 0) : 0,
      cleared: r ? !!r.cleared : false,
      active: !!r,
      activeTeam: r ? r.activeTeam : null,
      bestLayer: d && d.squads ? (d.squads.bestLayer || 0) : 0,
      allDown: allDown(),
      labels: Array.isArray(c.nodeLabels) ? c.nodeLabels : [],
      restLayers: Array.isArray(c.restLayers) ? c.restLayers : [],
      log: (d && d.squads && Array.isArray(d.squads.log)) ? d.squads.log : [],
      teams: ts.map((t, i) => ({
        index: i,
        members: t.filter(Boolean).length,
        alive: teamAliveRatio(i),
        usable: teamUsable(i),
        ids: t.slice()
      }))
    };
  }

  const api = {
    cfg, weekNo, teams, setMember, findTeamOf, pool, autoDeploy, clearTeams,
    run: run_, startRun, buildStage, choose, captureTeam, advance, abandon,
    buildTeamUnits, buildEnemies, teamUsable, teamAliveRatio, allDown, summary
  };
  if (window.Game && window.Game.domain) window.Game.domain.squads = api;
  window.__squads = api;
})();
