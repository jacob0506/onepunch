/* ════════════════════════════════════════════════════════════════
   幻卡传说 · 今日目标界面层（Stage 1 · C5）
   ────────────────────────────────────────────────────────────────
   首页右侧「今日目标」面板。数值与进度全在 domain/goals.js（单源），
   本文件只渲染 + 转发点击。

   取代了 2026-09-13 之前的写死假任务（两个「去完成」按钮只会
   switchPage，既没进度也没领取 —— C5 根治）。

   ⚠️ 跨日：面板每 60s 自查一次日期，变了自动重渲（新一天的进度）。
   ════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const CHECK_MS = 60000;
  let timer = null;

  const uiComp = () => (window.__uiComponents || (window.Game && window.Game.ui && window.Game.ui.components) || null);
  const goalsApi = () => (window.__goals || (window.Game && window.Game.domain && window.Game.domain.goals) || null);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmt(n) { return Math.floor(Number(n) || 0).toLocaleString(); }

  function rewardHtml(rw) {
    const api = goalsApi();
    const parts = [];
    if (!rw) return '';
    if (rw.gold) parts.push(`<i class="fa fa-money text-yellow-500"></i>${fmt(rw.gold)}`);
    if (rw.gems) parts.push(`<i class="fa fa-diamond text-yellow-400"></i>${fmt(rw.gems)}`);
    if (rw.materials) {
      Object.keys(rw.materials).forEach(k => {
        const name = (api && api.materialName) ? api.materialName(k) : k;
        parts.push(`<i class="fa fa-cube text-primary"></i>${esc(name)} ${fmt(rw.materials[k])}`);
      });
    }
    return parts.join('<span class="ui-goal__sep">·</span>');
  }

  function actionHtml(g) {
    if (g.claimed) {
      return `<button type="button" class="ui-btn ui-btn--sm ui-btn--ghost ui-goal__btn" disabled>已领取</button>`;
    }
    if (g.claimable) {
      return `<button type="button" class="ui-btn ui-btn--sm ui-btn--gold ui-goal__btn" data-goal="${esc(g.id)}" data-act="claim">领取</button>`;
    }
    if (g.page) {
      return `<button type="button" class="ui-btn ui-btn--sm ui-btn--primary ui-goal__btn" data-goal="${esc(g.id)}" data-act="go">去完成</button>`;
    }
    return `<button type="button" class="ui-btn ui-btn--sm ui-btn--ghost ui-goal__btn" disabled>进行中</button>`;
  }

  function goalRowHtml(g) {
    const C = uiComp();
    const bar = C && C.progress
      ? C.progress(g.pct, g.claimed ? 'muted' : (g.done ? 'success' : 'accent'), !g.done && !g.claimed)
      : '';
    return `<div class="ui-goal${g.claimed ? ' ui-goal--done' : ''}${g.claimable ? ' ui-goal--ready' : ''}">` +
      `<div class="ui-goal__head">` +
        `<span class="ui-goal__name">${esc(g.name)}${g.claimed ? '<i class="fa fa-check ui-goal__check"></i>' : ''}</span>` +
        `<span class="ui-goal__count">${fmt(g.cur)}/${fmt(g.target)}</span>` +
      `</div>` +
      `<div class="ui-goal__bar">${bar}</div>` +
      `<div class="ui-goal__foot">` +
        `<span class="ui-goal__reward">${rewardHtml(g.reward)}</span>` +
        actionHtml(g) +
      `</div>` +
      `</div>`;
  }

  function renderDailyGoals() {
    const api = goalsApi();
    const panel = document.getElementById('dailyGoalList');
    if (!api || !panel) return null;
    api.ensureDaily();
    const list = api.getGoals();
    const sum = api.summary();

    panel.innerHTML = list.map(goalRowHtml).join('');

    const countEl = document.getElementById('dailyGoalsCount');
    if (countEl) countEl.textContent = `${sum.done}/${sum.total}`;

    const barEl = document.getElementById('dailyGoalsBar');
    if (barEl) {
      const C = uiComp();
      barEl.innerHTML = (C && C.progress) ? C.progress(sum.pct, 'accent', sum.pct < 100) : '';
    }

    const btn = document.getElementById('dailyClaimAllBtn');
    if (btn) {
      btn.disabled = sum.claimable === 0;
      btn.classList.toggle('ui-btn--gold', sum.claimable > 0);
      btn.classList.toggle('ui-btn--ghost', sum.claimable === 0);
      btn.classList.toggle('opacity-50', sum.claimable === 0);
      btn.textContent = sum.claimable > 0 ? `一键领取 (${sum.claimable})` : '暂无可领取';
    }
    return sum;
  }

  /* ── 交互 ─────────────────────────────────────────────────── */

  function onGoalClick(e) {
    const btn = e.target && e.target.closest ? e.target.closest('[data-goal]') : null;
    if (!btn || btn.disabled) return;
    const api = goalsApi();
    const C = uiComp();
    if (!api) return;
    const id = btn.getAttribute('data-goal');
    const act = btn.getAttribute('data-act');

    if (act === 'go') {
      const g = api.getGoals().filter(x => x.id === id)[0];
      if (g && g.page && typeof window.switchPage === 'function') window.switchPage(g.page);
      return;
    }
    if (act === 'claim') {
      const r = api.claim(id);
      if (!r || !r.ok) {
        if (C && C.toast) C.toast(r && r.reason === 'claimed' ? '已经领过啦' : '还没完成，先去完成吧', 'ghost');
        return;
      }
      if (C && C.toast) C.toast(`${r.goal.name}：${(r.given || []).join(' · ')}`, 'gold', 2600);
      afterChange();
    }
  }

  function claimAllGoals() {
    const api = goalsApi();
    const C = uiComp();
    if (!api) return;
    const r = api.claimAll();
    if (!r || !r.ok) {
      if (C && C.toast) C.toast('暂无可领取的目标奖励', 'ghost');
      return;
    }
    if (C && C.toast) C.toast(`领取 ${r.count} 项目标奖励：${(r.given || []).join(' · ')}`, 'gold', 3200);
    afterChange();
  }

  function afterChange() {
    if (typeof window.updateUI === 'function') window.updateUI();
    renderDailyGoals();
    if (typeof window.refreshRedDots === 'function') window.refreshRedDots();
  }

  function initDailyGoals() {
    const api = goalsApi();
    if (!api) return;
    api.ensureDaily();
    renderDailyGoals();

    const panel = document.getElementById('dailyGoalList');
    if (panel) panel.addEventListener('click', onGoalClick);
    const btn = document.getElementById('dailyClaimAllBtn');
    if (btn) btn.addEventListener('click', claimAllGoals);

    if (timer) return;
    let lastDay = api.dayKey();
    timer = window.setInterval(() => {
      const today = api.dayKey();
      if (today !== lastDay) { lastDay = today; api.ensureDaily(); }
      renderDailyGoals();
    }, CHECK_MS);
  }

  const api = { renderDailyGoals, claimAllGoals, initDailyGoals };
  const segs = 'Game.ui.goals'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__goalsUI = api;

  window.renderDailyGoals = renderDailyGoals;
  window.initDailyGoals = initDailyGoals;
})();
