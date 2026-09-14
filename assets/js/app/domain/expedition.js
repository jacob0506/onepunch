/**
 * expedition.js —— E1 肉鸽远征（Roguelite Expedition）唯一数值源
 *
 * 设计要点（2026-09-15）：
 *  · 独立于主线的一局制玩法：6 层 × 每层 N 个节点（战斗/精英/事件/商店/休息/首领），
 *    每清一个战斗节点 3 选 1 祝福，**队伍生命跨节点累计**，团灭即结算。
 *  · **镜像队伍**：远征内全员统一到同一档位（等级/星级/无装备），主线练度不碾压
 *    ⇒ 111 个角色全部有出场理由，冷门角色靠技能机制也能当核心。
 *  · **不可 SL**：地图与祝福池全部由种子 PRNG（mulberry32）决定，种子在开局时落盘；
 *    战斗一结束立即回写队伍 HP（battle/scene.js 的 Finish 里调 captureTeam）。
 *  · 局外 meta：远征币（coins）永久保留，可买永久解锁（开局送祝福 / 起始币 /
 *    每层回血 / 每层多一个节点）。
 *
 * ⚠️ 本模块加载早于内联主脚本：顶层只做常量与函数定义，读写 gameData 一律在函数体内。
 * ⚠️ 铁律 17：内部一律用自带 mulberry32 种子随机，**禁止 Math.random**（会挪动战斗
 *     RNG 流 → 数值快照无故 DIFF）。
 *
 * 数据：assets/data/expedition.json（祝福库 / 配置 / meta 解锁），加载失败用内置同值兜底。
 * 对外：Game.domain.expedition + window.__expedition。
 */
