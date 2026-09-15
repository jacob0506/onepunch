/**
 * favor.js —— 角色好感与档案唯一数值源（E5，2026-09-16）
 *
 * 设计（为什么这么做）：
 *  · **好感是「角色个人」的长期投资**，与战力养成区分开：升级/升星/装备让你
 *    变强，好感让你「认识这个人」。因此它不消耗装备材料（那会跟升星抢资源），
 *    而是消耗**金币**（挂机主产出、无别的争夺者）+ 每日免费谈心兜底。
 *  · **一次性收益只在首次给**（读章 / 谈心按天）：所有入口都幂等，重复点不刷分。
 *  · **等级由 XP 现算**，不存 level 字段 —— 存档里只存 xp / read / routineDate，
 *    避免"改了等级表老存档等级不跟着变"的经典坑。
 *  · **Lv1 加成恒为 0**：好感属性加成 = (level - 1) × attrPerLevel。这样任何
 *    未接触好感系统的存档（含数值快照基线）战力**逐字节不变**（铁律 17 的同类保护）。
 *  · 无 Math.random：座右铭等"看起来随机"的取值走**确定性哈希**（按 id 取模）。
 *
 * 数据来源：
 *   assets/data/favor.json    —— 等级表 / 礼物 / 关系称谓 / 阵营世界观 / 职业信条
 *   assets/data/stories.json  —— 角色专属档案 + 3 章剧情（本批 18 名 SUR）
 *   未登记专属剧情的角色，档案由「阵营世界观 + 职业信条」组合而来（不撒谎、不空白）。
 *
 * ⚠️ 铁律 5：gameData / favorData / storiesData 是 index.html 顶层的 let，
 *    **不挂 window**。本模块加载早于内联主脚本 ⇒ 只能在函数体内读写。
 * 对外：Game.domain.favor + window.__favor
 */
