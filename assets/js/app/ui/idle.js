/**
 * idle.js (ui) —— 放置闭环的界面层（C1 挂机面板 / C2 扫荡 / C3 收益可视化与红点）
 *
 * 数值**全部**来自 domain/idle.js（window.__idle），本文件只负责渲染与交互。
 * 旧的 ui/offline.js 退化为转发壳 —— 在线挂机与离线收益共用一套速率，杜绝两份漂移。
 *
 * ⚠️ 依赖：assets/js/app/ui/components.js（Game.ui.components）与
 *    assets/js/app/domain/idle.js，两者都必须在本文件之前加载（见 index.html 脚本顺序）。
 */
(() => {
  'use strict';

  let tickTimer = null;

  const uiComp = () => (window.__uiComponents || (window.Game && window.Game.ui && window.Game.ui.components) || null);
  const idleApi = () => (window.__idle || (window.Game && window.Game.domain && window.Game.domain.idle) || null);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmt(n) {
    return Math.floor(Number(n) || 0).toLocaleString();
  }

  /* ── 渲染：首页挂机面板 ──────────────────────────────────── */

  function rewardLines(rewards, rate) {
    const idle = idleApi();
    const rows = [];
    rows.push(`<div class="ui-result-row"><span>金币</span><span class="ui-result-row__val" data-tone="gold">+${fmt(rewards.gold)}${rate ? `<span class="ui-result-row__sub">${fmt(rate.gold)}/分</span>` : ''}</span></div>`);
    rows.push(`<div class="ui-result-row"><span>经验</span><span class="ui-result-row__val" data-tone="exp">+${fmt(rewards.exp)}</span></div>`);
    const keys = Object.keys((rewards && rewards.materials) || {});
    if (keys.length === 0) {
      const hasMatRate = rate && Object.keys(rate.materials || {}).length > 0;
      rows.push(`<div class="ui-result-row"><span>材料</span><span class="ui-result-row__sub">${hasMatRate ? '挂机满 1 分钟后出产出' : '本关无材料掉落'}</span></div>`);
    } else {
      keys.forEach(k => {
        rows.push(`<div class="ui-result-row"><span>${esc(idle ? idle.materialName(k) : k)}</span><span class="ui-result-row__val" data-tone="mat">+${fmt(rewards.materials[k])}</span></div>`);
      });
    }
    return rows.join('');
  }

  function renderIdlePanel() {
    const idle = idleApi();
    const panel = document.getElementById('idlePanel');
    if (!idle || !panel) return null;
    const p = idle.getPending();
    if (!p) return null;

    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    setText('idleStageName', (p.stage && p.stage.name) || '-');
    setText('idleElapsed', idle.formatDuration(p.cappedMs) + (p.atCap ? '（已封顶）' : ''));
    setText('idleRateHint', p.rate.clearsPerMinute
      ? `效率 ${p.rate.clearsPerMinute} 次通关/分 · 上限 ${p.capHours} 小时`
      : `上限 ${p.capHours} 小时`);

    const lines = document.getElementById('idleRewardLines');
    if (lines) lines.innerHTML = rewardLines(p.rewards, p.rate);

    const btn = document.getElementById('claimOfflineRewards');
    if (btn) {
      const label = btn.querySelector('#claimIdleLabel');
      if (label) label.textContent = p.claimable ? `领取 ${idle.formatDuration(p.cappedMs)} 收益` : '暂无可领取';
      btn.disabled = !p.claimable;
      btn.classList.toggle('ui-btn--ghost', !p.claimable);
      btn.classList.toggle('ui-btn--primary', !!p.claimable);
      btn.classList.toggle('opacity-50', !p.claimable);
    }

    ['idleSweep1', 'idleSweep5', 'idleSweep10'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.disabled = !p.stage;
    });

    updateIdleRedDot(p);
    return p;
  }

  /** 红点（C5）：交给 domain/reddot.js 统一广播。
      以前这里自己 toggle #idleRedDot，和框架的 refreshRedDots 会互相覆盖 —— 只保留转发。 */
  function updateIdleRedDot() {
    if (typeof window.refreshRedDots === 'function') window.refreshRedDots();
  }

  /** 挂机/扫荡都会推进今日目标，改完数据统一刷这三处 */
  function afterIdleChange() {
    if (typeof window.renderDailyGoals === 'function') window.renderDailyGoals();
    if (typeof window.refreshRedDots === 'function') window.refreshRedDots();
  }

  /* ── 领取 ────────────────────────────────────────────────── */

  function claimIdleRewards() {
    const idle = idleApi();
    const ui = uiComp();
    if (!idle) return;
    const res = idle.claimIdle();
    if (!res || !res.ok) {
      if (ui && ui.toast) ui.toast('暂无可领取的挂机收益', 'ghost');
      return;
    }
    // C5：目标推进由 domain/idle.js 的 claimIdle 统一埋点（覆盖全部领取路径）
    const r = res.rewards;
    const matText = Object.keys(r.materials).map(k => `${idle.materialName(k)} +${fmt(r.materials[k])}`).join(' · ');
    if (ui && ui.toast) {
      ui.toast(`挂机 ${idle.formatDuration(res.minutes * 60000)}：金币 +${fmt(r.gold)} 经验 +${fmt(r.exp)}${matText ? ' · ' + matText : ''}`, 'gold', 3200);
    }
    if (typeof window.updateUI === 'function') window.updateUI();
    renderIdlePanel();
    afterIdleChange();
  }

  /* ── 扫荡（C2） ──────────────────────────────────────────── */

  function sweepPreviewHtml(stage, times) {
    const idle = idleApi();
    if (!idle) return '';
    const rw = stage.rewards || {};
    const rows = [];
    rows.push(`<div class="ui-result-row"><span>金币</span><span class="ui-result-row__val" data-tone="gold">≈${fmt((Number(rw.gold) || 0) * times)}</span></div>`);
    rows.push(`<div class="ui-result-row"><span>经验</span><span class="ui-result-row__val" data-tone="exp">≈${fmt((Number(rw.exp) || 0) * times)}</span></div>`);
    const mats = {};
    (rw.items || []).forEach(it => {
      const key = idle.materialKeyOf(it.id);
      if (!key) return;
      const p = typeof it.dropRate === 'number' ? it.dropRate : 1;
      mats[key] = (mats[key] || 0) + (typeof it.quantity === 'number' ? it.quantity : 1) * p * times;
    });
    const keys = Object.keys(mats);
    if (keys.length === 0) rows.push(`<div class="ui-result-row"><span>材料</span><span class="ui-result-row__sub">本关无材料掉落</span></div>`);
    keys.forEach(k => rows.push(`<div class="ui-result-row"><span>${esc(idle.materialName(k))}</span><span class="ui-result-row__val" data-tone="mat">≈${fmt(mats[k])}</span></div>`));
    const others = (rw.items || []).filter(it => !idle.materialKeyOf(it.id));
    if (others.length) {
      rows.push(`<div class="ui-result-row"><span>装备/铭文</span><span class="ui-result-row__sub">按掉落率结算</span></div>`);
    }
    return `<div class="ui-result-block">${rows.join('')}</div>`;
  }

  function openSweepModal(stage, presetTimes) {
    const idle = idleApi();
    const ui = uiComp();
    if (!idle || !ui || !stage) return;
    const times = Math.max(1, Math.min(idle.IDLE_CONFIG.sweepMax, Number(presetTimes) || 1));
    const options = idle.IDLE_CONFIG.sweepOptions || [1, 5, 10];

    const body =
      `<div class="text-xs text-gray-400 mb-2">${esc(stage.name)} · 推荐战力 ${fmt(stage.recommendedPower)}</div>` +
      sweepPreviewHtml(stage, times) +
      `<div class="mt-3 flex gap-2 justify-center">` +
      options.map(n => `<button type="button" class="ui-btn ui-btn--sm ${n === times ? 'ui-btn--primary' : 'ui-btn--ghost'}" data-sweep-n="${n}">x${n}</button>`).join('') +
      `</div>`;

    // ⚠️ openModal 返回的是 close 函数（不是元素）—— 早期版本按元素用，导致切换次数时
    //    旧弹窗关不掉、两个弹窗叠加。这里先清场再开，并用「最后一个 .ui-modal」定位当前弹窗。
    document.querySelectorAll('.ui-modal').forEach(m => m.remove());
    const close = ui.openModal({
      title: `扫荡 x${times}`,
      body,
      actions: [
        { label: '取消', tone: 'ghost' },
        {
          label: `开始扫荡`, tone: 'gold',
          onClick: () => {
            close();
            runSweep(stage, times);
          }
        }
      ]
    });

    const wraps = document.querySelectorAll('.ui-modal');
    const wrap = wraps.length ? wraps[wraps.length - 1] : document;
    wrap.querySelectorAll('[data-sweep-n]').forEach(b => {
      b.addEventListener('click', () => {
        const n = Number(b.getAttribute('data-sweep-n'));
        close();
        openSweepModal(stage, n);
      });
    });
  }

  function runSweep(stage, times) {
    const idle = idleApi();
    const ui = uiComp();
    if (!idle) return;
    const res = idle.sweepStage(stage, times);
    if (!res || !res.ok) {
      if (ui && ui.toast) ui.toast('扫荡失败', 'danger');
      return;
    }
    // C5：扫荡次数由 domain/idle.js 的 sweepStage 统一埋点
    const r = res.rewards;
    const matKeys = Object.keys(r.materials || {});
    const drops = (r.items || []).map(it =>
      `<div class="ui-result-drop">${it.iconUrl ? `<img class="ui-result-drop__img" src="${esc(it.iconUrl)}" alt="">` : '<i class="fa fa-cube"></i>'}` +
      `<span class="ui-result-drop__name">${esc(it.name)}</span>${ui.tag ? ui.tag(it.rarity, String(it.rarity || '').toLowerCase()) : ''}` +
      `<span class="ui-result-drop__qty">x${fmt(it.qty)}</span></div>`
    ).join('');

    const body =
      `<div class="text-xs text-gray-400 mb-2">${esc(stage.name)} · 扫荡 ${res.times} 次</div>` +
      `<div class="ui-result-block">` +
      `<div class="ui-result-row"><span>金币</span><span class="ui-result-row__val" data-tone="gold">+${fmt(r.gold)}</span></div>` +
      `<div class="ui-result-row"><span>经验</span><span class="ui-result-row__val" data-tone="exp">+${fmt(r.exp)}</span></div>` +
      matKeys.map(k => `<div class="ui-result-row"><span>${esc(idle.materialName(k))}</span><span class="ui-result-row__val" data-tone="mat">+${fmt(r.materials[k])}</span></div>`).join('') +
      `</div>` +
      (drops ? `<div class="mt-3">${drops}</div>` : `<div class="mt-3 text-xs text-gray-400">本次未掉落装备/铭文</div>`);

    // 确认弹窗的 close() 会延迟 ~320ms 移除 DOM，等它退场再开结果弹窗，避免两层叠加
    const showResult = () => {
      if (ui && ui.openModal) ui.openModal({ title: '扫荡完成', body, actions: [{ label: '好的', tone: 'primary' }] });
    };
    setTimeout(showResult, 340);
    if (typeof window.updateUI === 'function') window.updateUI();
    renderIdlePanel();
    afterIdleChange();
  }

  /* ── 定时器 ──────────────────────────────────────────────── */

  function startIdleTick() {
    const idle = idleApi();
    if (!idle || tickTimer) return;
    tickTimer = window.setInterval(() => {
      renderIdlePanel();
    }, idle.IDLE_CONFIG.tickMs);
  }

  function initIdle() {
    const idle = idleApi();
    if (!idle) return;
    idle.ensureIdleState(typeof gameData !== 'undefined' ? gameData : undefined);
    idle.syncIdleStage();
    renderIdlePanel();
    startIdleTick();

    const bind = (id, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', handler);
    };
    bind('idleSweep1', () => openSweepModal(idle.idleStage(), 1));
    bind('idleSweep5', () => openSweepModal(idle.idleStage(), 5));
    bind('idleSweep10', () => openSweepModal(idle.idleStage(), 10));
  }

  const api = {
    renderIdlePanel,
    claimIdleRewards,
    openSweepModal,
    runSweep,
    updateIdleRedDot,
    startIdleTick,
    initIdle
  };
  const segs = 'Game.ui.idle'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__idleUI = api;

  window.renderIdlePanel = renderIdlePanel;
  window.initIdle = initIdle;
  window.openSweepModal = openSweepModal;
})();
