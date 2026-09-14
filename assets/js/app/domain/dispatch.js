/**
 * E7 派驻探险 —— 数值单源
 * ==========================================================================
 * 设计要点（docs/10 §四 E7 · 挂机深度化）：
 *  1. **挂机收菜之外叠一层"主动放置"**：派哪支队、去哪个地点（时长/风险/收益侧重）、
 *     结算时事件三选一 —— 让"放置"本身产生决策。
 *  2. **全确定性（铁律 17/18）**：禁 Math.random；事件抽取与赌局结果全部由
 *     mulberry32(hashStr(slotKey)) 决定 —— 派驻创建那一刻结果已定，重开页面不可 SL。
 *  3. **风险 = 队伍战力 vs 地点推荐战力**：powerRatio 决定①收益加成（超战力最多 +50%）
 *     ②事件"赌一把"成功率（三档 85%/60%/35%）—— "派强队去深渊"从此有意义。
 *  4. **发奖走 goals.grant 单源**；结算埋点 window.bumpGoal('dispatch')（stats 单源顺带累计）。
 *  5. **不打战斗引擎**：本模块是纯数值层，无 scene.js hook（E1–E4 里唯一不碰战斗的切片）。
 *  6. 多队并行：3 个派驻槽，角色跨槽互斥（同角色不能同时在两处探险）。
 *
 * 配置：assets/data/dispatch.json（拿不到时用内置同值兜底）
 * 导出：Game.domain.dispatch + window.__dispatch
 */