(() => {
  'use strict';

  const DEFAULT_LEVELS = [
    { lv: 1, xp: 0 }, { lv: 2, xp: 50 }, { lv: 3, xp: 130 }, { lv: 4, xp: 250 },
    { lv: 5, xp: 420 }, { lv: 6, xp: 650 }, { lv: 7, xp: 940 }, { lv: 8, xp: 1300 },
    { lv: 9, xp: 1720 }, { lv: 10, xp: 2200 }
  ];
  const DEFAULT_ATTR = { atkPercent: 0.5, defPercent: 0.5, hpPercent: 0.5 };
  const DEFAULT_UNLOCK = [2, 4, 6];
  const DEFAULT_TITLES = [
    { lv: 1, title: '初识' }, { lv: 3, title: '熟识' }, { lv: 5, title: '信赖' },
    { lv: 7, title: '知己' }, { lv: 10, title: '命定' }
  ];

  /* ── 数据入口（全部裸标识符，模块顶层不执行） ───────────────── */

  function gd() {
    try { return (typeof gameData !== 'undefined' && gameData) ? gameData : null; }
    catch (e) { return null; }
  }

  function cfg() {
    try {
      if (typeof favorData !== 'undefined' && favorData && typeof favorData === 'object') return favorData;
    } catch (e) { /* TDZ */ }
    const w = window.favorData;
    return (w && typeof w === 'object') ? w : {};
  }

  function stories() {
    try {
      if (typeof storiesData !== 'undefined' && storiesData && typeof storiesData === 'object') return storiesData;
    } catch (e) { /* TDZ */ }
    const w = window.storiesData;
    return (w && typeof w === 'object') ? w : {};
  }

  /** 角色模板（全量 111 个；不依赖是否持有 —— 档案是"这个人是谁"，不是"我有没有"） */
  function templates() {
    try {
      if (typeof charactersData !== 'undefined' && Array.isArray(charactersData)) return charactersData;
    } catch (e) { /* TDZ */ }
    const w = window.charactersData;
    return Array.isArray(w) ? w : [];
  }

  function charOf(id) {
    return templates().find(c => c && c.id === id) || null;
  }

  function storyOf(id) {
    const list = stories().chars || {};
    return list[id] || null;
  }

  /* ── 存档结构 ─────────────────────────────────────────────── */

  /** 结构迁移（幂等；纯结构，不涉数值） */
  function ensure(d) {
    const data = d || gd();
    if (!data) return null;
    if (!data.favor || typeof data.favor !== 'object') data.favor = {};
    return data.favor;
  }

  /** 单角色的好感记录（create=false 时**完全不写档** —— 只读路径不许有副作用） */
  function recOf(id, d, create) {
    const data = d || gd();
    if (!data || !id) return null;
    if (!create) {
      const f0 = data.favor;
      const r0 = (f0 && typeof f0 === 'object') ? f0[id] : null;
      return (r0 && typeof r0 === 'object') ? r0 : null;
    }
    const f = ensure(data);
    if (!f) return null;
    let r = f[id];
    if (!r || typeof r !== 'object') {
      r = { xp: 0, read: [], routineDate: '', gifts: 0 };
      f[id] = r;
    }
    if (typeof r.xp !== 'number' || !isFinite(r.xp) || r.xp < 0) r.xp = 0;
    if (!Array.isArray(r.read)) r.read = [];
    if (typeof r.routineDate !== 'string') r.routineDate = '';
    if (typeof r.gifts !== 'number') r.gifts = 0;
    return r;
  }

  function save() {
    if (typeof saveGameProgress === 'function') {
      try { saveGameProgress(); } catch (e) { /* noop */ }
    }
  }

  /** 本地日期键（谈心按天，不用时间戳 —— 跨时区/改系统时间都只是"当天再算一次"） */
  function todayKey(now) {
    const t = new Date(typeof now === 'number' ? now : Date.now());
    const p = (n) => String(n).padStart(2, '0');
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
  }

  /* ── 等级 / 进度（纯读） ───────────────────────────────────── */

  /** 等级表（按 lv 升序，xp 是**累计**值） */
  function table() {
    const raw = Array.isArray(cfg().levels) && cfg().levels.length ? cfg().levels : DEFAULT_LEVELS;
    const out = raw
      .map((r, i) => ({ lv: Number(r && r.lv) || (i + 1), xp: Math.max(0, Number(r && r.xp) || 0) }))
      .sort((a, b) => a.lv - b.lv);
    return out.length ? out : DEFAULT_LEVELS.slice();
  }

  function maxLevel() {
    const n = Number(cfg().maxLevel);
    const t = table();
    return n > 0 ? n : (t.length ? t[t.length - 1].lv : 10);
  }

  function totalXp() {
    const t = table();
    return t.length ? t[t.length - 1].xp : 0;
  }

  function xpOf(id, d) {
    const r = recOf(id, d, false);
    return r ? (Number(r.xp) || 0) : 0;
  }

  function levelOfXp(xp) {
    const t = table();
    let lv = t.length ? t[0].lv : 1;
    t.forEach(r => { if (xp >= r.xp) lv = r.lv; });
    return lv;
  }

  function levelOf(id, d) { return levelOfXp(xpOf(id, d)); }

  /** 关系称谓（通用档位；取达到的最高档） */
  function titleOf(level) {
    const tiers = Array.isArray(cfg().titleTiers) && cfg().titleTiers.length ? cfg().titleTiers : DEFAULT_TITLES;
    let out = tiers[0] ? tiers[0].title : '初识';
    tiers.slice().sort((a, b) => (Number(a.lv) || 0) - (Number(b.lv) || 0))
      .forEach(t => { if (level >= (Number(t.lv) || 0)) out = t.title; });
    return out;
  }

  /** 进度条数据 */
  function progress(id, d) {
    const xp = xpOf(id, d);
    const t = table();
    const lv = levelOfXp(xp);
    const cur = t.filter(r => r.lv === lv)[0] || { lv, xp: 0 };
    const next = t.filter(r => r.lv === lv + 1)[0] || null;
    const isMax = !next;
    const need = isMax ? 1 : Math.max(1, next.xp - cur.xp);
    const into = isMax ? 1 : Math.min(need, Math.max(0, xp - cur.xp));
    return {
      xp, level: lv, maxLevel: maxLevel(), isMax, into, need,
      pct: isMax ? 1 : into / need,
      toNext: isMax ? 0 : Math.max(0, next.xp - xp),
      title: titleOf(lv), totalXp: totalXp()
    };
  }

  /**
   * 好感属性加成（**进 calculateTotalStats**）。
   * Lv1 ⇒ 全 0 —— 未玩好感的存档数值与从前逐字节一致。
   */
  function attrBonus(id, d) {
    const per = cfg().attrPerLevel || DEFAULT_ATTR;
    const lv = levelOf(id, d);
    const steps = Math.max(0, lv - 1);
    const out = { atkPercent: 0, defPercent: 0, hpPercent: 0 };
    if (!steps) return out;
    Object.keys(out).forEach(k => {
      out[k] = Math.round(steps * (Number(per[k]) || 0) * 100) / 100;
    });
    return out;
  }

  /* ── 档案（persona） ──────────────────────────────────────── */

  /** 确定性取模（禁 Math.random；同一角色每次同样的座右铭） */
  function hashIdx(str, n) {
    let h = 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return n > 0 ? (h % n) : 0;
  }

  function factionName(f) {
    if (typeof window.getFactionName === 'function') return window.getFactionName(f);
    return f || '未知';
  }

  function className(c) {
    if (typeof window.getClassName === 'function') return window.getClassName(c);
    return c || '';
  }

  /**
   * 角色档案。
   * 有专属剧情 → 用 stories.json 的 title/traits/quote/profile；
   * 否则 → 由「阵营世界观 + 职业信条」组合（保证任何角色都不空白、也不编造具体经历）。
   */
  function personaOf(id) {
    const ch = charOf(id) || {};
    const st = storyOf(id);
    const fb = cfg().fallback || {};
    if (st && st.title) {
      return {
        id,
        name: ch.name || id,
        title: st.title,
        traits: Array.isArray(st.traits) ? st.traits.slice() : (fb.traits || []).slice(),
        quote: st.quote || fb.quote || '',
        profile: st.profile || fb.profile || '',
        hasStory: true
      };
    }
    const fid = ch.faction || '';
    const cls = ch.class || '';
    const fac = (cfg().factions || {})[fid] || null;
    const cl = (cfg().classes || {})[cls] || null;
    const quotes = (cl && Array.isArray(cl.quotes) && cl.quotes.length) ? cl.quotes : null;
    const quote = quotes ? quotes[hashIdx(id, quotes.length)] : (fb.quote || '');
    const traits = [];
    if (fac && fac.tone) traits.push(fac.tone);
    if (cl && cl.creed) traits.push(className(cls));
    traits.push(ch.rarity || '');
    const profile = (fac || cl)
      ? `出身${factionName(fid)}。${(fac && fac.worldview) || ''}` +
        (cl ? `以${className(cls)}的身份行走世间，${cl.creed}` : '')
      : (fb.profile || '');
    const base = className(cls);
    const title = base ? ((fac && fac.tone) ? fac.tone + '·' + base : base) : (fb.title || '无名者');
    return {
      id,
      name: ch.name || id,
      title,
      traits: traits.filter(Boolean).slice(0, 3),
      quote,
      profile,
      hasStory: false
    };
  }

  /* ── 剧情 ─────────────────────────────────────────────────── */

  function unlockLevels() {
    const raw = cfg().unlockLevels;
    const arr = (Array.isArray(raw) && raw.length) ? raw : DEFAULT_UNLOCK;
    return arr.map(n => Number(n) || 1);
  }

  function chaptersOf(id, d) {
    const st = storyOf(id);
    const list = (st && Array.isArray(st.chapters)) ? st.chapters : [];
    const lv = levelOf(id, d);
    const rec = recOf(id, d, false);
    const read = rec ? rec.read : [];
    const need = unlockLevels();
    return list.map((c, i) => {
      const req = Number(need[i]) || 1;
      return {
        index: i,
        title: c.title || `第 ${i + 1} 章`,
        lines: Array.isArray(c.lines) ? c.lines : [],
        unlockLevel: req,
        unlocked: lv >= req,
        read: read.indexOf(i) >= 0,
        lineCount: (Array.isArray(c.lines) ? c.lines.length : 0)
      };
    });
  }

  /** 读完一章（幂等：只有首次登记才给好感） */
  function markRead(id, index, d) {
    const data = d || gd();
    const rec = recOf(id, data, true);
    if (!rec) return { ok: false, reason: 'nodata' };
    const list = chaptersOf(id, data);
    const ch = list.filter(c => c.index === Number(index))[0];
    if (!ch) return { ok: false, reason: 'bad_chapter' };
    if (!ch.unlocked) return { ok: false, reason: 'locked' };
    if (ch.read) return { ok: false, reason: 'read', xpGain: 0, levelUp: 0 };
    rec.read.push(ch.index);
    const xpGain = Math.max(0, Number(cfg().readXp) || 0);
    const res = addXp(id, xpGain, data);
    save();
    return { ok: true, chapter: ch, xpGain, levelUp: res.levelUp, xp: res.xp };
  }

  /* ── 好感获取 ─────────────────────────────────────────────── */

  /** 内部：加好感；返回 { xp, level, levelUp, maxed } */
  function addXp(id, amount, d) {
    const data = d || gd();
    const rec = recOf(id, data, true);
    if (!rec) return { xp: 0, level: 1, levelUp: 0, maxed: false };
    const before = levelOfXp(rec.xp);
    const cap = totalXp();
    const gain = Math.max(0, Number(amount) || 0);
    rec.xp = Math.min(cap, rec.xp + gain);
    const after = levelOfXp(rec.xp);
    return { xp: rec.xp, level: after, levelUp: Math.max(0, after - before), maxed: rec.xp >= cap };
  }

  /** 礼物定价（含兜底，保证 UI 与结算读同一份） */
  function giftById(giftId) {
    const list = Array.isArray(cfg().gifts) ? cfg().gifts : [];
    return list.filter(g => g && g.id === giftId)[0] || null;
  }

  function giftList() {
    const list = Array.isArray(cfg().gifts) ? cfg().gifts : [];
    return list.map(g => ({
      id: g.id, name: g.name || g.id, icon: g.icon || 'fa-gift',
      gold: Math.max(0, Number(g.gold) || 0), xp: Math.max(0, Number(g.xp) || 0),
      tone: g.tone || 'primary'
    }));
  }

  /** 赠礼：扣金币 → 加好感（金币不足 / 已满级都会挡下） */
  function giveGift(id, giftId, d) {
    const data = d || gd();
    if (!data) return { ok: false, reason: 'nodata' };
    const gift = giftById(giftId);
    if (!gift) return { ok: false, reason: 'bad_gift' };
    const p = progress(id, data);
    if (p && p.isMax) return { ok: false, reason: 'maxed' };
    if (!data.player) data.player = {};
    const gold = Number(data.player.gold) || 0;
    const cost = Math.max(0, Number(gift.gold) || 0);
    if (gold < cost) return { ok: false, reason: 'gold', need: cost - gold };
    data.player.gold = gold - cost;
    const rec = recOf(id, data, true);
    if (rec) rec.gifts = (Number(rec.gifts) || 0) + 1;
    const res = addXp(id, gift.xp, data);
    save();
    return { ok: true, gift: giftByName(gift), cost, xpGain: gift.xp, levelUp: res.levelUp, maxed: res.maxed };
  }

  function giftByName(g) {
    return { id: g.id, name: g.name || g.id, icon: g.icon || 'fa-gift', gold: Number(g.gold) || 0, xp: Number(g.xp) || 0, tone: g.tone || 'primary' };
  }

  /** 今日还能谈心吗 */
  function canRoutine(id, d) {
    const rec = recOf(id, d, false);
    return !rec || rec.routineDate !== todayKey();
  }

  /** 每日谈心（每人每天一次；免费小额好感，长线兜底） */
  function routine(id, d) {
    const data = d || gd();
    if (!data) return { ok: false, reason: 'nodata' };
    const rec = recOf(id, data, true);
    if (!rec) return { ok: false, reason: 'nodata' };
    if (rec.routineDate === todayKey()) return { ok: false, reason: 'done' };
    const p = progress(id, data);
    if (p && p.isMax) { rec.routineDate = todayKey(); save(); return { ok: false, reason: 'maxed' }; }
    rec.routineDate = todayKey();
    const r = cfg().routine || {};
    const xpGain = Math.max(1, Number(r.xp) || 20);
    const res = addXp(id, xpGain, data);
    save();
    return { ok: true, xpGain, levelUp: res.levelUp };
  }

  /* ── 外观展示（E5-B）：主页展示位 + 头像框 ─────────────────── */

  /*
   * 设计口径：**纯外观、零属性**。
   * 好感的数值回报已经由 attrBonus 给出（攻/防/生各 (lv-1)×0.5%）。
   * 这里再叠加任何加成都会动到数值基线（snapshot-numbers 会红），
   * 所以展示位只负责"把你的投入摆到主页上"，不给一点战力。
   */

  const DEFAULT_FRAME = 'f_none';

  function frameCfg() {
    const c = cfg();
    return (c && c.frames && typeof c.frames === 'object') ? c.frames : {};
  }

  /** 展示位存档段（create=false 时**不写档**，返回只读默认值） */
  function metaOf(d, create) {
    const data = d || gd();
    const fallback = { display: '', frame: DEFAULT_FRAME };
    if (!data) return fallback;
    let m = data.favorMeta;
    if (!m || typeof m !== 'object') {
      if (!create) return fallback;
      m = data.favorMeta = { display: '', frame: DEFAULT_FRAME };
    }
    if (typeof m.display !== 'string') {
      if (!create) return fallback;
      m.display = '';
    }
    if (typeof m.frame !== 'string' || !m.frame) {
      if (!create) return fallback;
      m.frame = DEFAULT_FRAME;
    }
    return m;
  }

  /** 当前持有的角色 id（展示位只能放持有中的人 —— 拿不到的不能摆出来） */
  function ownedIds(d) {
    const data = d || gd();
    const arr = (data && Array.isArray(data.characters)) ? data.characters : [];
    return arr.map(c => (c && (c.id || c.charId)) || '').filter(Boolean);
  }

  /** 好感里程碑统计（头像框解锁判定的唯一数据源） */
  function favorStats(d) {
    const data = d || gd();
    let bondPoints = 0;
    let maxLv = 1;
    let storyRead = 0;
    const atLeast = {};
    allIds().forEach(id => {
      const lv = levelOf(id, data);
      if (lv > 1) bondPoints += lv - 1;      // 基线 0：没人碰好感时恒为 0
      if (lv > maxLv) maxLv = lv;
      for (let L = 2; L <= lv; L++) atLeast[L] = (atLeast[L] || 0) + 1;
      const rec = recOf(id, data, false);
      if (rec && Array.isArray(rec.read)) storyRead += rec.read.length;
    });
    return {
      bondPoints, maxLevel: maxLv, storyRead,
      countAtLeast: (L) => atLeast[L] || 0
    };
  }

  function globalFrames() {
    return (frameCfg().global || []).filter(f => f && f.id).map(f => ({
      id: f.id,
      name: f.name || f.id,
      icon: f.icon || 'fa-circle-o',
      tone: f.tone || 'muted',
      desc: f.desc || '',
      kind: 'global',
      req: f.req || { type: 'none' }
    }));
  }

  function charFrameDefs() {
    const c = frameCfg().charFrame;
    return (c && Array.isArray(c.levels)) ? c.levels.filter(x => x && Number(x.lv) > 0) : [];
  }

  /** 角色专属框：id 形如 cf_<charId>_<lv>，名字 = 角色名 + 档位后缀 */
  function charFrameOf(charId, lv) {
    const ch = charOf(charId);
    if (!ch || !ch.name) return null;
    const def = charFrameDefs().filter(x => Number(x.lv) === Number(lv))[0];
    if (!def) return null;
    const L = Number(def.lv);
    return {
      id: `cf_${charId}_${L}`,
      name: `${ch.name}${def.suffix || ''}`,
      icon: def.icon || 'fa-heart',
      tone: def.tone || 'accent',
      desc: `${ch.name} 的好感达到 Lv.${L}`,
      kind: 'char',
      charId,
      level: L,
      req: { type: 'charLevel', charId, level: L }
    };
  }

  function reqMet(req, d, stat) {
    const r = req || {};
    const v = Number(r.value) || 0;
    switch (r.type) {
      case 'none': return true;
      case 'bondPoints': return stat.bondPoints >= v;
      case 'maxLevel': return stat.maxLevel >= v;
      case 'storyRead': return stat.storyRead >= v;
      case 'minLevelCount': return stat.countAtLeast(Number(r.level) || 1) >= v;
      case 'charLevel': return levelOf(r.charId, d) >= (Number(r.level) || 0);
      default: return false;
    }
  }

  /** 全部「已拿到 + 还没拿到」的通用框 + **已拿到**的专属框（未达标的专属框不列出，避免 222 条刷屏） */
  function frameCatalog(d) {
    const data = d || gd();
    const stat = favorStats(data);
    const out = globalFrames().map(f => {
      const o = Object.assign({}, f);
      o.unlocked = reqMet(f.req, data, stat);
      return o;
    });
    charFrameDefs().forEach(def => {
      allIds().forEach(id => {
        if (levelOf(id, data) < Number(def.lv)) return;
        const f = charFrameOf(id, def.lv);
        if (!f) return;
        f.unlocked = true;
        out.push(f);
      });
    });
    return out;
  }

  function frameById(id, d) {
    const data = d || gd();
    if (!id) return frameById(DEFAULT_FRAME, data);
    const g = globalFrames().filter(f => f.id === id)[0];
    if (g) {
      g.unlocked = reqMet(g.req, data, favorStats(data));
      return g;
    }
    const m = /^cf_(.+)_(\d+)$/.exec(id);
    if (m) {
      const f = charFrameOf(m[1], Number(m[2]));
      if (f) { f.unlocked = levelOf(m[1], data) >= f.level; return f; }
    }
    return null;
  }

  /** 头像框收集进度（专属框总量 = 全角色 × 档位数） */
  function frameProgress(d) {
    const data = d || gd();
    const defs = charFrameDefs();
    const ids = allIds();
    let charGot = 0;
    defs.forEach(def => ids.forEach(id => { if (levelOf(id, data) >= Number(def.lv)) charGot++; }));
    const globals = globalFrames();
    const stat = favorStats(data);
    return {
      charGot,
      charTotal: defs.length * ids.length,
      globalGot: globals.filter(f => reqMet(f.req, data, stat)).length,
      globalTotal: globals.length
    };
  }

  /** 设为主页展示（必须持有；传空 = 取消展示） */
  function setDisplay(id, d) {
    const data = d || gd();
    if (!data) return { ok: false, reason: 'nodata' };
    if (!id) {
      metaOf(data, true).display = '';
      save();
      return { ok: true };
    }
    if (!charOf(id)) return { ok: false, reason: 'unknown' };
    if (ownedIds(data).indexOf(id) < 0) return { ok: false, reason: 'notowned' };
    metaOf(data, true).display = id;
    save();
    return { ok: true };
  }

  /** 佩戴头像框（必须已解锁） */
  function setFrame(id, d) {
    const data = d || gd();
    if (!data) return { ok: false, reason: 'nodata' };
    const f = frameById(id, data);
    if (!f) return { ok: false, reason: 'unknown' };
    if (!f.unlocked) return { ok: false, reason: 'locked', frame: f };
    metaOf(data, true).frame = f.id;
    save();
    return { ok: true, frame: f };
  }

  /** 主页展示位的完整视图（UI 只读这一个） */
  function displayInfo(d) {
    const data = d || gd();
    const m = metaOf(data, false);
    const id = m.display || '';
    const owned = id ? ownedIds(data).indexOf(id) >= 0 : false;
    const f = frameById(m.frame, data);
    const frame = (f && f.unlocked)
      ? f
      : (frameById(DEFAULT_FRAME, data) || { id: DEFAULT_FRAME, name: '不加框', icon: 'fa-ban', tone: 'muted', desc: '', kind: 'global', unlocked: true });
    return {
      id, owned,
      name: id ? ((charOf(id) || {}).name || '') : '',
      summary: (id && owned) ? summary(id, data) : null,
      frame,
      candidates: ownedIds(data)
    };
  }

  /* ── 视图聚合（UI 只读这一个） ────────────────────────────── */

  function summary(id, d) {
    const data = d || gd();
    const ch = charOf(id) || {};
    const p = progress(id, data);
    const persona = personaOf(id);
    const rec = recOf(id, data, false);
    return {
      id,
      name: ch.name || id,
      rarity: ch.rarity || '',
      className: ch.class || '',
      faction: ch.faction || '',
      imageUrl: ch.imageUrl || '',
      persona,
      progress: p,
      chapters: chaptersOf(id, data),
      canRoutine: canRoutine(id, data),
      routineXp: Math.max(1, Number((cfg().routine || {}).xp) || 20),
      gifts: giftList(),
      giftsGiven: rec ? (Number(rec.gifts) || 0) : 0,
      readCount: rec ? rec.read.length : 0,
      bonus: attrBonus(id, data)
    };
  }

  /** 有专属剧情的角色 id 列表（图鉴角标 / 统计用） */
  function storyCharIds() {
    return Object.keys(stories().chars || {});
  }

  /** 全量角色模板 id（档案列表用；不依赖是否持有） */
  function allIds() {
    return templates().map(c => c && c.id).filter(Boolean);
  }

  /** 好感投入总览（首页/档案页头部）—— 纯读，不创建存档字段 */
  function overview(d) {
    const data = d || gd();
    const f = (data && data.favor && typeof data.favor === 'object') ? data.favor : {};
    const ids = Object.keys(f);
    let highest = 1;
    let touched = 0;
    ids.forEach(id => {
      const lv = levelOf(id, data);
      if (lv > highest) highest = lv;
      if (lv > 1) touched++;
    });
    const withStory = storyCharIds();
    let readTotal = 0;
    let readStory = 0;
    withStory.forEach(id => {
      const rec = recOf(id, data, false);
      const n = rec ? rec.read.length : 0;
      readTotal += n;
      if (n > 0) readStory++;
    });
    const chaptersTotal = withStory.reduce((n, id) => n + ((storyOf(id).chapters || []).length), 0);
    return {
      touched, highest, total: templates().length,
      storyChars: withStory.length,
      chaptersTotal, readTotal,
      readPct: chaptersTotal ? Math.round((readTotal / chaptersTotal) * 100) : 0,
      readStory
    };
  }

  const api = {
    ensure, recOf, save, todayKey, cfg,
    table, maxLevel, totalXp, xpOf, levelOf, levelOfXp, titleOf, progress, attrBonus,
    personaOf, chaptersOf, markRead, addXp,
    giftList, giftById, giveGift, canRoutine, routine,
    summary, storyCharIds, overview, allIds,
    /* E5-B 外观展示：纯外观零属性 */
    metaOf, ownedIds, favorStats, frameCatalog, frameById, frameProgress,
    setDisplay, setFrame, displayInfo, DEFAULT_FRAME
  };

  const segs = 'Game.domain.favor'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__favor = api;
})();
