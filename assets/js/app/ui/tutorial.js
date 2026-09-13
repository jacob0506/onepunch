/* ════════════════════════════════════════════════════════════════
   幻卡传说 · 新手引导界面层（Stage 1 · C11）
   ────────────────────────────────────────────────────────────────
   底部悬浮引导条 + 目标元素高亮。状态与判定全在 domain/tutorial.js（单源），
   本文件只渲染 + 转发点击，不存任何进度。

   ⚠️ 三条硬约束：
     1. **不锁 UI**：引导条只是"指路牌"，玩家随时可以无视它去点任何东西。
     2. **战斗中隐藏**：战报浮层在最上层，引导条压上去会挡操作。
     3. 高亮只加 class、不改元素结构 —— 元素被重渲会丢失，靠下一轮 tick 补。
   ════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const TICK_MS = 2500;
  let timer = null;
  let hlTries = 0;
  let hlTimer = null;
  let barEl = null;
  let finishShown = false;

  const tut = () => (window.__tutorial || (window.Game && window.Game.domain && window.Game.domain.tutorial) || null);
  const uiC = () => (window.__uiComponents || (window.Game && window.Game.ui && window.Game.ui.components) || null);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /* ── 高亮 ─────────────────────────────────────────────────── */

  function clearHighlight() {
    document.querySelectorAll('.ui-tut-hl').forEach(el => el.classList.remove('ui-tut-hl'));
  }

  function tryHighlight(anchor) {
    if (hlTimer) { clearInterval(hlTimer); hlTimer = null; }
    if (!anchor) return;
    hlTries = 0;
    hlTimer = window.setInterval(() => {
      hlTries += 1;
      const el = document.querySelector(anchor);
      if (el) {
        clearHighlight();
        el.classList.add('ui-tut-hl');
        if (el.scrollIntoView) { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* 老浏览器 */ } }
        clearInterval(hlTimer); hlTimer = null;
        return;
      }
      if (hlTries >= 8) { clearInterval(hlTimer); hlTimer = null; }
    }, 250);
  }

  /* ── 渲染 ─────────────────────────────────────────────────── */

  function currentPage() {
    const p = document.querySelector('.page:not(.hidden)');
    return p ? p.id : '';
  }

  function inBattle() {
    const bs = document.getElementById('battleSceneDebug');
    return !!(bs && bs.offsetParent !== null);
  }

  function ensureBar() {
    if (barEl && barEl.isConnected) return barEl;
    barEl = document.createElement('div');
    barEl.id = 'tutorialBar';
    barEl.className = 'ui-tut';
    document.body.appendChild(barEl);
    barEl.addEventListener('click', onClick);
    return barEl;
  }

  function render() {
    const api = tut();
    const bar = ensureBar();
    if (!api) { bar.classList.add('hidden'); return null; }
    const s = api.state();

    if (!s.active || s.finished || s.skipped) {
      bar.classList.add('hidden');
      clearHighlight();
      return s;
    }
    if (inBattle()) { bar.classList.add('hidden'); return s; }

    const cur = s.current;
    if (!cur) { bar.classList.add('hidden'); return s; }

    const C = uiC();
    const isWelcome = cur.metric === 'manual';
    const goLabel = isWelcome ? '开始冒险' : (cur.page && cur.page !== currentPage() ? '前往' : '告诉我点哪');

    bar.classList.remove('hidden');
    bar.innerHTML =
      '<div class="ui-tut__head">' +
        '<span class="ui-tut__step"><i class="fa fa-compass"></i> 新手引导 ' + s.done + '/' + s.total + '</span>' +
        '<button type="button" class="ui-tut__skip" data-tut="skip">跳过引导</button>' +
      '</div>' +
      '<div class="ui-tut__title">' + esc(cur.title) + '</div>' +
      '<div class="ui-tut__text">' + esc(cur.text) + '</div>' +
      '<div class="ui-tut__foot">' +
        '<div class="ui-tut__bar">' + ((C && C.progress) ? C.progress(s.pct, 'accent', true) : '') + '</div>' +
        '<button type="button" class="ui-btn ui-btn--sm ui-btn--primary ui-tut__go" data-tut="go">' + esc(goLabel) + '</button>' +
      '</div>';

    tryHighlight(cur.anchor);
    return s;
  }

  /* ── 交互 ─────────────────────────────────────────────────── */

  function onClick(e) {
    const btn = e.target && e.target.closest ? e.target.closest('[data-tut]') : null;
    if (!btn) return;
    const act = btn.getAttribute('data-tut');
    const api = tut();
    if (!api) return;

    if (act === 'skip') {
      const C = uiC();
      if (C && C.confirmModal) {
        C.confirmModal({
          title: '跳过新手引导？',
          body: '<div class="ui-tut__text">跳过后就不再显示引导条了（出师奖励也不会补发）。之后仍可在图鉴页「重看新手引导」重开。</div>',
          okText: '跳过',
          okTone: 'ghost',
          onOk: () => { api.skip(); afterChange(); }
        });
      } else {
        api.skip(); afterChange();
      }
      return;
    }

    if (act === 'go') {
      const cur = api.current();
      if (!cur) return;
      if (cur.metric === 'manual') { api.complete(cur.id); afterChange(); return; }
      if (cur.page && cur.page !== currentPage() && typeof window.switchPage === 'function') window.switchPage(cur.page);
      tryHighlight(cur.anchor);
    }
  }

  function afterChange() {
    if (typeof window.updateUI === 'function') window.updateUI();
    if (typeof window.saveGameProgress === 'function') window.saveGameProgress();
    render();
  }

  /* ── 出师弹窗 ─────────────────────────────────────────────── */

  function showFinish() {
    const api = tut();
    const C = uiC();
    if (!api || !C || !C.openModal) return;
    const info = api.finishInfo();
    const rw = info.reward || {};
    const rwText = []
      .concat(rw.gems ? ['<i class="fa fa-diamond text-yellow-400"></i>' + rw.gems + ' 钻石'] : [])
      .concat(rw.gold ? ['<i class="fa fa-money text-yellow-500"></i>' + rw.gold + ' 金币'] : [])
      .join(' · ');
    C.openModal({
      title: info.title || '出师',
      body: '<div class="ui-tut__finish">' +
        '<div class="ui-tut__text">' + esc(info.text || '') + '</div>' +
        (rwText ? '<div class="ui-tut__reward">出师奖励：' + rwText + '</div>' : '') +
        '</div>',
      actions: [{
        label: '领取奖励',
        tone: 'gold',
        onClick: (close) => {
          const r = api.claimFinish();
          close();
          if (C.toast) {
            if (r && r.ok) C.toast('出师奖励：' + (r.given || []).join(' · '), 'gold', 3200);
            else C.toast(r && r.reason === 'claimed' ? '已经领过啦' : '暂时无法领取', 'ghost');
          }
          afterChange();
        }
      }]
    });
  }

  /* ── 轮询：把"玩家自己做到了"的步骤收进来 ─────────────────── */

  function tick() {
    const api = tut();
    if (!api) return;
    if (inBattle()) { if (barEl) barEl.classList.add('hidden'); return; }
    const s0 = api.state();
    if (s0.finished || s0.skipped) {
      if (s0.finished && !s0.claimed && !finishShown) { finishShown = true; showFinish(); }
      render();
      return;
    }
    const fresh = api.sync();
    if (fresh && fresh.length) {
      const C = uiC();
      if (C && C.toast) C.toast('✓ ' + fresh[fresh.length - 1].title.replace(/^第.步 · /, '') + ' 完成', 'gold', 2200);
      if (typeof window.saveGameProgress === 'function') window.saveGameProgress();
    }
    render();
  }

  function initTutorial() {
    const api = tut();
    if (!api) return;
    api.ensure();
    render();
    if (timer) return;
    timer = window.setInterval(tick, TICK_MS);
  }

  /** 图鉴页「重看新手引导」：清状态从头来（已领过的出师奖不重复发） */
  function replayTutorial() {
    const api = tut();
    const C = uiC();
    if (!api) return;
    api.restart();
    finishShown = false;
    afterChange();
    if (C && C.toast) C.toast('新手引导已重新开始', 'ghost');
    if (typeof window.switchPage === 'function') window.switchPage('home');
  }

  const api = { initTutorial, renderTutorial: render, replayTutorial };
  const segs = 'Game.ui.tutorial'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__tutorialUI = api;
  window.initTutorial = initTutorial;
  window.replayTutorial = replayTutorial;
})();
