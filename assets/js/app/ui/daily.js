/* ════════════════════════════════════════════════════════════════
   幻卡传说 · 日常副本界面层（Stage 1 · C7）
   ────────────────────────────────────────────────────────────────
   战斗页的第三种模式（主线 / 无尽塔 / 日常）。数值、次数、奖励全在
   domain/daily.js（单源），本文件只渲染 + 转发点击。

   交互口径：每张副本卡自带难度切换（默认选中"你打得过的最高档"），
   选完直接 [挑战] 或 [扫荡] —— 不做多余的二次确认（扫荡除外，它有次数代价）。
   ════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  /** 每个副本选中的难度档（界面态，不进存档） */
  const pickedTier = {};

  const uiComp = () => (window.__uiComponents || (window.Game && window.Game.ui && window.Game.ui.components) || null);
  const dailyApi = () => (window.__daily || (window.Game && window.Game.domain && window.Game.domain.daily) || null);
  const idleApi = () => (window.__idle || (window.Game && window.Game.domain && window.Game.domain.idle) || null);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmt(n) { return Math.floor(Number(n) || 0).toLocaleString(); }

  function totalPower() {
    return (typeof window.calculateTotalPower === 'function') ? window.calculateTotalPower() : 0;
  }

  function enterBattle(stageId) {
    const entry = window.__battleEntry;
    if (entry && typeof entry.enterBattle === 'function') return entry.enterBattle(stageId);
    if (typeof window.openBattleSceneDebug === 'function') return window.openBattleSceneDebug(stageId);
    if (typeof window.startBattle === 'function') return window.startBattle(stageId);
    return false;
  }

  /* ── 渲染 ─────────────────────────────────────────────────── */

  /** 奖励预览（材料 / 装备 / 铭文 —— 与实战掉落同源，都是 rewardsFor 的结果） */
  function rewardPreview(rw, times) {
    const api = dailyApi();
    const idle = idleApi();
    const n = Math.max(1, Number(times) || 1);
    const parts = [];
    if (rw.gold) parts.push(`<span class="ui-daily__rw" data-tone="gold"><i class="fa fa-money"></i>${fmt(rw.gold * n)}</span>`);
    if (rw.exp) parts.push(`<span class="ui-daily__rw" data-tone="exp"><i class="fa fa-star"></i>${fmt(rw.exp * n)}</span>`);

    const mats = {};
    const others = [];
    (rw.items || []).forEach(it => {
      const key = (idle && typeof idle.materialKeyOf === 'function') ? idle.materialKeyOf(it.id) : null;
      if (key) {
        const p = typeof it.dropRate === 'number' ? it.dropRate : 1;
        mats[key] = (mats[key] || 0) + (Number(it.quantity) || 1) * p;
      } else {
        others.push(it);
      }
    });
    Object.keys(mats).forEach(k => {
      const name = (api && api.materialName) ? api.materialName(k) : k;
      parts.push(`<span class="ui-daily__rw" data-tone="mat"><i class="fa fa-cube"></i>${esc(name)} ${fmt(mats[k] * n)}</span>`);
    });
    if (others.length) {
      const pct = Math.round((others.reduce((a, b) => a + (Number(b.dropRate) || 0), 0)) * 100 / Math.max(1, others.length));
      parts.push(`<span class="ui-daily__rw" data-tone="loot"><i class="fa fa-gift"></i>装备/铭文 ${others.length} 种 · 均${pct}%</span>`);
    }
    return parts.join('');
  }

  function tierBtnHtml(dg, tr, active) {
    const enough = tr.recommendedPower <= totalPower();
    return `<button type="button" class="ui-daily__tier${active ? ' is-active' : ''}" data-daily-tier="${esc(tr.key)}" data-daily-key="${esc(dg.key)}">` +
      `<span class="ui-daily__tier-name">${esc(tr.name)}</span>` +
      `<span class="ui-daily__tier-pow${enough ? '' : ' is-low'}">${fmt(tr.recommendedPower)}</span>` +
      `</button>`;
  }

  function dungeonCardHtml(dg) {
    const max = dg.max;
    const empty = dg.left <= 0;
    const activeKey = pickedTier[dg.key] || defaultTier(dg);
    const active = dg.tiers.filter(t => t.key === activeKey)[0] || dg.tiers[0];
    const enough = active ? active.recommendedPower <= totalPower() : false;

    return `<div class="ui-daily" data-key="${esc(dg.key)}">` +
      `<div class="ui-daily__head">` +
        `<span class="ui-daily__icon" data-tone="${esc(dg.tone)}"><i class="fa ${esc(dg.icon)}"></i></span>` +
        `<span class="ui-daily__name">${esc(dg.name)}</span>` +
        `<span class="ui-daily__left${empty ? ' is-empty' : ''}">${dg.left}/${max}</span>` +
      `</div>` +
      `<div class="ui-daily__desc">${esc(dg.desc)}</div>` +
      `<div class="ui-daily__tiers">${dg.tiers.map(tr => tierBtnHtml(dg, tr, tr.key === activeKey)).join('')}</div>` +
      (active
        ? `<div class="ui-daily__body">` +
            `<div class="ui-daily__pow">推荐战力 <b class="${enough ? 'is-ok' : 'is-low'}">${fmt(active.recommendedPower)}</b>` +
            `<span class="ui-daily__mine">我方 ${fmt(totalPower())}</span></div>` +
            `<div class="ui-daily__rewards">${rewardPreview(active.rewards, 1)}</div>` +
          `</div>`
        : '') +
      `<div class="ui-daily__acts">` +
        `<button type="button" class="ui-btn ui-btn--primary ui-btn--sm" data-daily-act="fight" data-daily-key="${esc(dg.key)}"${empty ? ' disabled' : ''}>挑战</button>` +
        `<button type="button" class="ui-btn ui-btn--gold ui-btn--sm" data-daily-act="sweep" data-daily-key="${esc(dg.key)}"${empty ? ' disabled' : ''}>扫荡 x${Math.max(1, dg.left)}</button>` +
      `</div>` +
      (empty ? `<div class="ui-daily__tip">今日次数已用完，明日 0 点重置</div>` : '') +
      `</div>`;
  }

  /** 默认选中"打得过的最高档"，都打不过就选初级（让玩家一眼看到自己够不够） */
  function defaultTier(dg) {
    let best = null;
    dg.tiers.forEach(t => { if (t.enough) best = t.key; });
    return best || (dg.tiers[0] && dg.tiers[0].key);
  }

  function renderDailyPanel(container) {
    const api = dailyApi();
    if (!api || !container) return;
    api.ensureDailyStages();
    const list = api.getDungeons();

    const head = document.createElement('div');
    head.className = 'ui-daily__top';
    // 剩余次数已由模式栏显示（避免同一数字出现两次），这里只留一句规则说明
    head.innerHTML = `<i class="fa fa-clock-o"></i>每日 0 点重置次数 · 副本强度跟随主线进度`;
    container.appendChild(head);

    const wrap = document.createElement('div');
    wrap.className = 'space-y-3';
    wrap.innerHTML = list.map(dungeonCardHtml).join('');
    container.appendChild(wrap);

    bind(wrap);
  }

  function rerender() {
    if (typeof window.updateStagesList === 'function') window.updateStagesList();
  }

  /* ── 交互 ─────────────────────────────────────────────────── */

  function bind(root) {
    root.addEventListener('click', (e) => {
      const tierBtn = e.target.closest ? e.target.closest('[data-daily-tier]') : null;
      if (tierBtn) {
        pickedTier[tierBtn.getAttribute('data-daily-key')] = tierBtn.getAttribute('data-daily-tier');
        rerender();
        return;
      }
      const actBtn = e.target.closest ? e.target.closest('[data-daily-act]') : null;
      if (!actBtn || actBtn.disabled) return;
      const key = actBtn.getAttribute('data-daily-key');
      const act = actBtn.getAttribute('data-daily-act');
      const api = dailyApi();
      if (!api) return;
      const dg = currentDungeon(api, key);
      if (!dg) return;
      const tier = pickedTier[key] || defaultTier(dg);
      if (act === 'fight') return startFight(key, tier);
      if (act === 'sweep') return openDailySweep(key, tier);
    });
  }

  function currentDungeon(api, key) {
    const list = api.getDungeons();
    return list.filter(x => x.key === key)[0] || null;
  }

  function startFight(dungeonKey, tierKey) {
    const api = dailyApi();
    const ui = uiComp();
    if (!api) return;
    if (api.runsLeft(dungeonKey) <= 0) {
      if (ui && ui.toast) ui.toast('今日次数已用完', 'ghost');
      return;
    }
    const stage = api.findDailyStage(dungeonKey, tierKey) || api.buildStage(dungeonKey, tierKey);
    if (!stage) return;
    // 次数在**胜利结算时**才扣（battle/fallback_hud.js 的 isDailyStage 分支），
    // 这里只做前置拦截，避免"打不过还亏次数"。
    enterBattle(stage.id);
  }

  /* ── 扫荡 ─────────────────────────────────────────────────── */

  function openDailySweep(dungeonKey, tierKey) {
    const api = dailyApi();
    const idle = idleApi();
    const ui = uiComp();
    if (!api || !ui || !idle) return;
    const left = api.runsLeft(dungeonKey);
    if (left <= 0) { if (ui.toast) ui.toast('今日次数已用完', 'ghost'); return; }
    const stage = api.findDailyStage(dungeonKey, tierKey) || api.buildStage(dungeonKey, tierKey);
    if (!stage) return;

    const times = left;
    const body =
      `<div class="text-xs text-gray-400 mb-2">${esc(stage.name)} · 推荐战力 ${fmt(stage.recommendedPower)}</div>` +
      `<div class="ui-result-block">` +
        `<div class="ui-result-row"><span>金币</span><span class="ui-result-row__val" data-tone="gold">+${fmt((stage.rewards.gold || 0) * times)}</span></div>` +
        `<div class="ui-result-row"><span>经验</span><span class="ui-result-row__val" data-tone="exp">+${fmt((stage.rewards.exp || 0) * times)}</span></div>` +
        materialRows(stage, times) +
      `</div>` +
      `<div class="mt-3 text-xs text-gray-400">将消耗 <b class="text-white">${times}</b> 次（今日剩余 ${left} 次）</div>`;

    document.querySelectorAll('.ui-modal').forEach(m => m.remove());
    const close = ui.openModal({
      title: `扫荡 x${times}`,
      body,
      actions: [
        { label: '取消', tone: 'ghost' },
        { label: '开始扫荡', tone: 'gold', onClick: () => { close(); doSweep(dungeonKey, tierKey, times); } }
      ]
    });
  }

  function materialRows(stage, times) {
    const idle = idleApi();
    const api = dailyApi();
    const mats = {};
    ((stage.rewards && stage.rewards.items) || []).forEach(it => {
      const key = (idle && typeof idle.materialKeyOf === 'function') ? idle.materialKeyOf(it.id) : null;
      if (!key) return;
      const p = typeof it.dropRate === 'number' ? it.dropRate : 1;
      mats[key] = (mats[key] || 0) + (Number(it.quantity) || 1) * p;
    });
    return Object.keys(mats).map(k =>
      `<div class="ui-result-row"><span>${esc((api && api.materialName) ? api.materialName(k) : k)}</span>` +
      `<span class="ui-result-row__val" data-tone="mat">+${fmt(mats[k] * times)}</span></div>`
    ).join('');
  }

  function doSweep(dungeonKey, tierKey, times) {
    const api = dailyApi();
    const idle = idleApi();
    const ui = uiComp();
    const res = api.sweep(dungeonKey, tierKey, times);
    if (!res || !res.ok) {
      if (ui && ui.toast) ui.toast(res && res.reason === 'noruns' ? '今日次数已用完' : '扫荡失败', 'ghost');
      return;
    }
    const r = res.rewards || { gold: 0, exp: 0, materials: {}, items: [] };
    const matKeys = Object.keys(r.materials || {});
    const drops = (r.items || []).map(it =>
      `<div class="ui-result-drop">${it.iconUrl ? `<img class="ui-result-drop__img" src="${esc(it.iconUrl)}" alt="">` : '<i class="fa fa-cube ui-result-drop__img" style="display:flex;align-items:center;justify-content:center;color:var(--c-text-dim)"></i>'}` +
      `<span class="ui-result-drop__name">${esc(it.name)}</span>${ui.tag ? ui.tag(it.rarity, String(it.rarity || '').toLowerCase()) : ''}` +
      `<span class="ui-result-row__val">x${fmt(it.qty)}</span></div>`
    ).join('');

    const body =
      `<div class="text-xs text-gray-400 mb-2">${esc(res.stage.name)} · 扫荡 ${res.times} 次</div>` +
      `<div class="ui-result-block">` +
        `<div class="ui-result-row"><span>金币</span><span class="ui-result-row__val" data-tone="gold">+${fmt(r.gold)}</span></div>` +
        `<div class="ui-result-row"><span>经验</span><span class="ui-result-row__val" data-tone="exp">+${fmt(r.exp)}</span></div>` +
        matKeys.map(k => `<div class="ui-result-row"><span>${esc(api.materialName(k))}</span><span class="ui-result-row__val" data-tone="mat">+${fmt(r.materials[k])}</span></div>`).join('') +
      `</div>` +
      (drops ? `<div class="mt-3">${drops}</div>` : `<div class="mt-3 text-xs text-gray-400">本次未掉落装备/铭文</div>`) +
      `<div class="mt-3 text-xs text-gray-400">今日剩余 ${res.left} 次</div>`;

    setTimeout(() => {
      if (ui && ui.openModal) ui.openModal({ title: '扫荡完成', body, actions: [{ label: '好的', tone: 'primary' }] });
    }, 340);

    if (typeof window.updateUI === 'function') window.updateUI();
    rerender();
  }

  /* ── 导出 ─────────────────────────────────────────────────── */

  const api = { renderDailyPanel, startFight, openDailySweep, doSweep, pickedTier };
  const segs = 'Game.ui.daily'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__dailyUI = api;

  window.renderDailyPanel = renderDailyPanel;
})();
