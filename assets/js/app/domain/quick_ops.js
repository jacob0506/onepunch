/**
 * quick_ops.js —— 一键操作集的数值单源（C4）
 *
 * 承载：autoLevelUp · autoEquipBest · autoEquipAll · autoFormation · claimAll
 *
 * 设计前提：**所有"一键"都只改 gameData，不碰 DOM**。界面层见 ui/quick_ops.js，
 * 它负责确认弹窗、结果展示与刷新。这样以后加"一键强化 / 一键分解"只需在
 * 本文件加一个纯函数，UI 与回归脚本都不用改。
 *
 * ⚠️ 裸标识符依赖（铁律 5）：gameData / GAME_CONFIG 都是内联顶层 `let/const`，
 *    **不会挂到 window**（只有 var / function 声明会）。必须在函数体内用**裸标识符**
 *    读取，且本模块加载早于内联主脚本 ⇒ 访问会命中 TDZ ⇒ 一律包 try/catch。
 *
 * ⚠️ 战力口径：候选装备的优劣用游戏自己的 `calculateCharacterPower` 试穿打分
 *    （而不是另写一套权重），保证"一键穿戴"的结果与养成页显示的战力完全一致。
 *    全量试穿太贵（99 角色 × 5 槽 × 全背包），先用廉价评分 `calculateEquipmentPower`
 *    筛出 Top-K 再试穿 —— 这是**近似**最优，K=8 时与全量试穿结果一致（实测）。
 */