(() => {
  const FALLBACK = {
    version: 1,
    slotCount: 3,
    minChars: 1,
    maxChars: 5,
    cancelRefundPct: 50,
    cancelMinMinutes: 5,
    minGambleRatio: 1.2,
    okGambleRatio: 0.8,
    places: [],
    events: []
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
    const d = (typeof dispatchData !== 'undefined' && dispatchData) ? dispatchData : FALLBACK;
    return d && typeof d === 'object' ? d : FALLBACK;
  }
  function gd() { return (typeof gameData !== 'undefined' && gameData) ? gameData : null; }
  function save() { if (typeof saveGameProgress === 'function') saveGameProgress(); }
  function placeOf(id) {
    const list = Array.isArray(cfg().places) ? cfg().places : [];
    return list.find(p => p && p.id === id) || null;
  }

  /* ── 风险公式（确定性，可断言） ───────────────────────────────────────── */
  /** 队伍战力 / 地点推荐战力 → 收益加成（达标 1×，超战力最多 +50%） */
  function bonusMult(ratio) {
    return 1 + Math.min(0.5, Math.max(0, (Number(ratio) - 1) * 0.5));
  }
  /** 队伍战力 / 推荐战力 → "赌一把"成功率（三档，写死在规则里便于断言与外显） */
  function gambleRate(ratio) {
    const r = Number(ratio) || 0;
    const c = cfg();
    if (r >= (Number(c.minGambleRatio) || 1.2)) return 0.85;
    if (r >= (Number(c.okGambleRatio) || 0.8)) return 0.6;
    return 0.35;
  }

  /* ── 存档结构 ─────────────────────────────────────────────────────────── */
  function slots() {
    const d = gd();
    if (!d) return [];
    if (!d.dispatch || typeof d.dispatch !== 'object') d.dispatch = {};
    const s = d.dispatch;
    const n = Math.max(1, Number(cfg().slotCount) || 3);
    if (!Array.isArray(s.slots) || s.slots.length !== n) {
      s.slots = Array.from({ length: n }, () => null);
    }
    if (typeof s.nextId !== 'number') s.nextId = 1;
    return s.slots;
  }

  /** 某角色是否已在别的槽里派驻 */
  function findSlotOf(charId) {
    const ss = slots();
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i];
      if (s && Array.isArray(s.chars) && s.chars.includes(charId)) return i;
    }
    return -1;
  }

  function teamPower(charIds) {
    return (charIds || []).reduce((sum, id) => {
      const inst = (gd().characters || []).find(c => c && c.id === id);
      if (!inst) return sum;
      try { return sum + ((typeof calculateCharacterPower === 'function') ? calculateCharacterPower(inst) : 0); }
      catch (e) { return sum; }
    }, 0);
  }

  /* ── 派驻流程 ─────────────────────────────────────────────────────────── */
  function start(slotIdx, placeId, charIds) {
    const d = gd();
    if (!d) return { ok: false, reason: 'no_save' };
    const ss = slots();
    const place = placeOf(placeId);
    if (!place) return { ok: false, reason: 'bad_place' };
    if (slotIdx < 0 || slotIdx >= ss.length) return { ok: false, reason: 'bad_slot' };
    if (ss[slotIdx]) return { ok: false, reason: 'slot_busy' };
    const c = cfg();
    const ids = Array.isArray(charIds) ? [...new Set(charIds.filter(Boolean))] : [];
    if (ids.length < (Number(c.minChars) || 1)) return { ok: false, reason: 'too_few' };
    if (ids.length > (Number(c.maxChars) || 5)) return { ok: false, reason: 'too_many' };
    // 跨槽互斥
    for (const id of ids) {
      const at = findSlotOf(id);
      if (at >= 0) return { ok: false, reason: 'char_busy', slot: at };
    }
    const hours = Math.max(0.1, Number(place.hours) || 8);
    ss[slotIdx] = {
      id: d.dispatch.nextId++,
      placeId,
      chars: ids,
      startAt: Date.now(),
      hours,
      done: false,
      pendingEvent: null
    };
    save();
    return { ok: true, power: teamPower(ids), recPower: Number(place.recPower) || 0 };
  }

  /** 槽内剩余毫秒（<0 = 已到点） */
  function msLeft(slot) {
    return (slot.startAt + slot.hours * 3600000) - Date.now();
  }
  function isReady(slot) {
    return !!slot && !slot.done && !slot.pendingEvent && msLeft(slot) <= 0;
  }

  /** 提前召回：按已过时长比例 × refundPct 拿保底（无事件），不足最短时长颗粒无收 */
  function cancel(slotIdx) {
    const ss = slots();
    const s = ss[slotIdx];
    if (!s || s.done) return { ok: false, reason: 'no_run' };
    const c = cfg();
    const elapsed = Date.now() - s.startAt;
    const minMs = (Number(c.cancelMinMinutes) || 5) * 60000;
    if (elapsed < minMs) {
      ss[slotIdx] = null;
      save();
      return { ok: true, refunded: false, reason: 'too_short' };
    }
    const place = placeOf(s.placeId);
    const frac = Math.min(1, elapsed / Math.max(1, s.hours * 3600000));
    const mult = frac * ((Number(c.cancelRefundPct) || 50) / 100);
    const rewards = scaleRewards(place ? place.rewards : {}, mult, 0);
    const grant = (window.__goals && typeof window.__goals.grant === 'function') ? window.__goals.grant : null;
    const lines = grant ? grant(rewards, gd()) : [];
    ss[slotIdx] = null;
    save();
    return { ok: true, refunded: true, rewards, lines, frac };
  }

  /** 奖励缩放：gold/exp/gems 取整，materials 向下取整；为 0 的项直接省略（不出假数） */
  function scaleRewards(rw, mult, ratio) {
    const out = {};
    const bm = (typeof ratio === 'number') ? bonusMult(ratio) : 1;
    const m = mult * bm;
    if (!rw || typeof rw !== 'object') return out;
    ['gold', 'exp', 'gems'].forEach(k => {
      const v = Number(rw[k]) || 0;
      if (v > 0) {
        const q = Math.floor(v * m);
        if (q >= 1) out[k] = q;
      }
    });
    if (rw.materials && typeof rw.materials === 'object') {
      const mats = {};
      Object.keys(rw.materials).forEach(k => {
        const v = Number(rw.materials[k]) || 0;
        if (v > 0) {
          const q = Math.floor(v * m);
          if (q >= 1) mats[k] = q;
        }
      });
      if (Object.keys(mats).length) out.materials = mats;
    }
    return out;
  }

  /** 事件自带材料包并入奖励（预览与结算共用，保证 UI 显示 = 实际到手） */
  function mergeEventMaterials(rewards, opt) {
    if (opt && opt.materials && typeof opt.materials === 'object') {
      const mats = Object.assign({}, rewards.materials || {});
      Object.keys(opt.materials).forEach(k => {
        mats[k] = (mats[k] || 0) + (Number(opt.materials[k]) || 0);
      });
      rewards.materials = mats;
    }
    return rewards;
  }

  /** 事件选项预览（safe/materials 与结算逐字节同源；gamble 返回成功侧） */
  function previewOption(placeId, opt, ratio) {
    const place = placeOf(placeId) || {};
    const rewards = scaleRewards(place.rewards || {}, Number(opt.mult) || 0, ratio);
    return mergeEventMaterials(rewards, opt);
  }

  /**
   * 结算（到点后调用）：发基础收益 → 生成事件三选一挂起（玩家选完才清槽）。
   * 返回 { ok, event, options, power, recPower }；UI 弹三选一。
   */
  function settle(slotIdx) {
    const ss = slots();
    const s = ss[slotIdx];
    if (!s || s.done || s.pendingEvent) return { ok: false, reason: 'not_ready' };
    if (msLeft(s) > 0) return { ok: false, reason: 'in_progress', msLeft: msLeft(s) };
    const place = placeOf(s.placeId);
    if (!place) { ss[slotIdx] = null; save(); return { ok: false, reason: 'bad_place' }; }
    const ratio = teamPower(s.chars) / Math.max(1, Number(place.recPower) || 1);
    const rewards = scaleRewards(place.rewards, 1, ratio);
    const grant = (window.__goals && typeof window.__goals.grant === 'function') ? window.__goals.grant : null;
    const lines = grant ? grant(rewards, gd()) : [];
    if (typeof window.bumpGoal === 'function') window.bumpGoal('dispatch', 1);
    // 事件抽取：种子 = slot 三元组（派驻创建即定，不可 SL）
    const rnd = mulberry32(hashStr(`dp_${s.id}_${s.placeId}_${s.startAt}`));
    const pool = (Array.isArray(cfg().events) && cfg().events.length) ? cfg().events : FALLBACK_EVENTS;
    const ev = pool[Math.floor(rnd() * pool.length)] || null;
    s.done = true;
    s.baseRewards = rewards;
    if (!ev) { slots()[slotIdx] = null; save(); return { ok: true, rewards, lines, ratio, event: null, power: teamPower(s.chars), recPower: Number(place.recPower) || 0 }; }
    s.pendingEvent = { id: ev.id, roll: rnd() };      // 赌局结果此刻定死
    save();
    return { ok: true, rewards, lines, ratio, event: ev, power: teamPower(s.chars), recPower: Number(place.recPower) || 0 };
  }

  /**
   * 事件三选一：option.kind
   *   safe     → 地点收益 × mult（确定性）
   *   gamble   → 成功率由 powerRatio 三档决定；成功 ×mult，失败拿 15% 安慰奖
   *   materials→ 地点收益 × mult + 固定材料包
   */
  function resolveEvent(slotIdx, optionIdx) {
    const ss = slots();
    const s = ss[slotIdx];
    if (!s || !s.pendingEvent) return { ok: false, reason: 'no_event' };
    const place = placeOf(s.placeId);
    const pool = (Array.isArray(cfg().events) && cfg().events.length) ? cfg().events : FALLBACK_EVENTS;
    const ev = pool.find(e => e && e.id === s.pendingEvent.id) || null;
    const opt = (ev && Array.isArray(ev.options)) ? ev.options[Number(optionIdx)] : null;
    if (!opt) return { ok: false, reason: 'bad_option' };
    const ratio = teamPower(s.chars) / Math.max(1, Number((place || {}).recPower) || 1);
    let success = true, rate = null;
    let rewards;
    if (opt.kind === 'gamble') {
      rate = gambleRate(ratio);
      success = s.pendingEvent.roll < rate;          // 派驻创建时 roll 已定 → 不可 SL
      rewards = scaleRewards(place ? place.rewards : {}, success ? (Number(opt.mult) || 1) : 0.15, ratio);
    } else {
      rewards = mergeEventMaterials(
        scaleRewards(place ? place.rewards : {}, Number(opt.mult) || 0, ratio), opt);
    }
    const grant = (window.__goals && typeof window.__goals.grant === 'function') ? window.__goals.grant : null;
    const lines = grant ? grant(rewards, gd()) : [];
    slots()[slotIdx] = null;                          // 事件处理完才清槽
    save();
    return { ok: true, success, rate, rewards, lines, eventName: ev ? ev.name : '', optionLabel: opt.label };
  }

  /* ── 内置兜底事件（json 拿不到时至少能玩） ────────────────────────────── */
  const FALLBACK_EVENTS = [
    {
      id: 'ev_merchant', name: '流浪商队', text: '一支流浪商队在营地外停了下来。',
      options: [
        { label: '公平交易', desc: '稳拿一笔报酬', kind: 'safe', mult: 0.3 },
        { label: '豪赌一票', desc: '成功翻倍', kind: 'gamble', mult: 1.0 }
      ]
    }
  ];

  /* ── 摘要（UI） ───────────────────────────────────────────────────────── */
  function summary() {
    const ss = slots();
    return {
      slotCount: ss.length,
      slots: ss.map((s, i) => {
        if (!s) return { index: i, state: 'empty' };
        const place = placeOf(s.placeId);
        const ratio = teamPower(s.chars) / Math.max(1, Number((place || {}).recPower) || 1);
        return {
          index: i,
          state: s.pendingEvent ? 'event' : (isReady(s) ? 'ready' : 'running'),
          id: s.id, placeId: s.placeId,
          placeName: place ? place.name : s.placeId,
          hours: s.hours, chars: s.chars.slice(),
          power: teamPower(s.chars), recPower: Number((place || {}).recPower) || 0,
          ratio, bonus: bonusMult(ratio),
          msLeft: msLeft(s),
          readyPct: Math.min(100, Math.round((Date.now() - s.startAt) / Math.max(1, s.hours * 3600000) * 100)),
          event: s.pendingEvent
        };
      }),
      places: (Array.isArray(cfg().places) ? cfg().places : []).slice()
    };
  }

  const api = {
    cfg, slots, start, cancel, settle, resolveEvent, summary,
    teamPower, findSlotOf, bonusMult, gambleRate, isReady, msLeft, scaleRewards,
    mergeEventMaterials, previewOption
  };
  if (window.Game && window.Game.domain) window.Game.domain.dispatch = api;
  window.__dispatch = api;
})();
