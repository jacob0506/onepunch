/**
 * 羁绊数值单源（C6）
 * ─────────────────────────────────────────────────────────────
 * 数据在 assets/data/bonds.json（改数据即可增删羁绊，无需碰代码）。
 *
 * 三类羁绊：
 *   · 职业羁绊 class    —— 同职业 1/2/4/6 人，取达到的最高档
 *     （count:1 档 = C9「光环」：上阵任意 1 名该职业就给全队保底加成，凑 2 人升级为正式档）
 *   · 阵营羁绊 faction  —— 同阵营 2/3 人，取达到的最高档
 *   · 剧情羁绊 story    —— 指定角色同时在阵，无条件档位
 *
 * 约定：
 *   · 本模块是**纯函数**，不写 gameData；只有 formationInfo() 读它。
 *   · 加成只在**战斗单位构建时**应用一次（battle/scene.js），不进 calculateTotalStats，
 *     因为装备/属性面板看的是"角色个人"数值，羁绊是队伍层面的。
 *   · 属性名必须在 bonds.json 的 attrWhitelist 内 —— 写错会静默失效，
 *     tools/check-bonds.mjs 会拦。
 */
(() => {
  const PERCENT_KEYS = ['atkPercent', 'defPercent', 'hpPercent'];
  const ADD_KEYS = ['speed', 'critRate', 'critDmg', 'dodgeRate', 'blockRate',
    'lifesteal', 'penetration', 'effectHit', 'tenacity', 'dmgReduc'];

  /** bonds.json 由 script 标签注入到全局（顶层 let，只能裸标识符取） */
  function data() {
    try {
      if (typeof bondsData !== 'undefined' && bondsData) return bondsData;
    } catch (e) { /* 未定义，走下面 */ }
    return (typeof window !== 'undefined' && window.bondsData) ? window.bondsData : null;
  }

  /** 角色实例列表（顶层 let，裸标识符 + window 双保险） */
  function roster() {
    try {
      if (typeof gameData !== 'undefined' && gameData && Array.isArray(gameData.characters)) return gameData.characters;
    } catch (e) { /* ignore */ }
    return (typeof window !== 'undefined' && window.gameData && Array.isArray(window.gameData.characters))
      ? window.gameData.characters : [];
  }

  /** 模板数据（未拥有也能查到职业/阵营 —— 职业与阵营是模板静态属性，与是否拥有无关） */
  function templates() {
    try {
      if (typeof charactersData !== 'undefined' && Array.isArray(charactersData)) return charactersData;
    } catch (e) { /* ignore */ }
    return (typeof window !== 'undefined' && Array.isArray(window.charactersData)) ? window.charactersData : [];
  }

  /** 先查玩家实例，再回退模板 —— 这样"阵容预览 / 未拥有角色"也算得出羁绊 */
  function findChar(id) {
    return roster().find(c => c && c.id === id)
      || templates().find(c => c && c.id === id)
      || null;
  }

  function emptyTotal() {
    const t = {};
    PERCENT_KEYS.forEach(k => { t[k] = 0; });
    ADD_KEYS.forEach(k => { t[k] = 0; });
    return t;
  }

  /** 百分比字段在游戏里都是"百分数"（暴击率 +12 读作 +12%），只有速度是绝对点数 */
  function isPercent(key) { return key !== 'speed'; }

  /** 「攻击 +8%」「速度 +5」 —— 统一文案，界面各处不再自己拼 */
  function describeBonus(bonus, whitelist) {
    const wl = whitelist || {};
    return Object.keys(bonus || {}).map(k => {
      const name = wl[k] || k;
      return name + ' +' + bonus[k] + (isPercent(k) ? '%' : '');
    }).join('、');
  }

  function addBonus(target, bonus) {
    Object.keys(bonus || {}).forEach(k => {
      target[k] = (target[k] || 0) + (Number(bonus[k]) || 0);
    });
  }

  function countBy(chars, key) {
    const m = {};
    chars.forEach(c => {
      if (!c) return;
      const v = c[key];
      if (v === undefined || v === null || v === '') return;
      m[v] = (m[v] || 0) + 1;
    });
    return m;
  }

  /** 取达到的最高档（tiers 已按 count 升序） */
  function bestTier(tiers, have) {
    let hit = null;
    (tiers || []).forEach(t => { if (t && have >= (t.count || 0)) hit = t; });
    return hit;
  }

  function nextTier(tiers, have) {
    return (tiers || []).find(t => t && have < (t.count || 0)) || null;
  }

  /**
   * 评估一套阵容的羁绊。
   * @param {string[]} ids 上阵角色的**模板 id**（gameData.formation 的原样内容）
   * @returns {{active:Array, total:Object, progress:Array, counts:Object, power:number}}
   */
  function evaluate(ids) {
    const d = data();
    const out = { active: [], total: emptyTotal(), progress: [], counts: { class: {}, faction: {} }, power: 0 };
    if (!d) return out;

    const wl = d.attrWhitelist || {};
    const list = (Array.isArray(ids) ? ids : []).filter(Boolean);
    // 模板 id → 角色：一个模板可能抽到多张，任取一张即可（羁绊按"模板"算）
    const chars = [];
    const seen = {};
    list.forEach(id => {
      if (seen[id]) return;
      seen[id] = true;
      const c = findChar(id);
      if (c) chars.push(c);
    });

    const classCounts = countBy(chars, 'class');
    const factionCounts = countBy(chars, 'faction');
    out.counts.class = classCounts;
    out.counts.faction = factionCounts;

    // ── 职业羁绊 ──
    Object.keys(d.classBonds || {}).forEach(key => {
      const def = d.classBonds[key];
      if (!def) return;
      const have = classCounts[key] || 0;
      const hit = bestTier(def.tiers, have);
      if (hit) {
        out.active.push({
          key: 'class:' + key, type: 'class', name: def.name, badge: def.badge || '?',
          have, need: hit.count, bonus: hit.bonus,
          text: describeBonus(hit.bonus, wl)
        });
        addBonus(out.total, hit.bonus);
      } else {
        const nt = nextTier(def.tiers, have);
        if (have > 0 && nt) {
          out.progress.push({
            key: 'class:' + key, type: 'class', name: def.name, badge: def.badge || '?',
            have, need: nt.count, remaining: nt.count - have
          });
        }
      }
    });

    // ── 阵营羁绊 ──
    const fTiers = d.factionTierCounts || [2, 3];
    Object.keys(d.factionBonds || {}).forEach(key => {
      const def = d.factionBonds[key];
      if (!def || !def.attr) return;
      const have = factionCounts[key] || 0;
      const tiers = (def.values || []).map((v, i) => ({
        count: fTiers[i] || (i + 1) * 2,
        bonus: (() => { const b = {}; b[def.attr] = v; return b; })()
      }));
      const hit = bestTier(tiers, have);
      if (hit) {
        out.active.push({
          key: 'faction:' + key, type: 'faction', name: def.name, badge: def.badge || '?',
          have, need: hit.count, bonus: hit.bonus,
          text: describeBonus(hit.bonus, wl)
        });
        addBonus(out.total, hit.bonus);
      } else {
        const nt = nextTier(tiers, have);
        if (have > 0 && nt) {
          out.progress.push({
            key: 'faction:' + key, type: 'faction', name: def.name, badge: def.badge || '?',
            have, need: nt.count, remaining: nt.count - have
          });
        }
      }
    });

    // ── 剧情羁绊 ──
    (d.storyBonds || []).forEach(def => {
      if (!def || !Array.isArray(def.members) || !def.members.length) return;
      const missing = def.members.filter(m => !seen[m]);
      if (missing.length === 0) {
        out.active.push({
          key: 'story:' + def.id, type: 'story', name: def.name, badge: def.badge || '★',
          have: def.members.length, need: def.members.length, bonus: def.bonus,
          text: describeBonus(def.bonus, wl), desc: def.desc || ''
        });
        addBonus(out.total, def.bonus);
      } else if (missing.length < def.members.length) {
        out.progress.push({
          key: 'story:' + def.id, type: 'story', name: def.name, badge: def.badge || '★',
          have: def.members.length - missing.length, need: def.members.length,
          remaining: missing.length, members: def.members
        });
      }
    });

    // 排序：剧情 > 职业 > 阵营；同类按人数降序
    const order = { story: 0, class: 1, faction: 2 };
    out.active.sort((a, b) => (order[a.type] - order[b.type]) || (b.need - a.need));
    out.progress.sort((a, b) => (order[a.type] - order[b.type]) || (a.remaining - b.remaining));

    return out;
  }

  /**
   * 把羁绊汇总应用到一份属性对象上（纯函数，返回新对象）。
   * 百分比字段乘算、其余加算 —— 与装备/被动在 calculateTotalStats 里的口径一致。
   */
  function applyToStats(stats, total) {
    if (!stats) return stats;
    const out = Object.assign({}, stats);
    if (!total) return out;
    out.attack = Math.floor((out.attack || 0) * (1 + (total.atkPercent || 0) / 100));
    out.defense = Math.floor((out.defense || 0) * (1 + (total.defPercent || 0) / 100));
    out.health = Math.floor((out.health || 1) * (1 + (total.hpPercent || 0) / 100));
    out.speed = Math.floor((out.speed || 0) + (total.speed || 0));
    ADD_KEYS.forEach(k => {
      if (k === 'speed') return;
      out[k] = (out[k] || 0) + (total[k] || 0);
    });
    return out;
  }

  /** 当前上阵阵容（读 gameData.formation） */
  function formationIds() {
    try {
      if (typeof gameData !== 'undefined' && gameData && Array.isArray(gameData.formation)) {
        return gameData.formation.filter(Boolean);
      }
    } catch (e) { /* ignore */ }
    return [];
  }

  /**
   * 当前阵容的完整情报：羁绊 + 阵容战力（含羁绊，用 character.js 的战力公式单源）。
   */
  function formationInfo() {
    const info = evaluate(formationIds());
    const powerFn = (window.__character && typeof window.__character.powerFromStats === 'function')
      ? window.__character.powerFromStats : null;
    if (powerFn) {
      const uniq = [];
      const seen = {};
      formationIds().forEach(id => {
        if (seen[id]) return;
        seen[id] = true;
        const c = findChar(id);
        if (c) uniq.push(c);
      });
      info.power = uniq.reduce((sum, c) => {
        const base = (window.__character.calculateTotalStats) ? window.__character.calculateTotalStats(c) : null;
        const boosted = base ? applyToStats(base, info.total) : null;
        return sum + (boosted ? Number(powerFn(boosted)) || 0 : 0);
      }, 0);
    }
    return info;
  }

  function hasActive() { return formationInfo().active.length > 0; }

  const api = {
    evaluate,
    formationInfo,
    formationIds,
    applyToStats,
    describeBonus,
    hasActive,
    emptyTotal,
    findChar
  };

  if (window.Game && window.Game.domain) window.Game.domain.bonds = api;
  window.__bonds = api;
})();
