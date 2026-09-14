/**
 * dispatch.js (ui) —— E7 派驻探险的界面层
 *
 * 数值**全部**来自 domain/dispatch.js（window.__dispatch），本文件只负责渲染与交互。
 * 面板挂在主页挂机面板下方（#dispatchPanel → #dispatchBody），与"放置深度化"同框。
 *
 * ⚠️ 依赖：ui/components.js（Game.ui.components）与 domain/dispatch.js，均须先于本文件加载。
 */
(() => {
  'use strict';

  const uiComp = () => (window.__uiComponents || (window.Game && window.Game.ui && window.Game.ui.components) || null);
  const dp = () => (window.__dispatch || (window.Game && window.Game.domain && window.Game.domain.dispatch) || null);
  const idleApi = () => (window.__idle || (window.Game && window.Game.domain && window.Game.domain.idle) || null);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmt(n) { return Math.floor(Number(n) || 0).toLocaleString(); }
  function fmtDur(ms) {
    const idle = idleApi();
    if (idle && typeof idle.formatDuration === 'function') return idle.formatDuration(Math.max(0, ms));
    const m = Math.max(0, Math.ceil(ms / 60000));
    return m >= 60 ? `${Math.floor(m / 60)} 时 ${m % 60} 分` : `${m} 分钟`;
  }
  function matName(k) {
    const idle = idleApi();
    return (idle && typeof idle.materialName === 'function') ? idle.materialName(k) : k;
  }
  function rewardInline(rw) {
    const parts = [];
    if (!rw) return '';
    ['gold', 'exp', 'gems'].forEach(k => {
      if (rw[k]) parts.push(`<span class="ui-result-row__val" data-tone="${k === 'gold' ? 'gold' : k === 'exp' ? 'exp' : 'gem'}">${k === 'gold' ? '金币' : k === 'exp' ? '经验' : '钻石'} ${fmt(rw[k])}</span>`);
    });
    Object.keys(rw.materials || {}).forEach(k => {
      parts.push(`<span class="ui-result-row__val" data-tone="mat">${esc(matName(k))} ${fmt(rw.materials[k])}</span>`);
    });
    return parts.join('');
  }

  /* ── 主面板：3 个派驻槽 ──────────────────────────────────── */
  function renderDispatchPanel() {
    const d = dp();
    const body = document.getElementById('dispatchBody');
    if (!d || !body) return;
    const s = d.summary();
    const cards = s.slots.map((slot) => {
      if (slot.state === 'empty') {
        return `<div class="bg-gray-800 bg-opacity-50 rounded-lg p-3 flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-500"><i class="fa fa-map-signs"></i></div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-bold text-gray-400">空置的派驻槽</div>
            <div class="text-[10px] text-gray-500">派出一支小队，收益比干等挂机更肥</div>
          </div>
          <button class="ui-btn ui-btn--sm ui-btn--ghost" data-dp-start="${slot.index}">派驻</button>
        </div>`;
      }
      const ratioTxt = slot.power >= slot.recPower
        ? `<span class="text-green-400">战力达标</span>`
        : `<span class="text-yellow-400">战力不足</span>`;
      const charsHtml = slot.chars.map(id => {
        const c = (typeof charactersData !== 'undefined' ? charactersData : []).find(x => x && x.id === id)
          || (typeof gameData !== 'undefined' ? (gameData.characters || []).find(x => x && x.id === id) : null);
        return c ? `<img src="${esc(c.imageUrl || '')}" class="w-7 h-7 rounded-full object-cover border border-gray-600" alt="">` : '';
      }).join('');
      const stateBadge = slot.state === 'event'
        ? `<span class="ui-tag" data-tone="epic">事件待处理</span>`
        : (slot.state === 'ready' ? `<span class="ui-tag" data-tone="legend">已抵达</span>` : ratioTxt);
      const action = slot.state === 'event'
        ? `<button class="ui-btn ui-btn--sm ui-btn--gold" data-dp-event="${slot.index}">处理事件</button>`
        : (slot.state === 'ready'
          ? `<button class="ui-btn ui-btn--sm ui-btn--primary" data-dp-claim="${slot.index}">领取回报</button>`
          : `<button class="ui-btn ui-btn--sm ui-btn--ghost" data-dp-cancel="${slot.index}">召回</button>`);
      return `<div class="bg-gray-800 bg-opacity-50 rounded-lg p-3" data-dp-slot="${slot.index}">
        <div class="flex items-center gap-3 mb-2">
          <div class="min-w-0">
            <div class="text-sm font-bold truncate">${esc(slot.placeName)} <span class="text-[10px] text-gray-400 font-normal">${slot.hours}h</span></div>
            <div class="text-[10px] text-gray-400">${stateBadge} · 队伍战力 ${fmt(slot.power)} / 推荐 ${fmt(slot.recPower)} · 收益 +${Math.round((slot.bonus - 1) * 100)}%</div>
          </div>
          <div class="ml-auto flex items-center gap-2 shrink-0">${charsHtml}${action}</div>
        </div>
        ${slot.state === 'running' ? `
        <div class="ui-progress"><div class="ui-progress__fill" data-dp-bar="${slot.index}" style="width:${slot.readyPct}%"></div></div>
        <div class="text-[10px] text-gray-400 mt-1" data-dp-left="${slot.index}">剩余 ${fmtDur(slot.msLeft)}</div>` : ''}
      </div>`;
    }).join('');
    body.innerHTML = cards;
  }

  /** 轻量 tick：只改倒计时文本与进度条，到点整帧重绘 */
  function tick() {
    const d = dp();
    if (!d) return;
    const s = d.summary();
    let crossed = false;
    s.slots.forEach((slot) => {
      if (slot.state !== 'running') return;
      const left = document.querySelector(`[data-dp-left="${slot.index}"]`);
      if (left) left.textContent = `剩余 ${fmtDur(slot.msLeft)}`;
      const bar = document.querySelector(`[data-dp-bar="${slot.index}"]`);
      if (bar) bar.style.width = slot.readyPct + '%';
      if (slot.msLeft <= 0) crossed = true;
    });
    if (crossed) { renderDispatchPanel(); if (typeof window.refreshRedDots === 'function') window.refreshRedDots(); }
  }

  /* ── 派驻弹窗：选地点 → 选人 ─────────────────────────────── */
  function openStartModal(slotIdx) {
    const d = dp();
    const ui = uiComp();
    if (!d || !ui) return;
    const s = d.summary();
    const placeRows = s.places.map((p, i) => `
      <button type="button" class="ui-opt w-full text-left ${i === 0 ? 'ui-opt--active' : ''}" data-dp-place="${esc(p.id)}">
        <div class="flex items-center gap-2">
          <span class="font-bold">${esc(p.name)}</span>
          <span class="ui-tag" data-tone="${p.risk === '高' ? 'epic' : p.risk === '中' ? 'rare' : 'common'}">${esc(p.risk)}风险</span>
          <span class="ml-auto text-[10px] text-gray-400">${p.hours} 小时 · 推荐战力 ${fmt(p.recPower)}</span>
        </div>
        <div class="text-[11px] text-gray-400 mt-1">${esc(p.desc || '')}</div>
        <div class="text-[11px] mt-1 flex flex-wrap gap-x-3">${rewardInline(p.rewards)}</div>
      </button>`).join('');

    let placeId = s.places[0] ? s.places[0].id : null;
    const picked = [];
    // openModal 的 actions 不支持 id/disabled —— 「出发」用闭包 tryGo 实现，
    // 未选人时 toast 提示而不是禁用按钮（组件契约见 components.js openModal）。
    let tryGo = null;

    const body = `
      <div class="space-y-2 mb-3">${placeRows}</div>
      <div class="text-xs text-gray-400 mb-1">选择队员（最多 ${Number(d.cfg().maxChars) || 5} 人，同一角色不能同时在两处探险）</div>
      <div class="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1" id="dpCharGrid"></div>
      <div class="text-xs mt-3" id="dpPickHint"></div>`;

    document.querySelectorAll('.ui-modal').forEach(m => m.remove());
    const close = ui.openModal({
      title: `派驻 · 第 ${slotIdx + 1} 队`,
      body,
      actions: [
        { label: '取消', tone: 'ghost' },
        { label: '出发', tone: 'primary', onClick: (c) => { if (tryGo) tryGo(c); } }
      ]
    });
    const wrap = document.querySelectorAll('.ui-modal');
    const box = wrap.length ? wrap[wrap.length - 1] : document;

    function powerOf(id) {
      const inst = (typeof gameData !== 'undefined' ? (gameData.characters || []) : []).find(c => c && c.id === id);
      try { return inst && typeof calculateCharacterPower === 'function' ? calculateCharacterPower(inst) : 0; }
      catch (e) { return 0; }
    }
    function hint() {
      const place = s.places.find(p => p.id === placeId) || {};
      const power = picked.reduce((a, id) => a + powerOf(id), 0);
      const ratio = power / Math.max(1, Number(place.recPower) || 1);
      const el = box.querySelector('#dpPickHint');
      if (!el) return;
      if (!picked.length) { el.innerHTML = `<span class="text-gray-500">还没选人</span>`; return; }
      el.innerHTML = `已选 ${picked.length} 人 · 队伍战力 <b>${fmt(power)}</b> / 推荐 ${fmt(place.recPower)} · 收益加成 <b class="text-yellow-400">+${Math.round((d.bonusMult(ratio) - 1) * 100)}%</b> · 事件赌局成功率 <b>${Math.round(d.gambleRate(ratio) * 100)}%</b>`;
    }
    function renderChars() {
      const grid = box.querySelector('#dpCharGrid');
      if (!grid) return;
      const busy = new Set();
      d.summary().slots.forEach(sl => { if (sl.chars) sl.chars.forEach(id => busy.add(id)); });
      const chars = (typeof gameData !== 'undefined' ? (gameData.characters || []) : []);
      grid.innerHTML = chars.map(c => {
        const isPicked = picked.includes(c.id);
        const isBusy = busy.has(c.id);
        const dim = isBusy && !isPicked;
        return `<button type="button" class="ui-opt p-1 ${isPicked ? 'ui-opt--active' : ''} ${dim ? 'opacity-40' : ''}" data-dp-char="${esc(c.id)}" ${dim ? 'data-dp-busy="1"' : ''}>
          <img src="${esc(c.imageUrl || '')}" class="w-full aspect-square object-cover rounded" alt="">
          <div class="text-[9px] truncate">${esc(c.name || c.id)}</div>
          <div class="text-[9px] text-gray-400">${dim ? '已派出' : fmt(powerOf(c.id))}</div>
        </button>`;
      }).join('');
      grid.querySelectorAll('[data-dp-char]').forEach(b => {
        b.addEventListener('click', () => {
          const id = b.getAttribute('data-dp-char');
          if (b.getAttribute('data-dp-busy')) { ui.toast('该角色已在别的地点探险', 'ghost'); return; }
          const at = picked.indexOf(id);
          if (at >= 0) picked.splice(at, 1);
          else {
            if (picked.length >= (Number(d.cfg().maxChars) || 5)) { ui.toast(`最多带 ${d.cfg().maxChars} 人`, 'ghost'); return; }
            picked.push(id);
          }
          renderChars(); hint();
        });
      });
    }
    box.querySelectorAll('[data-dp-place]').forEach(b => {
      b.addEventListener('click', () => {
        box.querySelectorAll('[data-dp-place]').forEach(x => x.classList.remove('ui-opt--active'));
        b.classList.add('ui-opt--active');
        placeId = b.getAttribute('data-dp-place');
        hint();
      });
    });
    renderChars(); hint();
    tryGo = (closeFn) => {
      if (!picked.length) { ui.toast('先选至少 1 名队员', 'ghost'); return; }
      const r = d.start(slotIdx, placeId, picked);
      if (!r.ok) { ui.toast({ slot_busy: '这个槽已有队伍', char_busy: '有角色已在探险', too_few: '至少带 1 人', too_many: '人数超上限', bad_place: '地点无效' }[r.reason] || '派驻失败', 'danger'); return; }
      closeFn();
      ui.toast(`队伍已出发 · 战力 ${fmt(r.power)} / 推荐 ${fmt(r.recPower)}`, 'primary', 2600);
      renderDispatchPanel();
      if (typeof window.refreshRedDots === 'function') window.refreshRedDots();
    };
  }

  /* ── 结算：基础收益 + 事件三选一 ─────────────────────────── */
  function claim(slotIdx) {
    const d = dp();
    const ui = uiComp();
    if (!d || !ui) return;
    const slot = (d.summary().slots || [])[slotIdx];
    if (!slot) return;
    if (slot.state === 'running') { ui.toast('队伍还在途中', 'ghost'); return; }
    if (slot.state === 'event') {
      // 事件此前已结算过基础收益（稍后处理路径）—— 重建事件弹窗即可
      const ev = (d.cfg().events || []).find(e => e && e.id === (slot.event || {}).id);
      if (!ev) { ui.toast('事件数据缺失', 'danger'); return; }
      openEventModal(slotIdx, { event: ev, ratio: slot.ratio }, null);
      return;
    }
    if (slot.state !== 'ready') return;
    const r = d.settle(slotIdx);
    if (!r.ok) { ui.toast({ in_progress: '还没到点', not_ready: '无可结算的派驻' }[r.reason] || '暂不可结算', 'ghost'); return; }
    const lines = (r.lines || []).map(l => `<div class="ui-result-row"><span>${esc(l)}</span></div>`).join('');
    const body = `
      <div class="text-xs text-gray-400 mb-2">基础报酬（战力加成已计入）</div>
      <div class="ui-result-block">${lines || '<div class="text-xs text-gray-500">无</div>'}</div>`;
    if (!r.event) { ui.openModal({ title: '派驻回报', body, actions: [{ label: '好的', tone: 'primary' }] }); }
    else openEventModal(slotIdx, r, body);
    renderDispatchPanel();
    if (typeof window.refreshRedDots === 'function') window.refreshRedDots();
  }

  function openEventModal(slotIdx, settleRet, baseHtml) {
    const d = dp();
    const ui = uiComp();
    if (!d || !ui) return;
    const ev = settleRet.event;
    const ratio = settleRet.ratio;
    const slot = d.summary().slots[slotIdx] || {};
    const placeId = slot.placeId;
    const optCard = (opt, i) => {
      let preview = '';
      if (opt.kind === 'gamble') {
        const rate = d.gambleRate(ratio);
        const winTxt = rewardInline(d.previewOption(placeId, opt, ratio)) || '—';
        preview = `成功率 <b class="${rate >= 0.85 ? 'text-green-400' : rate >= 0.6 ? 'text-yellow-400' : 'text-red-400'}">${Math.round(rate * 100)}%</b> · 成功 ${winTxt} / 失败 15% 安慰奖`;
      } else {
        preview = rewardInline(d.previewOption(placeId, opt, ratio)) || '—';
      }
      return `<button type="button" class="ui-opt w-full text-left" data-dp-opt="${i}">
        <div class="font-bold">${esc(opt.label)}</div>
        <div class="text-[11px] text-gray-400">${esc(opt.desc || '')}</div>
        <div class="text-[11px] mt-1 flex flex-wrap gap-x-3">${preview}</div>
      </button>`;
    };
    const body = `
      ${baseHtml || ''}
      <div class="mt-3 mb-2 text-sm font-bold"><i class="fa fa-question-circle text-yellow-400 mr-1"></i>${esc(ev.name)}</div>
      <div class="text-xs text-gray-400 mb-2">${esc(ev.text || '')}</div>
      <div class="space-y-2">${(ev.options || []).map(optCard).join('')}</div>`;
    document.querySelectorAll('.ui-modal').forEach(m => m.remove());
    ui.openModal({ title: '派驻 · 途中遭遇', body, actions: [{ label: '稍后再处理', tone: 'ghost' }] });
    const wraps = document.querySelectorAll('.ui-modal');
    const box = wraps.length ? wraps[wraps.length - 1] : document;
    box.querySelectorAll('[data-dp-opt]').forEach(b => {
      b.addEventListener('click', () => {
        const r2 = d.resolveEvent(slotIdx, Number(b.getAttribute('data-dp-opt')));
        if (!r2.ok) { ui.toast('处理失败', 'danger'); return; }
        box.remove();
        const lines = (r2.lines || []).map(l => `<div class="ui-result-row"><span>${esc(l)}</span></div>`).join('');
        const title = r2.rate == null ? '事件了结' : (r2.success ? '赌赢了！' : '赌输了…');
        const tone = r2.rate == null ? 'primary' : (r2.success ? 'gold' : 'danger');
        const outcome = r2.rate == null ? '' : `<div class="text-xs mb-2 ${r2.success ? 'text-green-400' : 'text-red-400'}">${esc(r2.optionLabel || '')} · ${r2.success ? `成功（成功率 ${Math.round(r2.rate * 100)}%）` : `失败（成功率 ${Math.round(r2.rate * 100)}%，拿到安慰奖）`}</div>`;
        ui.openModal({ title, body: `${outcome}<div class="ui-result-block">${lines || '<div class="text-xs text-gray-500">无</div>'}</div>`, actions: [{ label: '好的', tone }] });
        if (typeof window.updateUI === 'function') window.updateUI();
        renderDispatchPanel();
        if (typeof window.renderDailyGoals === 'function') window.renderDailyGoals();
        if (typeof window.refreshRedDots === 'function') window.refreshRedDots();
      });
    });
  }

  function cancelSlot(slotIdx) {
    const d = dp();
    const ui = uiComp();
    if (!d || !ui) return;
    ui.confirmModal
      ? ui.confirmModal({
        title: '提前召回', body: '提前召回只能拿到已过时长的一半报酬（无途中事件）。确定召回？',
        onOk: () => {
          const r = d.cancel(slotIdx);
          if (!r.ok) { ui.toast('没有可召回的队伍', 'ghost'); return; }
          ui.toast(r.refunded ? `已召回 · 按比例结算 ${Math.round((r.frac || 0) * 100)}% × 50%` : '已召回（不足最短时长，无收益）', 'ghost', 2800);
          renderDispatchPanel();
          if (typeof window.refreshRedDots === 'function') window.refreshRedDots();
        }
      })
      : (() => { const r = d.cancel(slotIdx); if (r && r.ok) renderDispatchPanel(); })();
  }

  function initDispatch() {
    const d = dp();
    if (!d) return;
    d.slots();   // ensure 存档结构
    renderDispatchPanel();
    document.getElementById('dispatchBody') && setInterval(tick, 1000);
    document.body.addEventListener('click', (e) => {
      const t = e.target.closest('[data-dp-start],[data-dp-claim],[data-dp-event],[data-dp-cancel]');
      if (!t) return;
      if (t.hasAttribute('data-dp-start')) openStartModal(Number(t.getAttribute('data-dp-start')));
      else if (t.hasAttribute('data-dp-claim') || t.hasAttribute('data-dp-event')) claim(Number(t.getAttribute('data-dp-claim') || t.getAttribute('data-dp-event')));
      else if (t.hasAttribute('data-dp-cancel')) cancelSlot(Number(t.getAttribute('data-dp-cancel')));
    });
  }

  const api = { renderDispatchPanel, openStartModal, claim, initDispatch, tick };
  const segs = 'Game.ui.dispatch'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__dispatchUI = api;
  window.initDispatch = initDispatch;
})();