(() => {
  'use strict';

  const EQUIP_SLOTS = ['weapon', 'armor', 'helmet', 'shoes', 'accessory'];
  const SLOT_NAMES = { weapon: '武器', armor: '防具', helmet: '头盔', shoes: '鞋子', accessory: '饰品' };
  const RARITY_RANK = { R: 1, SR: 2, SSR: 3, UR: 4, SUR: 5 };
  const TOP_K = 8;             // 试穿候选上限（性能 / 精度权衡）
  const INS_SLOTS = 2;         // 铭文槽数量

  /* ── 全局访问（全部 TDZ 安全）──────────────────────────── */

  function gd() {
    try { return (typeof gameData !== 'undefined' && gameData) ? gameData : null; } catch (e) { return null; }
  }

  function cfg(key, fallback) {
    try {
      if (typeof GAME_CONFIG !== 'undefined' && GAME_CONFIG && GAME_CONFIG[key] != null) return GAME_CONFIG[key];
    } catch (e) { /* TDZ */ }
    return fallback;
  }

  function power(char) {
    if (!char) return 0;
    try {
      if (typeof window.calculateCharacterPower === 'function') return window.calculateCharacterPower(char) || 0;
      if (window.__character && typeof window.__character.calculateCharacterPower === 'function') {
        return window.__character.calculateCharacterPower(char) || 0;
      }
      return calculateCharacterPower(char) || 0;
    } catch (e) { return 0; }
  }

  function equipPower(item) {
    if (!item) return 0;
    try {
      if (typeof window.calculateEquipmentPower === 'function') return window.calculateEquipmentPower(item) || 0;
      if (window.__inventory && typeof window.__inventory.calculateEquipmentPower === 'function') {
        return window.__inventory.calculateEquipmentPower(item) || 0;
      }
    } catch (e) { /* ignore */ }
    return 0;
  }

  function idOf(it) { return it && it.instanceId != null ? it.instanceId : null; }

  function brief(it) {
    if (!it) return null;
    return { name: it.name || '?', rarity: it.rarity || 'R', level: it.level || 1 };
  }

  /* ── 槽位规范化 ────────────────────────────────────────── */

  function ensureEquipSlots(char) {
    if (!char.equipments || typeof char.equipments !== 'object') char.equipments = {};
    EQUIP_SLOTS.forEach(s => { if (!(s in char.equipments)) char.equipments[s] = null; });
    return char.equipments;
  }

  function ensureInsSlots(char) {
    if (!Array.isArray(char.inscriptions)) char.inscriptions = [];
    while (char.inscriptions.length < INS_SLOTS) char.inscriptions.push(null);
    return char.inscriptions;
  }

  /** 被**其他**角色占用的装备/铭文 instanceId 集合（一键穿戴单角色时不能抢） */
  function usedByOthers(d, exceptChar) {
    const set = new Set();
    (d.characters || []).forEach(c => {
      if (!c || c === exceptChar) return;
      const eq = c.equipments;
      if (eq && typeof eq === 'object') {
        Object.keys(eq).forEach(k => { const id = idOf(eq[k]); if (id != null) set.add(id); });
      }
      (c.inscriptions || []).forEach(it => { const id = idOf(it); if (id != null) set.add(id); });
    });
    return set;
  }

  /* ── 试穿打分 ──────────────────────────────────────────── */

  /**
   * 从 candidates 里挑一个让 char 战力最高的装备，放进 slotKey。
   * mode: 'equip'（char.equipments[k]）| 'ins'（char.inscriptions[k]）
   * 返回 { item, gain, before } —— item 可能为 null（都不如空着，理论上不会发生）。
   */
  function tryBest(char, candidates, mode, slotKey) {
    const holder = mode === 'equip' ? ensureEquipSlots(char) : ensureInsSlots(char);
    const before = power(char);
    const prev = holder[slotKey];
    let bestItem = prev;
    let bestPower = before;

    const scored = candidates
      .map(it => ({ it, s: equipPower(it) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, TOP_K);

    for (const cand of scored) {
      holder[slotKey] = cand.it;
      const p = power(char);
      if (p > bestPower) { bestPower = p; bestItem = cand.it; }
    }
    holder[slotKey] = bestItem;
    return { item: bestItem, before, after: bestPower, changed: bestItem !== prev };
  }

  /* ── 一键穿戴（单角色，只用闲置装备，不动别人）────────── */

  function autoEquipBest(char) {
    const d = gd();
    if (!d || !char) return { ok: false, reason: 'no-data' };
    const before = power(char);
    const used = usedByOthers(d, char);

    ensureEquipSlots(char);
    ensureInsSlots(char);
    const snapEq = {};
    EQUIP_SLOTS.forEach(s => { snapEq[s] = char.equipments[s]; });
    const snapIns = char.inscriptions.slice();

    // ⚠️ 顺序贪心**不是不动点**：套装效果（同套满 N 件才生效）与属性取整会让
    //    "先定鞋后定饰品"和"先定饰品后定鞋"落到不同局部最优。单趟调用因此可能
    //    留下"再点一次还能 +1"的残差（回归脚本幂等断言曾偶发失败）。
    //    这里反复迭代到"本趟零变化"为止 —— 既取到更优结果，又保证严格幂等：
    //    第二次调用必定 ok:false。总战力每接受一次更换就严格上升、且有上界，
    //    必然收敛；MAX_PASS 只是防御性上界。
    const MAX_PASS = 6;
    let passes = 0;
    for (let pass = 0; pass < MAX_PASS; pass++) {
      passes++;
      let changed = false;

      const equipPool = (d.equipment || []).filter(it => it && it.type && idOf(it) != null && !used.has(idOf(it)));
      EQUIP_SLOTS.forEach(slot => {
        const cands = equipPool.filter(it => it.type === slot);
        const keep = char.equipments[slot];
        const pool = cands.filter(it => it !== keep);
        if (pool.length === 0) return;
        const r = tryBest(char, pool, 'equip', slot);
        if (r.changed) changed = true;
      });

      const insPool = (d.inscriptions || []).filter(it => it && idOf(it) != null && !used.has(idOf(it)));
      const insTaken = new Set(char.inscriptions.map(idOf).filter(x => x != null));
      for (let i = 0; i < INS_SLOTS; i++) {
        const keep = char.inscriptions[i];
        const pool = insPool.filter(it => it !== keep && !insTaken.has(idOf(it)));
        if (pool.length === 0) continue;
        const r = tryBest(char, pool, 'ins', i);
        if (r.changed && r.item) {
          insTaken.delete(idOf(keep));
          insTaken.add(idOf(r.item));
          changed = true;
        }
      }

      if (!changed) break;
    }

    // 净变化：对比迭代前快照与最终状态（每槽只报一条，避免多趟迭代重复计数）
    const after = power(char);
    const gainOf = (holder, key, from) => {
      const cur = holder[key];
      holder[key] = from;
      const p = power(char);
      holder[key] = cur;
      return after - p;
    };
    const changes = [];
    EQUIP_SLOTS.forEach(slot => {
      const from = snapEq[slot] || null;
      const to = char.equipments[slot] || null;
      if (idOf(from) !== idOf(to)) {
        changes.push({
          kind: 'equip', slot, slotName: SLOT_NAMES[slot] || slot,
          from: brief(from), to: brief(to), gain: gainOf(char.equipments, slot, from)
        });
      }
    });
    for (let i = 0; i < INS_SLOTS; i++) {
      const from = snapIns[i] || null;
      const to = char.inscriptions[i] || null;
      if (idOf(from) !== idOf(to)) {
        changes.push({
          kind: 'ins', slot: 'ins-' + i, slotName: `铭文${i + 1}`,
          from: brief(from), to: brief(to), gain: gainOf(char.inscriptions, i, from)
        });
      }
    }

    return { ok: changes.length > 0, changes, passes, powerBefore: before, powerAfter: after, gain: after - before };
  }

  /* ── 一键全员配装（全体重排：先回收，再按战力从高到低分配）── */

  function autoEquipAll() {
    const d = gd();
    if (!d) return { ok: false, reason: 'no-data' };
    const chars = (d.characters || []).filter(Boolean);
    if (chars.length === 0) return { ok: false, reason: 'no-character' };

    const before = chars.reduce((s, c) => s + power(c), 0);

    // ① 全部回收（只是把引用清掉，装备实例仍在 gameData.equipment / inscriptions 里）
    chars.forEach(c => {
      ensureEquipSlots(c);
      EQUIP_SLOTS.forEach(s => { c.equipments[s] = null; });
      ensureInsSlots(c);
      for (let i = 0; i < INS_SLOTS; i++) c.inscriptions[i] = null;
    });

    // ② 按"裸装战力"从高到低分配 —— 强者优先挑
    const order = chars.slice().sort((a, b) => {
      const pa = power(a), pb = power(b);
      if (pa !== pb) return pb - pa;
      const ra = RARITY_RANK[a.rarity] || 0, rb = RARITY_RANK[b.rarity] || 0;
      if (ra !== rb) return rb - ra;
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN');
    });

    const equips = (d.equipment || []).filter(it => it && it.type && idOf(it) != null);
    const inss = (d.inscriptions || []).filter(it => it && idOf(it) != null);
    const taken = new Set();
    const perChar = [];

    order.forEach(c => {
      const p0 = power(c);
      let count = 0;
      EQUIP_SLOTS.forEach(slot => {
        const pool = equips.filter(it => it.type === slot && !taken.has(idOf(it)));
        if (pool.length === 0) return;
        const r = tryBest(c, pool, 'equip', slot);
        if (r.item) { taken.add(idOf(r.item)); count++; }
      });
      for (let i = 0; i < INS_SLOTS; i++) {
        const pool = inss.filter(it => !taken.has(idOf(it)));
        if (pool.length === 0) break;
        const r = tryBest(c, pool, 'ins', i);
        if (r.item) { taken.add(idOf(r.item)); count++; }
      }
      perChar.push({ id: c.id, name: c.name || '?', before: p0, after: power(c), count });
    });

    const after = chars.reduce((s, c) => s + power(c), 0);
    return {
      ok: true,
      equipped: taken.size,
      characters: perChar.filter(x => x.count > 0),
      powerBefore: before,
      powerAfter: after,
      gain: after - before
    };
  }

  /* ── 一键上阵（战力 Top N）────────────────────────────── */

  function formationSize() {
    const d = gd();
    if (d && Array.isArray(d.formation) && d.formation.length) return d.formation.length;
    return 6;
  }

  function autoFormation() {
    const d = gd();
    if (!d) return { ok: false, reason: 'no-data' };
    const size = formationSize();
    const chars = (d.characters || []).filter(Boolean);
    if (chars.length === 0) return { ok: false, reason: 'no-character' };

    if (typeof window.ensureFormation === 'function') { try { window.ensureFormation(); } catch (e) { /* ignore */ } }

    const before = (d.formation || []).slice();
    const beforePower = before.reduce((s, id) => {
      const c = id ? chars.find(x => x.id === id) : null;
      return s + (c ? power(c) : 0);
    }, 0);

    const ranked = chars.slice().sort((a, b) => {
      const pa = power(a), pb = power(b);
      if (pa !== pb) return pb - pa;
      const ra = RARITY_RANK[a.rarity] || 0, rb = RARITY_RANK[b.rarity] || 0;
      if (ra !== rb) return rb - ra;
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN');
    });

    const picked = ranked.slice(0, Math.min(size, ranked.length));
    const after = new Array(size).fill(null);
    picked.forEach((c, i) => { after[i] = c.id; });

    const beforeSet = new Set(before.filter(Boolean));
    const added = picked.filter(c => !beforeSet.has(c.id)).map(c => ({ id: c.id, name: c.name || '?', power: power(c) }));
    const afterSet = new Set(after.filter(Boolean));
    const removed = before.filter(Boolean).filter(id => !afterSet.has(id))
      .map(id => { const c = chars.find(x => x.id === id); return { id, name: c ? (c.name || '?') : id, power: c ? power(c) : 0 }; });

    const changed = added.length > 0 || removed.length > 0;
    if (changed) d.formation = after;

    const afterPower = after.reduce((s, id) => {
      const c = id ? chars.find(x => x.id === id) : null;
      return s + (c ? power(c) : 0);
    }, 0);

    return {
      ok: changed, added, removed,
      members: picked.map(c => ({ id: c.id, name: c.name || '?', power: power(c) })),
      powerBefore: beforePower, powerAfter: afterPower, gain: afterPower - beforePower
    };
  }

  /* ── E2 一键布阵：只重排槽位，不改上阵成员（2026-09-15） ───────────────
   * 与 autoFormation（战力 Top6 换人）的区别：本函数**不换人**，只把当前已在
   * 阵中的角色按职业摆到正确的排 —— 坦克/战士前排，其余（法/射/辅/刺）后排。
   * 一侧人数溢出时溢出者补到另一侧，保证 6 槽语义（前 3 前排 / 后 3 后排）成立。
   * ⚠️ 幂等：结果已是推荐阵型时 changed=false，UI 提示"当前已是推荐阵型"。
   */
  const FRONT_CLASSES = ['tank', 'warrior'];

  function autoDeploy() {
    const d = gd();
    if (!d) return { ok: false, reason: 'no-data' };
    const size = formationSize();
    const half = Math.ceil(size / 2);
    const chars = (d.characters || []).filter(Boolean);
    if (typeof window.ensureFormation === 'function') { try { window.ensureFormation(); } catch (e) { /* ignore */ } }

    const before = (d.formation || []).slice();
    const members = before.filter(Boolean).map(id => chars.find(c => c.id === id)).filter(Boolean);
    if (members.length === 0) return { ok: false, reason: 'no-member' };

    const byPower = (a, b) => {
      const pa = power(a), pb = power(b);
      if (pa !== pb) return pb - pa;
      return String(a.id || '').localeCompare(String(b.id || ''));
    };
    const isFront = c => FRONT_CLASSES.indexOf(c.class) >= 0;
    const front = members.filter(isFront).sort(byPower);
    const back = members.filter(c => !isFront(c)).sort(byPower);

    // 一侧溢出 → 溢出者补到另一侧（前排溢出把最弱的挪去后排，反之亦然）
    while (front.length > half) back.unshift(front.pop());
    while (front.length < half && back.length > 0) front.push(back.shift());

    const after = new Array(size).fill(null);
    front.forEach((c, i) => { if (i < half) after[i] = c.id; });
    back.forEach((c, i) => { if (half + i < size) after[half + i] = c.id; });

    const changed = after.some((v, i) => v !== before[i]);
    if (changed) d.formation = after;

    return {
      ok: true,
      changed,
      before,
      after,
      front: front.map(c => ({ id: c.id, name: c.name || '?', class: c.class })),
      back: back.map(c => ({ id: c.id, name: c.name || '?', class: c.class }))
    };
  }

  /* ── 一键升级（升到当前星级上限或金币耗尽，静默版）────── */

  function maxLevelOf(char) {
    const MAX = cfg('maxLevel', 150);
    if ((char.stars || 0) >= 8) return MAX;
    return 15 + (char.stars || 0) * 15;
  }

  function autoLevelUp(char) {
    const d = gd();
    if (!d || !char) return { ok: false, reason: 'no-data' };
    const MAX = cfg('maxLevel', 150);
    const cap = maxLevelOf(char);
    if ((char.level || 1) >= MAX) return { ok: false, reason: 'max-level', from: char.level, to: char.level };
    if ((char.level || 1) >= cap) return { ok: false, reason: 'need-star', from: char.level, to: char.level, cap };

    let spent = 0;
    let n = 0;
    while ((char.level || 1) < cap) {
      const cost = (typeof window.calculateLevelUpCost === 'function')
        ? window.calculateLevelUpCost(char.level)
        : Math.floor(100 * Math.pow(char.level, 1.5) * (1 + char.level / 100));
      if ((d.player.gold || 0) < cost) break;
      d.player.gold -= cost;
      char.goldSpentOnLevelUps = (char.goldSpentOnLevelUps || 0) + cost;
      char.level = (char.level || 1) + 1;
      char.exp = 0;
      spent += cost;
      n++;
    }
    return {
      ok: n > 0, levels: n, goldSpent: spent,
      from: (char.level || 1) - n, to: char.level,
      reason: n > 0 ? 'ok' : 'no-gold', cap
    };
  }

  /* ── 一键领取全部（领取源可插拔，C5 目标系统复用）─────── */

  function claimAll() {
    const results = [];
    const idle = window.__idle || (window.Game && window.Game.domain && window.Game.domain.idle) || null;
    if (idle && typeof idle.claimIdle === 'function') {
      try {
        const r = idle.claimIdle();
        if (r && r.ok) results.push({ key: 'idle', label: '挂机收益', minutes: r.minutes, rewards: r.rewards });
      } catch (e) { /* ignore */ }
    }
    // C5：今日目标奖励也是"可领取"的一类，一并收进来
    const goals = window.__goals || (window.Game && window.Game.domain && window.Game.domain.goals) || null;
    if (goals && typeof goals.claimAll === 'function') {
      try {
        const r = goals.claimAll();
        if (r && r.ok) {
          results.push({
            key: 'goals', label: `今日目标 x${r.count}`,
            rewards: { gold: 0, exp: 0, materials: {} },
            text: (r.given || []).join(' · ')
          });
        }
      } catch (e) { /* ignore */ }
    }
    return { ok: results.length > 0, results };
  }

  const api = {
    EQUIP_SLOTS, SLOT_NAMES, INS_SLOTS, TOP_K,
    autoLevelUp, autoEquipBest, autoEquipAll, autoFormation, autoDeploy, claimAll,
    maxLevelOf, formationSize
  };
  const segs = 'Game.domain.quickOps'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__quickOps = api;
})();
