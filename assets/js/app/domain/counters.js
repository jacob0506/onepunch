/**
 * counters.js —— 职业克制关系唯一数值源（C9 切片 1）
 *
 * 承载：ring / pct / multOf / table / describe
 *
 * 设计前提：
 *   · 克制环数据在 assets/data/counters.json（铁律 1：改数值只改 JSON）。
 *   · 6 职业构成**单一有向环**：每个职业恰好克 1 个、被 1 个克（无分支、无互克）。
 *     环序（tank→warrior→archer→healer→assassin→mage→tank）由 JSON 决定，本文件不写死。
 *   · 战斗里唯一应用点在 battle/scene.js 的 computeDebugDamage（伤害乘区），
 *     回归网 check-counters 盯着"全仓只允许 1 处 multOf 调用"。
 *
 * ⚠️ 裸标识符依赖（铁律 5）：countersData 是内联顶层 `let`，不挂 window。
 *    必须在函数体内用裸标识符读，且本模块加载早于内联主脚本 ⇒ 一律 try/catch 包 TDZ。
 */
(() => {
  'use strict';

  /* 加载失败时的兜底（与 counters.json 同值；拿不到数据时克制整体退化为中性，不崩） */
  const FALLBACK = {
    counterPct: 15,
    ring: [
      { from: 'tank', to: 'warrior', text: '坚甲卸力' },
      { from: 'warrior', to: 'archer', text: '近身缠斗' },
      { from: 'archer', to: 'healer', text: '集火辅助' },
      { from: 'healer', to: 'assassin', text: '净化反制' },
      { from: 'assassin', to: 'mage', text: '切后突袭' },
      { from: 'mage', to: 'tank', text: '法术穿透' }
    ]
  };

  function data() {
    try {
      return (typeof countersData !== 'undefined' && countersData && Array.isArray(countersData.ring))
        ? countersData
        : FALLBACK;
    } catch (e) { return FALLBACK; }
  }

  /** 克制环条目（只读视图） */
  function ring() { return data().ring.slice(); }

  /** 克制加成百分比（0–50 合法域外回退 15） */
  function pct() {
    const n = Number(data().counterPct);
    return (Number.isFinite(n) && n >= 0 && n <= 50) ? n : 15;
  }

  /**
   * 攻击方职业 → 目标职业 的克制乘数。
   * @returns {{mult:number, state:'counter'|'weak'|'neutral', rel:object|null}}
   *          counter=克制(+pct)  weak=被克(-pct)  neutral=无关(×1)
   */
  function multOf(attackerClass, targetClass) {
    const a = attackerClass || null;
    const t = targetClass || null;
    if (!a || !t) return { mult: 1, state: 'neutral', rel: null };
    let counter = null, weak = null;
    ring().forEach(r => {
      if (!r || !r.from || !r.to) return;
      if (r.from === a && r.to === t) counter = r;
      if (r.from === t && r.to === a) weak = r;
    });
    const p = pct();
    if (counter) return { mult: 1 + p / 100, state: 'counter', rel: counter };
    if (weak) return { mult: 1 - p / 100, state: 'weak', rel: weak };
    return { mult: 1, state: 'neutral', rel: null };
  }

  /**
   * UI 用：每个职业 克谁 / 被谁克。
   * @returns {Record<string, {counters:string[], weakTo:string[], entries:object[]}>} key = 职业 key
   */
  function table() {
    const out = {};
    ring().forEach(r => {
      if (!r || !r.from || !r.to) return;
      out[r.from] = out[r.from] || { counters: [], weakTo: [], entries: [] };
      out[r.to] = out[r.to] || { counters: [], weakTo: [], entries: [] };
      out[r.from].counters.push(r.to);
      out[r.from].entries.push(r);
      out[r.to].weakTo.push(r.from);
    });
    return out;
  }

  /** 一条克制关系的可读文案："法师 克 坦克（法术穿透）" */
  function describe(rel, nameOf) {
    if (!rel) return '';
    const n = nameOf || (k => k);
    return `${n(rel.from)} 克 ${n(rel.to)}${rel.text ? `（${rel.text}）` : ''}`;
  }

  const api = { ring, pct, multOf, table, describe };
  const segs = 'Game.domain.counters'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__counters = api;
})();
