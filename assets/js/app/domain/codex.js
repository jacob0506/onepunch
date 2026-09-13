/* ════════════════════════════════════════════════════════════════
   幻卡传说 · 角色图鉴（Stage 1 · C8）—— 数值单源
   ────────────────────────────────────────────────────────────────
   本文件是「图鉴」的唯一真相源：拥有记录、收集率、分组统计全在这里。
   界面层（ui/codex.js）只读不改。

   设计口径（为什么这么做）：
   · **只增不减的独立记录**：`gameData.codex.owned = { charId: 时间戳 }`。
     为什么不直接用 `gameData.characters` 的 id 去算？因为那是**当前持有**，
     而图鉴要的是「曾经拥有」。将来如果加入分解 / 重生 / 转碎片清角色，
     图鉴不该跟着倒退 —— 收集率是长线成就，丢了就再也补不回来。
   · **登记是幂等的**：sync() 只补新 id，已有 id 不覆盖时间戳（保留「首次获得」）。
   · **模板为准**：即使某个角色当前没持有，图鉴里也占一格（显示剪影），
     所以条目来源是 charactersData（全量 99 个），不是 held 列表。

   ⚠️ 铁律 5：gameData / charactersData 是 index.html 顶层的 `let/const`，
      **不挂 window**。取值必须走裸标识符，且本模块加载早于内联主脚本，
      只能在函数体内读。
   ════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const RARITY_ORDER = ['SUR', 'UR', 'SSR', 'SR', 'R'];

  function gd() {
    try { return (typeof gameData !== 'undefined' && gameData) ? gameData : null; }
    catch (e) { return null; }
  }

  /** 全量角色模板（图鉴的格子来源） */
  function ALL() {
    try {
      if (typeof charactersData !== 'undefined' && Array.isArray(charactersData)) return charactersData;
    } catch (e) { /* TDZ：内联脚本尚未执行 */ }
    const w = window.charactersData;
    return Array.isArray(w) ? w : [];
  }

  /** 当前持有的角色实例 */
  function held() {
    const d = gd();
    return (d && Array.isArray(d.characters)) ? d.characters : [];
  }

  /** 保证 codex 容器存在 */
  function ensure(target) {
    const d = target || gd();
    if (!d) return null;
    if (!d.codex || typeof d.codex !== 'object') d.codex = {};
    if (!d.codex.owned || typeof d.codex.owned !== 'object') d.codex.owned = {};
    return d.codex;
  }

  /** 登记一名角色（幂等；返回 true 表示这是首次收录） */
  function mark(id, target) {
    const cx = ensure(target);
    if (!cx || !id) return false;
    if (cx.owned[id]) return false;
    cx.owned[id] = Date.now();
    return true;
  }

  /**
   * 把当前持有的角色全部登记进图鉴（只增不减）。
   * 启动时 + 抽卡后调用；@returns 本次新增的条目数
   */
  function sync(target) {
    const d = target || gd();
    const cx = ensure(d);
    if (!cx) return 0;
    let added = 0;
    held().forEach(c => {
      if (!c || !c.id) return;
      if (cx.owned[c.id]) return;
      cx.owned[c.id] = Date.now();
      added++;
    });
    return added;
  }

  /** 某个 id 是否已收录 */
  function isOwned(id, target) {
    const cx = ensure(target);
    return !!(cx && cx.owned[id]);
  }

  /** 已收录数量 */
  function count(target) {
    const cx = ensure(target);
    if (!cx) return 0;
    const ids = Object.keys(cx.owned);
    // 只统计真实存在的模板 id（防止历史存档里残留已删除角色的 id 虚高收集率）
    const valid = new Set(ALL().map(c => c && c.id).filter(Boolean));
    return valid.size ? ids.filter(id => valid.has(id)).length : ids.length;
  }

  /* ── 视图 ─────────────────────────────────────────────────── */

  /** 图鉴条目（全量；含拥有与否） */
  function entries() {
    const cx = ensure();
    return ALL().map(c => {
      if (!c) return null;
      const ownedAt = cx ? Number(cx.owned[c.id]) || 0 : 0;
      return {
        id: c.id,
        name: c.name,
        rarity: c.rarity,
        className: c.class,
        class: c.class,
        faction: c.faction,
        position: c.position,
        imageUrl: c.imageUrl,
        skills: c.skills || [],
        baseAttributes: c.baseAttributes || {},
        owned: ownedAt > 0,
        ownedAt
      };
    }).filter(Boolean);
  }

  function groupCount(list, keyFn) {
    const out = {};
    list.forEach(e => {
      const k = keyFn(e) || 'unknown';
      if (!out[k]) out[k] = { owned: 0, total: 0 };
      out[k].total++;
      if (e.owned) out[k].owned++;
    });
    return out;
  }

  /** 收集率总览 */
  function summary() {
    const list = entries();
    const total = list.length;
    const owned = list.filter(e => e.owned).length;
    return {
      owned, total,
      pct: total ? Math.round((owned / total) * 100) : 0,
      missing: total - owned,
      byRarity: groupCount(list, e => e.rarity),
      byClass: groupCount(list, e => e.className),
      byFaction: groupCount(list, e => e.faction)
    };
  }

  /** 最近收录（按首次获得时间倒序） */
  function recent(n) {
    return entries()
      .filter(e => e.owned)
      .sort((a, b) => b.ownedAt - a.ownedAt)
      .slice(0, Math.max(1, Number(n) || 6));
  }

  /** 按稀有度统计的「已收录 / 总数」，用于图鉴顶部徽章 */
  function rarityRows() {
    const s = summary();
    return RARITY_ORDER
      .filter(r => s.byRarity[r])
      .map(r => ({ rarity: r, owned: s.byRarity[r].owned, total: s.byRarity[r].total }));
  }

  const api = {
    RARITY_ORDER,
    ALL, held, ensure, mark, sync, isOwned, count,
    entries, summary, recent, rarityRows
  };

  const segs = 'Game.domain.codex'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__codex = api;
})();
