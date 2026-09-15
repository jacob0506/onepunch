/* ════════════════════════════════════════════════════════════════
   幻卡传说 · 每日目标（Stage 1 · C5）—— 数值单源
   ────────────────────────────────────────────────────────────────
   本文件是「今日目标/每日任务」的唯一真相源：目标定义、进度推进、
   奖励发放全在这里。界面层（ui/goals.js）只读不改。

   ⚠️ 铁律 5：gameData 是 index.html 顶层的 `let`，**不会挂到 window**。
      取值必须走 gd() 裸标识符（写 window.gameData 会得到 undefined）。

   ⚠️ 跨日重置：daily.date 与本地日期不同即整体重置（进度与已领都清）。
      重置发生在 ensureDaily()，启动时与各事件上报时都会过一遍。

   埋点：window.bumpGoal(event, n) —— 由抽卡 / 升级 / 战斗胜利 /
      领取挂机 / 扫荡 等调用点上报，本文件负责推进所有匹配的目标。
   ════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  function gd() {
    try { return (typeof gameData !== 'undefined' && gameData) ? gameData : null; }
    catch (e) { return null; }
  }

  /* ── 目标定义（改这里 = 改全站每日目标）────────────────────
     id      唯一键（存档里的 progress/claimed 用它）
     name    展示名
     desc    一行说明
     target  达成次数
     event   由哪个事件推进（null = 自动达成，如登录）
     page    「去完成」跳转的页面 id（null = 不可跳转）
     reward  { gold?, gems?, materials?: { key: n } }              */
  const GOALS = [
    { id: 'login',   name: '每日登录',       desc: '登录即达成',            target: 1, event: null,          page: null,         reward: { gems: 50 } },
    { id: 'gacha',   name: '时空召唤 1 次',  desc: '单抽或十连都算',        target: 1, event: 'gacha',       page: 'gacha',      reward: { gems: 100 } },
    { id: 'battle',  name: '通关关卡 3 次',  desc: '挑战并取胜',            target: 3, event: 'battle',      page: 'stages',     reward: { gold: 5000 } },
    { id: 'levelup', name: '角色升级 5 次',  desc: '任意角色升 1 级算 1 次', target: 5, event: 'levelup',     page: 'characters', reward: { gold: 8000 } },
    { id: 'sweep',   name: '扫荡 5 次',      desc: '已通关关卡快速扫荡',    target: 5, event: 'sweep',       page: 'home',       reward: { gems: 80 } },
    { id: 'idle',    name: '领取挂机 2 次',  desc: '把挂机收益收进口袋',    target: 2, event: 'idle_claim',  page: 'home',       reward: { materials: { enhanceStone: 20 } } },
    { id: 'dispatch', name: '完成派驻 1 次', desc: '派小队探险并领取回报',  target: 1, event: 'dispatch',    page: 'home',       reward: { gems: 80 } },
    { id: 'arena',    name: '竞技场获胜 1 次', desc: '在镜像竞技场赢下一场', target: 1, event: 'arena_win',   page: 'stages',     reward: { gems: 60 } }
  ];

  const defOf = (id) => GOALS.filter(g => g.id === id)[0] || null;

  /* ── 日期与状态 ───────────────────────────────────────────── */

  function dayKey(ms) {
    const d = (ms == null) ? new Date() : new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /** 保证 daily 存在且是今天；跨日则整体重置并自动达成「每日登录」
   *  ⚠️ progress / claimed 的 key 一律是**目标 id**（如 'idle'），不是事件名
   *     （事件名是 'idle_claim'）—— 读存档时别搞混。 */
  function ensureDaily(d) {
    const data = d || gd();
    if (!data) return null;
    const today = dayKey();
    if (!data.daily || data.daily.date !== today) {
      data.daily = { date: today, progress: {}, claimed: [] };
      const login = defOf('login');
      if (login) data.daily.progress.login = login.target;
    }
    const st = data.daily;
    if (!st.progress || typeof st.progress !== 'object') st.progress = {};
    if (!Array.isArray(st.claimed)) st.claimed = [];
    return st;
  }

  /* ── 事件上报 ─────────────────────────────────────────────── */

  /**
   * 上报一次事件，推进所有 event 匹配且未达成的目标。
   * 不写盘（调用方通常自己 saveGameProgress），只改内存。
   * @returns 被推进的目标条数
   */
  function bump(event, n, d) {
    const data = d || gd();
    if (!data || !event) return 0;
    const add = Math.max(0, Number(n) || 0);
    if (!add) return 0;
    const st = ensureDaily(data);
    if (!st) return 0;
    // C8：累计统计（成就的历史指标）。埋点只此一处 —— 五个业务调用点全部
    // 已经走 bumpGoal，所以这里顺带累加即可，不需要在各处再插一遍。
    // 注意：与每日目标不同，累计统计**不跨日清零**（它是历史总量）。
    const stats = window.__stats;
    if (stats && typeof stats.bumpFromEvent === 'function') stats.bumpFromEvent(event, add, data);
    let changed = 0;
    GOALS.forEach(g => {
      if (g.event !== event) return;
      const cur = Number(st.progress[g.id]) || 0;
      if (cur >= g.target) return;
      st.progress[g.id] = Math.min(g.target, cur + add);
      changed++;
    });
    return changed;
  }

  /* ── 读取视图 ─────────────────────────────────────────────── */

  function getGoals() {
    const d = gd();
    const st = ensureDaily(d);
    if (!st) return [];
    return GOALS.map(g => {
      const cur = Math.min(g.target, Number(st.progress[g.id]) || 0);
      const claimed = st.claimed.indexOf(g.id) >= 0;
      return {
        id: g.id, name: g.name, desc: g.desc, target: g.target, page: g.page,
        cur, claimed,
        done: cur >= g.target,
        claimable: cur >= g.target && !claimed,
        pct: Math.round((cur / g.target) * 100),
        reward: g.reward
      };
    });
  }

  /** 概览：已完成数 / 总数 / 可领取数 / 活跃度百分比 */
  function summary() {
    const list = getGoals();
    const done = list.filter(g => g.done).length;
    const claimable = list.filter(g => g.claimable).length;
    return {
      done, claimable,
      total: list.length,
      pct: list.length ? Math.round((done / list.length) * 100) : 0
    };
  }

  const hasClaimable = () => getGoals().some(g => g.claimable);

  /* ── 奖励发放 ─────────────────────────────────────────────── */

  function materialName(key) {
    const idle = window.__idle;
    if (idle && typeof idle.materialName === 'function') return idle.materialName(key);
    return key;
  }

  function grant(reward, d) {
    const data = d || gd();
    const out = [];
    if (!data || !reward) return out;
    if (!data.player) data.player = {};
    if (reward.gold) {
      data.player.gold = (Number(data.player.gold) || 0) + reward.gold;
      out.push(`金币 +${reward.gold}`);
    }
    if (reward.gems) {
      data.player.gems = (Number(data.player.gems) || 0) + reward.gems;
      out.push(`钻石 +${reward.gems}`);
    }
    if (reward.materials) {
      if (!data.player.materials) data.player.materials = {};
      Object.keys(reward.materials).forEach(k => {
        const n = Number(reward.materials[k]) || 0;
        data.player.materials[k] = (Number(data.player.materials[k]) || 0) + n;
        out.push(`${materialName(k)} +${n}`);
      });
    }
    return out;
  }

  /** 领取单条；未达成 / 已领取都返回 { ok:false, reason } */
  function claim(id) {
    const d = gd();
    if (!d) return { ok: false, reason: 'nodata' };
    const st = ensureDaily(d);
    const g = defOf(id);
    if (!st || !g) return { ok: false, reason: 'nogoal' };
    if (st.claimed.indexOf(id) >= 0) return { ok: false, reason: 'claimed' };
    const cur = Number(st.progress[id]) || 0;
    if (cur < g.target) return { ok: false, reason: 'unfinished' };
    st.claimed.push(id);
    const given = grant(g.reward, d);
    if (typeof window.saveGameProgress === 'function') window.saveGameProgress();
    return { ok: true, goal: g, given };
  }

  /** 一键领取全部可领；返回成功条数与合并后的奖励文案 */
  function claimAll() {
    const d = gd();
    if (!d) return { ok: false, count: 0, given: [] };
    const list = getGoals().filter(g => g.claimable);
    if (!list.length) return { ok: false, count: 0, given: [], reason: 'none' };
    const given = [];
    list.forEach(g => {
      const r = claim(g.id);
      if (r && r.ok) given.push(...(r.given || []));
    });
    return { ok: true, count: list.length, given };
  }

  /* ── 导出 ─────────────────────────────────────────────────── */

  const api = {
    GOALS, defOf, dayKey, ensureDaily, bump, getGoals, summary,
    hasClaimable, claim, claimAll, grant, materialName
  };

  const segs = 'Game.domain.goals'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__goals = api;

  window.bumpGoal = bump;
  window.ensureDailyGoals = ensureDaily;
})();