(() => {
  'use strict';

  /* ── 内置兜底（expedition.json 加载失败时行为完全一致）───────────────── */
  const FALLBACK = {
    config: {
      layers: 6,
      nodesPerLayer: 3,
      teamSize: 6,
      mirrorStars: 3,
      mirrorLevelFloor: 20,
      enemyScaleByLayer: [0.85, 1.0, 1.15, 1.3, 1.5, 1.75],
      eliteScale: 1.3,
      bossScale: 1.75,
      restHealPct: 25,
      coinsPerNode: { battle: 8, elite: 18, event: 6, shop: 0, rest: 4, boss: 45 },
      shopCost: 30,
      resetAfterDays: 7
    },
    blessings: [
      { id: 'atk15', name: '锋刃', desc: '全队攻击 +15%', type: 'stat', mods: { atkMul: 1.15 } },
      { id: 'hp20', name: '磐石', desc: '全队生命 +20%', type: 'stat', mods: { hpMul: 1.2 } },
      { id: 'cost1', name: '节能装置', desc: '技能能量消耗 -1（最低 0）', type: 'cost', value: 1 },
      { id: 'reflect12', name: '荆棘之甲', desc: '前排受击时反弹 12% 伤害', type: 'reflect', value: 12, pos: 'front' },
      { id: 'pursue', name: '追猎', desc: '击杀敌人后追加一次普攻', type: 'onKillBasic', value: 1 },
      { id: 'shield8', name: '预兆护盾', desc: '战斗开始时全队获得 8% 最大生命的护盾', type: 'startShieldPct', value: 8 }
    ],
    metaUnlocks: [
      { id: 'startBlessing', name: '先遣补给', desc: '开局直接获得 1 个随机祝福', costs: [60, 180], max: 2 }
    ]
  };

  const NODE_META = {
    battle: { name: '遭遇战', icon: 'fa-crosshairs', desc: '常规敌人，稳扎稳打' },
    elite: { name: '精英战', icon: 'fa-fire', desc: '强度更高，远征币翻倍' },
    event: { name: '未知事件', icon: 'fa-question', desc: '随机收获（也可能空手）' },
    shop: { name: '流浪商人', icon: 'fa-shopping-bag', desc: '用远征币换取祝福' },
    rest: { name: '营地', icon: 'fa-home', desc: '全队回复生命' },
    boss: { name: '首领', icon: 'fa-skull', desc: '本层终局，重奖' }
  };

  /* ── 种子随机（自带，绝不碰 Math.random）───────────────────────────── */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    const str = String(s || '');
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  /* ── 数据读取（json 优先，缺失用兜底）────────────────────────────────── */
  function data() {
    return (typeof expeditionData !== 'undefined' && expeditionData && typeof expeditionData === 'object')
      ? expeditionData : null;
  }
  function cfg() {
    const d = data();
    const c = (d && d.config) || {};
    return { ...FALLBACK.config, ...c, coinsPerNode: { ...FALLBACK.config.coinsPerNode, ...(c.coinsPerNode || {}) } };
  }
  function blessings() {
    const d = data();
    const list = (d && Array.isArray(d.blessings) && d.blessings.length) ? d.blessings : FALLBACK.blessings;
    return list.filter(Boolean);
  }
  function metaUnlocks() {
    const d = data();
    const list = (d && Array.isArray(d.metaUnlocks) && d.metaUnlocks.length) ? d.metaUnlocks : FALLBACK.metaUnlocks;
    return list.filter(Boolean);
  }
  function blessingById(id) {
    return blessings().find(b => b.id === id) || null;
  }

  /* ── 存档 ─────────────────────────────────────────────────────────── */
  function ed() {
    if (typeof gameData === 'undefined' || !gameData) return null;
    if (!gameData.expedition || typeof gameData.expedition !== 'object') gameData.expedition = {};
    return gameData.expedition;
  }

  function weekKeyOf(ts) {
    const d = new Date(ts || Date.now());
    // ISO 周：本周一 00:00 作为 key
    const day = (d.getDay() + 6) % 7;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function ensure() {
    const e = ed();
    if (!e) return null;
    if (typeof e.v !== 'number') e.v = 1;
    if (typeof e.coins !== 'number') e.coins = 0;
    if (!e.unlocks || typeof e.unlocks !== 'object') e.unlocks = {};
    if (typeof e.runs !== 'number') e.runs = 0;
    if (typeof e.bestLayer !== 'number') e.bestLayer = 0;
    if (!Array.isArray(e.history)) e.history = [];
    const wk = weekKeyOf();
    if (e.weekKey !== wk) { e.weekKey = wk; e.weekRuns = 0; }
    if (typeof e.weekRuns !== 'number') e.weekRuns = 0;
    if (e.run && typeof e.run === 'object') {
      const r = e.run;
      if (!Array.isArray(r.picked)) r.picked = [];
      if (!Array.isArray(r.blessings)) r.blessings = [];
      if (!Array.isArray(r.team)) r.team = [];
      if (!r.hp || typeof r.hp !== 'object') r.hp = {};
      if (typeof r.coins !== 'number') r.coins = 0;
      if (!Array.isArray(r.map)) r.map = [];
      if (typeof r.layer !== 'number') r.layer = 0;
      if (!r.log || Array.isArray(r.log) === false) r.log = [];
    }
    return e;
  }

  function save() {
    if (typeof saveGameProgress === 'function') saveGameProgress();
  }

  function unlockLevel(id) {
    const e = ensure();
    if (!e) return 0;
    return Math.max(0, Number(e.unlocks[id]) || 0);
  }

  /* ── 镜像档位与队伍构建 ─────────────────────────────────────────────── */
  /** 镜像等级 = 上阵队伍平均等级（下限 20），星级统一（默认 3）—— 全员平等 */
  function mirrorTier() {
    const c = cfg();
    let lv = c.mirrorLevelFloor;
    try {
      const ids = (typeof gameData !== 'undefined' && Array.isArray(gameData.formation)) ? gameData.formation.filter(Boolean) : [];
      const chars = ids.map(id => (gameData.characters || []).find(x => x.id === id)).filter(Boolean);
      if (chars.length) {
        const avg = chars.reduce((s, x) => s + (Number(x.level) || 1), 0) / chars.length;
        lv = Math.max(c.mirrorLevelFloor, Math.round(avg));
      }
    } catch (e) { /* ignore */ }
    return { level: lv, stars: c.mirrorStars };
  }

  /** 把一个角色模板/实例镜像成远征单位（统一档位、清空装备铭文、技能取模板） */
  function buildMirrorUnit(charId, tier, position) {
    const tpl = (typeof charactersData !== 'undefined' && Array.isArray(charactersData))
      ? charactersData.find(c => c && c.id === charId) : null;
    if (!tpl) return null;
    const inst = {
      ...JSON.parse(JSON.stringify(tpl)),
      id: tpl.id,
      level: tier.level,
      stars: tier.stars,
      exp: 0,
      equipments: { weapon: null, armor: null, helmet: null, shoes: null, accessory: null },
      inscriptions: [null, null]
    };
    let stats = null;
    try {
      stats = (typeof calculateTotalStats === 'function') ? calculateTotalStats(inst) : null;
    } catch (e) { stats = null; }
    if (!stats) {
      stats = { attack: 200, defense: 100, health: 2000, speed: 100, critRate: 5, critDmg: 150, dodgeRate: 0, blockRate: 0, lifesteal: 0, penetration: 0, effectHit: 0, tenacity: 0, dmgReduc: 0 };
    }
    const skills = Array.isArray(inst.skills) ? JSON.parse(JSON.stringify(inst.skills)) : [];
    const passiveText = (typeof battleSceneDebugGetLoadoutPassiveText === 'function')
      ? battleSceneDebugGetLoadoutPassiveText(inst) : '';
    return {
      id: tpl.id,
      name: tpl.name,
      displayName: tpl.name,
      imageUrl: tpl.imageUrl || '',
      rarity: tpl.rarity,
      class: tpl.class || 'warrior',
      position: position || 'back',
      isCore: false,
      maxHp: Math.max(1, Math.floor(stats.health || 1)),
      currentHp: Math.max(1, Math.floor(stats.health || 1)),
      attack: Math.floor(stats.attack || 0),
      defense: Math.floor(stats.defense || 0),
      speed: Math.floor(stats.speed || 0),
      critRate: Math.floor(stats.critRate || 0),
      critDmg: Math.floor(stats.critDmg || 150),
      dodgeRate: Math.floor(stats.dodgeRate || 0),
      blockRate: Math.floor(stats.blockRate || 0),
      lifesteal: Math.floor(stats.lifesteal || 0),
      penetration: Math.floor(stats.penetration || 0),
      effectHit: Math.floor(stats.effectHit || 0),
      tenacity: Math.floor(stats.tenacity || 0),
      dmgReduc: Math.floor(stats.dmgReduc || 0),
      isEnemy: false,
      statuses: [],
      shield: 0,
      skills,
      passiveText,
      passiveRuntime: (typeof battleSceneDebugParsePassiveText === 'function')
        ? battleSceneDebugParsePassiveText(passiveText) : {}
    };
  }

  /** 玩家可选的远征候选（已拥有角色，按稀有度/战力排序） */
  function roster() {
    const list = (typeof gameData !== 'undefined' && Array.isArray(gameData.characters)) ? gameData.characters : [];
    return list.filter(Boolean).map(c => ({ id: c.id, name: c.name || '?', level: Number(c.level) || 1, rarity: c.rarity, class: c.class, imageUrl: c.imageUrl || '' }));
  }

  /* ── 地图生成（种子决定，刷新不可变）────────────────────────────────── */
  function genMap(seed, extraNode) {
    const c = cfg();
    const rnd = mulberry32(seed >>> 0);
    const d = data();
    const weights = (d && Array.isArray(d.nodeWeights)) ? d.nodeWeights : [];
    const count = c.nodesPerLayer + Math.max(0, Number(extraNode) || 0);
    const map = [];
    for (let layer = 0; layer < c.layers; layer++) {
      const wdef = weights.find(x => x && x.layer === layer);
      const w = (wdef && wdef.weights) || { battle: 3 };
      const bag = [];
      Object.entries(w).forEach(([type, n]) => { for (let i = 0; i < (Number(n) || 0); i++) bag.push(type); });
      // 首领层只有一条路（终局），其余层 = nodesPerLayer（+ 侦察术）
      const nodeCount = (layer === c.layers - 1) ? 1 : count;
      const nodes = [];
      for (let i = 0; i < nodeCount; i++) {
        // 同层尽量不出现重复类型 —— 三条路长得一样就没有"选择"了。
        // 注意 bag 里同一类型有多个副本（权重），去重必须先按**类型**收一遍。
        const usedTypes = nodes.map(n => n.type);
        const uniqTypes = [...new Set(bag)].filter(t => usedTypes.indexOf(t) < 0);
        const pickFrom = uniqTypes.length ? uniqTypes : bag;
        const type = pickFrom.length ? pickFrom[Math.floor(rnd() * pickFrom.length)] : 'battle';
        const meta = NODE_META[type] || NODE_META.battle;
        nodes.push({ id: `n_${layer}_${i}`, type, layer, index: i, name: meta.name, desc: meta.desc, icon: meta.icon, cleared: false });
      }
      map.push(nodes);
    }
    return map;
  }

  /* ── 开局 / 推进 / 结算 ─────────────────────────────────────────────── */

  function startRun(ids, opts) {
    const e = ensure();
    if (!e) return { ok: false, reason: 'no-data' };
    const c = cfg();
    const team = (Array.isArray(ids) ? ids : []).filter(Boolean).slice(0, c.teamSize);
    if (team.length === 0) return { ok: false, reason: 'no-team' };

    const practice = !!(opts && opts.practice);
    const seed = hashStr(`${e.weekKey}|${Date.now()}|${team.join(',')}|${e.runs}`);
    const tier = mirrorTier();
    const extraNode = unlockLevel('extraNode');
    const map = genMap(seed, extraNode);

    const units = team.map((id, i) => buildMirrorUnit(id, tier, i < 3 ? 'front' : 'back')).filter(Boolean);
    if (!units.length) return { ok: false, reason: 'build-failed' };

    const hp = {};
    units.forEach(u => { hp[u.id] = 1; });

    const run = {
      seed,
      practice,
      startedAt: Date.now(),
      tier,
      team: units.map(u => u.id),
      units,
      hp,
      map,
      layer: 0,
      picked: [],
      blessings: [],
      coins: unlockLevel('startCoins') * 20,
      cleared: 0,
      log: [],
      over: false,
      result: null,
      pendingBlessing: null
    };

    // meta：先遣补给 → 开局送 N 个随机祝福
    const sb = unlockLevel('startBlessing');
    for (let i = 0; i < sb; i++) {
      const pick = rollBlessings(`${seed}_sb${i}`, 1, run.blessings);
      if (pick[0]) run.blessings.push(pick[0].id);
    }
    if (sb > 0) run.log.push(`先遣补给：开局获得 ${sb} 个祝福`);

    e.run = run;
    save();
    refreshDots();
    return { ok: true, run: publicRun(run) };
  }

  function run_() {
    const e = ensure();
    return (e && e.run && !e.run.over) ? e.run : null;
  }

  /** 从祝福池里摇 n 个（去重已拥有的，pure：不写档） */
  function rollBlessings(seedKey, n, ownedIds) {
    const pool = blessings().slice();
    const owned = new Set(Array.isArray(ownedIds) ? ownedIds : []);
    const rnd = mulberry32(hashStr(String(seedKey)));
    const avail = pool.filter(b => !owned.has(b.id));
    const list = avail.length >= (n || 3) ? avail : pool;
    const copy = list.slice();
    const out = [];
    for (let i = 0; i < (n || 3); i++) {
      if (!copy.length) break;
      const idx = Math.floor(rnd() * copy.length);
      out.push(copy[idx]);
      copy.splice(idx, 1);
    }
    return out;
  }

  /** 当前层的候选节点 */
  function currentNodes() {
    const r = run_();
    if (!r) return [];
    const row = r.map[r.layer];
    return Array.isArray(row) ? row : [];
  }

  /** 构造远征 stage（战斗型节点）并登记进 stagesData */
  function buildStage(node) {
    const r = run_();
    if (!r) return null;
    const c = cfg();
    const scaleBase = (c.enemyScaleByLayer || [])[Math.min(r.layer, (c.enemyScaleByLayer || []).length - 1)] || 1;
    const isElite = node.type === 'elite';
    const isBoss = node.type === 'boss';
    const scale = scaleBase * (isElite ? c.eliteScale : 1) * (isBoss ? c.bossScale : 1);

    const enemies = buildEnemies(r, scale, isElite, isBoss);
    const tier = r.tier || mirrorTier();
    const team = r.units.map((u, i) => {
      const cp = JSON.parse(JSON.stringify(u));
      const ratio = Math.max(0, Math.min(1, Number(r.hp[u.id]) === undefined ? 1 : Number(r.hp[u.id])));
      cp.currentHp = Math.max(1, Math.floor((cp.maxHp || 1) * ratio));
      cp.position = i < 3 ? 'front' : 'back';
      cp.isDead = ratio <= 0;
      return cp;
    }).filter(u => !u.isDead);

    const stageName = isBoss ? `远征 · 首领（第 ${r.layer + 1} 层）`
      : isElite ? `远征 · 精英（第 ${r.layer + 1} 层）`
        : `远征 · 第 ${r.layer + 1} 层`;
    const stage = {
      id: `exp_${r.seed.toString(36)}_${r.layer}_${node.index}`,
      name: stageName,
      isExpedition: true,
      expeditionNode: { layer: r.layer, index: node.index, type: node.type },
      enemies,
      expeditionTeam: team,
      expeditionBlessings: r.blessings.map(id => blessingById(id)).filter(Boolean),
      rewards: { exp: 0, gold: isBoss ? 250 : isElite ? 100 : 40, items: [] },
      modifiers: { affixes: [] }
    };
    // 与 C7 日常副本同构：stage 住进 stagesData，战斗入口按 id 查找
    if (Array.isArray(stagesData)) {
      const at = stagesData.findIndex(s => s && s.id === stage.id);
      if (at >= 0) stagesData[at] = stage; else stagesData.push(stage);
    }
    return stage;
  }

  /** 敌人：从角色模板里按种子抽（复用现有立绘，无需新美术），属性 = 镜像属性 × 层系数 */
  function buildEnemies(run, scale, isElite, isBoss) {
    const c = cfg();
    const tier = run.tier || mirrorTier();
    const rnd = mulberry32(hashStr(`${run.seed}_e_${run.layer}_${isElite}_${isBoss}`));
    const owned = new Set(run.team);
    const pool = (typeof charactersData !== 'undefined' && Array.isArray(charactersData))
      ? charactersData.filter(x => x && !owned.has(x.id)) : [];
    const n = Math.max(1, Math.min(6, 4 + Math.floor(run.layer / 2)));
    const out = [];
    const used = new Set();
    for (let i = 0; i < 6; i++) {
      if (i >= n) { out.push(null); continue; }
      let tpl = null;
      for (let guard = 0; guard < 20 && !tpl; guard++) {
        const cand = pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
        if (cand && !used.has(cand.id)) { tpl = cand; used.add(cand.id); }
      }
      if (!tpl) { out.push(null); continue; }
      const unit = buildMirrorUnit(tpl.id, tier, i < 3 ? 'front' : 'back');
      if (!unit) { out.push(null); continue; }
      const bossMul = (isBoss && i === 0) ? 1.6 : 1;
      const hp = Math.floor((unit.maxHp || 1000) * scale * bossMul);
      const atk = Math.floor((unit.attack || 100) * scale * bossMul);
      out.push({
        ...unit,
        id: `exp_e_${run.layer}_${i}`,
        displayName: unit.name,
        maxHp: hp,
        health: hp,
        currentHp: hp,
        attack: atk,
        defense: Math.floor((unit.defense || 50) * scale),
        speed: Math.floor((unit.speed || 90) * (isBoss ? 1.05 : 1)),
        isEnemy: true,
        isBoss: !!(isBoss && i === 0),
        isElite: !!(isElite && i === 0),
        enhancedHp: 0,
        enhancedHpMax: 0,
        bossState: (isBoss && i === 0) ? { triggers: {} } : null,
        bossMechanics: null,
        skillCd: 0,
        energy: 0,
        maxEnergy: 4
      });
    }
    return out;
  }

  /** 选择当前层的某个节点：战斗型返回 stage，非战斗型直接结算 */
  function chooseNode(index, opts) {
    const r = run_();
    if (!r) return { ok: false, reason: 'no-run' };
    const nodes = currentNodes();
    const node = nodes[Number(index)];
    if (!node) return { ok: false, reason: 'bad-node' };
    if (r.pendingBlessing) return { ok: false, reason: 'pending-blessing' };
    // 商店第二阶段（购买）：不按 index 取节点，直接走 buyShop
    if (r.pendingShop && opts && opts.buy) return buyShop(opts.buy);

    if (node.type === 'battle' || node.type === 'elite' || node.type === 'boss') {
      const stage = buildStage(node);
      if (!stage) return { ok: false, reason: 'build-failed' };
      r.picked.push({ layer: r.layer, index: node.index, type: node.type });
      save();
      return { ok: true, battle: true, stageId: stage.id };
    }

    // 商店是两阶段：先看货（不推进层），买完或离开才 advanceLayer
    if (node.type === 'shop') {
      const res = openShop(r, node);
      save();
      refreshDots();
      return { ok: true, battle: false, ...res };
    }

    const res = resolvePeacefulNode(r, node, opts);
    advanceLayer(r);
    save();
    refreshDots();
    return { ok: true, battle: false, ...res };
  }

  /** 商店第一阶段：展示存货并挂 pendingShop（此时不推进层） */
  function openShop(r, node) {
    const c = cfg();
    const stock = rollBlessings(`${r.seed}_shop_${r.layer}_${node.index}`, 3, r.blessings);
    r.pendingShop = { index: node.index, layer: r.layer, stock: stock.map(b => b.id), cost: c.shopCost };
    return { type: 'shop', stock, cost: c.shopCost, pending: true };
  }

  /** 商店第二阶段 · 购买 */
  function buyShop(id) {
    const r = run_();
    if (!r || !r.pendingShop) return { ok: false, reason: 'no-shop' };
    const c = cfg();
    const b = blessingById(id);
    if (!b || (r.pendingShop.stock || []).indexOf(id) < 0) return { ok: false, reason: 'bad-item', type: 'shop', text: '该祝福不在货架上' };
    const cost = r.pendingShop.cost || c.shopCost;
    if ((Number(r.coins) || 0) < cost) return { ok: false, reason: 'poor', need: cost, type: 'shop', text: '远征币不足' };
    if (r.blessings.includes(id)) return { ok: false, reason: 'owned', type: 'shop', text: '已拥有该祝福' };
    r.coins = (Number(r.coins) || 0) - cost;
    r.blessings.push(id);
    r.log.push(`流浪商人：${cost} 币购入「${b.name}」`);
    r.pendingShop = null;
    advanceLayer(r);
    save();
    refreshDots();
    return { ok: true, type: 'shop', text: `购入祝福「${b.name}」`, blessing: b, cost };
  }

  /** 商店第二阶段 · 离开 */
  function closeShop() {
    const r = run_();
    if (!r || !r.pendingShop) return { ok: false, reason: 'no-shop' };
    r.pendingShop = null;
    advanceLayer(r);
    save();
    refreshDots();
    return { ok: true, type: 'shop', text: '离开了流浪商人' };
  }

  /** 非战斗节点（营地 / 事件）在选中的瞬间结算 */
  function resolvePeacefulNode(r, node, opts) {
    const c = cfg();
    const e = ensure();
    if (node.type === 'rest') {
      const pct = c.restHealPct;
      Object.keys(r.hp).forEach(id => { r.hp[id] = Math.min(1, (Number(r.hp[id]) || 0) + pct / 100); });
      r.log.push(`营地休整：全队回复 ${pct}% 生命`);
      return { type: 'rest', healPct: pct };
    }
    if (node.type === 'event') {
      const rnd = mulberry32(hashStr(`${r.seed}_ev_${r.layer}_${node.index}`));
      const roll = rnd();
      if (roll < 0.35) {
        const coins = 10 + Math.floor(rnd() * 15);
        r.coins += coins;
        r.log.push(`未知事件：拾获 ${coins} 远征币`);
        return { type: 'event', text: `拾获 ${coins} 远征币`, coins };
      }
      if (roll < 0.7) {
        const pct = 15;
        Object.keys(r.hp).forEach(id => { r.hp[id] = Math.min(1, (Number(r.hp[id]) || 0) + pct / 100); });
        r.log.push(`未知事件：全队回复 ${pct}% 生命`);
        return { type: 'event', text: `全队回复 ${pct}% 生命`, healPct: pct };
      }
      const pick = rollBlessings(`${r.seed}_evb_${r.layer}_${node.index}`, 1, r.blessings)[0];
      if (pick) {
        r.blessings.push(pick.id);
        r.log.push(`未知事件：获得祝福「${pick.name}」`);
        return { type: 'event', text: `获得祝福「${pick.name}」`, blessing: pick };
      }
      r.log.push('未知事件：什么也没发生');
      return { type: 'event', text: '什么也没发生' };
    }
    return { type: node.type };
  }

  /** 战斗结束回写队伍血量（scene.js 的 Finish 里调；非远征战斗自动忽略） */
  function captureTeam(units) {
    const r = run_();
    if (!r || !Array.isArray(units)) return false;
    let alive = 0;
    units.forEach(u => {
      if (!u || u.isEnemy) return;
      const ratio = u.maxHp > 0 ? Math.max(0, u.currentHp / u.maxHp) : 0;
      r.hp[u.id] = ratio;
      if (ratio > 0) alive += 1;
    });
    r.aliveCount = alive;
    save();
    return true;
  }

  /** fallback_hud 结算分支援征推进：胜利给币 + 祝福 3 选 1；失败直接结束本局 */
  function onBattleEnd(stage, result) {
    const r = run_();
    if (!r || !stage || !stage.isExpedition) return null;
    const c = cfg();
    const node = stage.expeditionNode || { type: 'battle', layer: r.layer };
    const isWin = !!(result && result.isWin);

    if (!isWin) {
      finish('defeat');
      return { over: true, result: 'defeat' };
    }

    const coins = (c.coinsPerNode || {})[node.type] || 8;
    r.coins += coins;
    r.cleared += 1;
    r.log.push(`第 ${r.layer + 1} 层 · ${(NODE_META[node.type] || {}).name || '战斗'} 胜利（+${coins} 币）`);

    const alive = (r.units || []).filter(u => (Number(r.hp[u.id]) || 0) > 0).length;
    if (alive === 0) {
      finish('defeat');
      return { over: true, result: 'defeat' };
    }

    const lastLayer = r.layer >= (c.layers - 1);
    r.lastReward = { coins, node: node.type };

    if (lastLayer || node.type === 'boss') {
      finish('clear');
      return { over: true, result: 'clear', coins };
    }

    // 祝福 3 选 1（种子固定 ⇒ 刷新页面不会换选项）
    const picks = rollBlessings(`${r.seed}_b_${r.layer}_${node.index}`, 3, r.blessings);
    r.pendingBlessing = picks.map(b => b.id);
    save();
    refreshDots();
    return { over: false, coins, picks, needPick: true };
  }

  /** 选完祝福后推进到下一层 */
  function pickBlessing(blessingId) {
    const r = run_();
    if (!r) return { ok: false, reason: 'no-run' };
    if (Array.isArray(r.pendingBlessing) && r.pendingBlessing.length && !r.pendingBlessing.includes(blessingId)) {
      return { ok: false, reason: 'not-offered' };
    }
    const b = blessingById(blessingId);
    if (b && !r.blessings.includes(b.id)) r.blessings.push(b.id);
    if (b) r.log.push(`获得祝福「${b.name}」：${b.desc}`);
    r.pendingBlessing = null;
    advanceLayer(r);
    save();
    refreshDots();
    return { ok: true, blessing: b };
  }

  function advanceLayer(r) {
    const c = cfg();
    r.layer = Math.min(c.layers, (Number(r.layer) || 0) + 1);
    // meta：战地医疗（每进入新的一层回血）
    const heal = unlockLevel('layerHeal');
    if (heal > 0) {
      Object.keys(r.hp).forEach(id => { r.hp[id] = Math.min(1, (Number(r.hp[id]) || 0) + 0.1 * heal); });
      r.log.push(`战地医疗：进入第 ${r.layer + 1} 层，全队回复 ${10 * heal}% 生命`);
    }
    if (r.layer >= c.layers) finish('clear');
  }

  /** 结算本局 */
  function finish(reason) {
    const e = ensure();
    const r = e && e.run;
    if (!e || !r || r.over) return { ok: false, reason: 'no-run' };
    const c = cfg();
    r.over = true;
    r.result = reason || 'abandon';
    r.endedAt = Date.now();
    r.pendingBlessing = null;

    const clearedLayers = (Number(r.layer) || 0) + (r.result === 'clear' ? 0 : 0);
    const gained = Number(r.coins) || 0;
    e.coins = (Number(e.coins) || 0) + gained;
    e.runs = (Number(e.runs) || 0) + 1;
    e.weekRuns = (Number(e.weekRuns) || 0) + 1;
    e.bestLayer = Math.max(Number(e.bestLayer) || 0, clearedLayers);
    e.history.push({
      at: r.endedAt,
      result: r.result,
      layers: clearedLayers,
      cleared: Number(r.cleared) || 0,
      coins: gained,
      blessings: (r.blessings || []).slice(),
      practice: !!r.practice,
      seed: r.seed
    });
    if (e.history.length > 30) e.history = e.history.slice(-30);
    e.lastRun = { result: r.result, layers: clearedLayers, coins: gained, cleared: Number(r.cleared) || 0 };
    e.run = null;
    save();
    refreshDots();
    return { ok: true, result: r.result, coins: gained, layers: clearedLayers };
  }

  /** 放弃本局（不结算发放，只归档为 abandon） */
  function abandon() {
    const e = ensure();
    const r = e && e.run;
    if (!r) return { ok: false, reason: 'no-run' };
    r.coins = 0;   // 中途放弃不带走远征币（防"打到一半领保底"）
    return finish('abandon');
  }

  /* ── meta 解锁 ─────────────────────────────────────────────────────── */
  function metaList() {
    const e = ensure();
    return metaUnlocks().map(u => {
      const lv = unlockLevel(u.id);
      const cost = (u.costs || [])[lv];
      return { ...u, level: lv, max: u.max || (u.costs || []).length, cost: cost === undefined ? null : cost, maxed: lv >= (u.max || (u.costs || []).length) };
    });
  }

  function buyUnlock(id) {
    const e = ensure();
    if (!e) return { ok: false, reason: 'no-data' };
    const item = metaUnlocks().find(u => u.id === id);
    if (!item) return { ok: false, reason: 'no-item' };
    const lv = unlockLevel(id);
    const max = item.max || (item.costs || []).length;
    if (lv >= max) return { ok: false, reason: 'maxed' };
    const cost = (item.costs || [])[lv];
    if (cost === undefined) return { ok: false, reason: 'no-cost' };
    if ((Number(e.coins) || 0) < cost) return { ok: false, reason: 'poor', need: cost };
    e.coins = (Number(e.coins) || 0) - cost;
    e.unlocks[id] = lv + 1;
    save();
    refreshDots();
    return { ok: true, id, level: lv + 1, cost };
  }

  /* ── 对外视图 ─────────────────────────────────────────────────────── */
  function publicRun(r) {
    if (!r) return null;
    const c = cfg();
    return {
      seed: r.seed,
      practice: !!r.practice,
      layer: r.layer,
      layers: c.layers,
      cleared: r.cleared,
      coins: r.coins,
      tier: r.tier,
      blessings: r.blessings.map(id => blessingById(id)).filter(Boolean),
      team: (r.units || []).map(u => ({
        id: u.id, name: u.name, imageUrl: u.imageUrl, class: u.class, rarity: u.rarity,
        position: u.position, ratio: Math.max(0, Math.min(1, Number(r.hp[u.id]) === undefined ? 1 : Number(r.hp[u.id])))
      })),
      map: (r.map || []).map(row => row.map(n => ({ ...n, current: n.layer === r.layer, done: (r.picked || []).some(p => p.layer === n.layer && p.index === n.index) }))),
      pending: (r.pendingBlessing || []).map(id => blessingById(id)).filter(Boolean),
      pendingShop: r.pendingShop ? {
        stock: (r.pendingShop.stock || []).map(id => blessingById(id)).filter(Boolean),
        cost: r.pendingShop.cost
      } : null,
      log: (r.log || []).slice(-12),
      over: !!r.over
    };
  }

  function summary() {
    const e = ensure();
    if (!e) return null;
    return {
      coins: Number(e.coins) || 0,
      runs: Number(e.runs) || 0,
      weekRuns: Number(e.weekRuns) || 0,
      bestLayer: Number(e.bestLayer) || 0,
      weekKey: e.weekKey,
      unlocks: { ...e.unlocks },
      meta: metaList(),
      run: publicRun(e.run && !e.run.over ? e.run : null),
      lastRun: e.lastRun || null,
      history: (e.history || []).slice(-6).reverse()
    };
  }

  function refreshDots() {
    if (typeof window.refreshRedDots === 'function') { try { window.refreshRedDots(); } catch (err) { /* ignore */ } }
  }

  const api = {
    ensure, cfg, blessings, metaUnlocks, blessingById, rollBlessings,
    mirrorTier, roster, genMap, startRun, chooseNode, onBattleEnd, pickBlessing,
    captureTeam, finish, abandon, metaList, buyUnlock, summary, currentNodes,
    openShop, buyShop, closeShop,
    buildStage, buildMirrorUnit, publicRun, weekKeyOf, NODE_META, mulberry32
  };
  if (window.Game && window.Game.domain) window.Game.domain.expedition = api;
  window.__expedition = api;
})();
