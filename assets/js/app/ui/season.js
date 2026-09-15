/* season.js（UI）—— 赛季活动面板（E6）
   数值单源：domain/season.js；本文件只负责渲染与交互。
   主页面板 #seasonPanel > #seasonBody，倒计时 #seasonCountdown。 */
(() => {
  'use strict';

  function season() { return window.__season || null; }
  function uiComp() { return (window.Game && window.Game.ui && window.Game.ui.components) || window.__uiComponents || null; }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function fmtNum(n) {
    const v = Number(n) || 0;
    if (v >= 1000000) return (v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1) + 'M';
    if (v >= 10000) return (v / 1000).toFixed(0) + 'K';
    return String(v);
  }

  function materialName(k) {
    const idle = window.__idle;
    if (idle && typeof idle.materialName === 'function') {
      try { return idle.materialName(k); } catch (e) { /* noop */ }
    }
    return k;
  }

  function rewardText(r) {
    const out = [];
    if (r && r.gold) out.push('金币 ' + fmtNum(r.gold));
    if (r && r.gems) out.push('钻石 ' + fmtNum(r.gems));
    if (r && r.materials) Object.keys(r.materials).forEach(k => out.push(materialName(k) + ' ×' + r.materials[k]));
    return out.length ? out.join(' · ') : '无';
  }

  function rewardShort(r) {
    if (r && r.gems) return r.gems + ' 钻';
    if (r && r.gold) return fmtNum(r.gold) + ' 金';
    if (r && r.materials) {
      const k = Object.keys(r.materials)[0];
      return materialName(k) + '×' + r.materials[k];
    }
    return '—';
  }

  function rewardIcon(r) {
    if (r && r.gems) return 'fa-diamond';
    if (r && r.gold) return 'fa-money';
    return 'fa-cube';
  }

  function leftText(ms) {
    const t = Math.max(0, Number(ms) || 0);
    const d = Math.floor(t / 86400000);
    const h = Math.floor((t % 86400000) / 3600000);
    const m = Math.floor((t % 3600000) / 60000);
    if (d > 0) return '剩余 ' + d + ' 天 ' + h + ' 时';
    if (h > 0) return '剩余 ' + h + ' 时 ' + m + ' 分';
    return '剩余 ' + m + ' 分';
  }

  function bar(pct, cls) {
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    return '<div class="ui-progress' + (cls ? ' ' + cls : '') + '"><div class="ui-progress__fill" style="width:' + p.toFixed(1) + '%"></div></div>';
  }

  function levelChip(r) {
    const state = r.claimed ? '已领' : (r.reached ? '可领' : '未达');
    const stateCls = r.claimed ? 'text-green-400' : (r.reached ? 'text-yellow-400' : 'text-gray-500');
    const cls = 'ui-opt text-center' + (r.reached && !r.claimed ? ' ui-opt--active' : ' ui-opt--disabled');
    const dis = (!r.reached || r.claimed) ? ' disabled' : '';
    return '<button type="button" class="' + cls + '" data-se-claim="' + r.lv + '"' + dis + '>'
      + '<div class="text-[10px] font-bold">Lv.' + r.lv + '</div>'
      + '<i class="fa ' + rewardIcon(r.rewards) + ' text-xs my-1"></i>'
      + '<div class="text-[9px] leading-tight">' + esc(rewardShort(r.rewards)) + '</div>'
      + '<div class="text-[9px] mt-1 ' + stateCls + '">' + state + '</div>'
      + '</button>';
  }

  function render() {
    const S = season();
    const body = document.getElementById('seasonBody');
    if (!S || !body) return;
    const sum = S.summary();
    if (!sum) return;

    const p = sum.progress || { level: 1, xp: 0, pct: 0, into: 0, need: 1, isMax: false };
    const th = sum.theme || {};
    const task = sum.task || {};
    const canTask = task.reached && !task.claimed;
    const taskPct = Math.min(100, ((task.cur || 0) / Math.max(1, task.target || 1)) * 100);
    const hist = Array.isArray(sum.history) ? sum.history.slice(0, 5) : [];
    const lvTotal = (sum.levels || []).length;

    const themeCard = ''
      + '<div class="rounded-lg p-3 border" style="border-color:' + esc(th.color || '#7dd3fc') + '33;background:linear-gradient(135deg,' + esc(th.color || '#7dd3fc') + '22,rgba(0,0,0,0))">'
      + '<div class="flex items-center">'
      + '<i class="fa ' + esc(th.icon || 'fa-star') + ' mr-2" style="color:' + esc(th.color || '#7dd3fc') + '"></i>'
      + '<div class="font-bold text-sm">' + esc(th.name || '无名之季') + '</div>'
      + '<div class="ml-auto text-[10px] text-gray-400">第 ' + sum.seasonNo + ' 赛季</div>'
      + '</div>'
      + '<div class="text-[11px] text-gray-400 mt-1">' + esc(th.tagline || '') + '</div>'
      + '<div class="text-[11px] text-gray-300 mt-1 leading-relaxed">' + esc(th.desc || '') + '</div>'
      + ((th.edict && th.edict.text)
        ? '<div class="text-[10px] mt-1" style="color:' + esc(th.color || '#7dd3fc') + '">'
          + '<i class="fa fa-bolt mr-1"></i>赛季法则：' + esc(th.edict.text) + '</div>'
        : '')
      + '</div>';

    const lvRow = ''
      + '<div class="flex items-center text-xs mb-1">'
      + '<span class="font-bold">赛季等级 Lv.' + p.level + (p.isMax ? ' <span class="text-yellow-400">· 已满级</span>' : '') + '</span>'
      + '<span class="ml-auto text-gray-400">' + fmtNum(p.xp) + ' / ' + fmtNum(p.isMax ? p.xp : (p.xp - p.into + p.need)) + ' XP</span>'
      + '</div>'
      + bar(p.pct * 100)
      + '<div class="text-[10px] text-gray-500 mt-1">下一级还需 ' + fmtNum(Math.max(0, p.need - p.into)) + ' XP · 共 ' + lvTotal + ' 级</div>';

    const taskCard = ''
      + '<div class="ui-panel ui-panel--tight">'
      + '<div class="flex items-center text-xs font-bold"><i class="fa fa-flag-checkered text-yellow-400 mr-1"></i>赛季任务 · ' + esc(task.name || '') + '</div>'
      + '<div class="text-[11px] text-gray-400 mt-1">' + esc(task.desc || '') + '</div>'
      + '<div class="mt-2">' + bar(taskPct, 'ui-progress--slim') + '</div>'
      + '<div class="flex items-center text-[10px] text-gray-400 mt-1"><span>' + fmtNum(task.cur) + ' / ' + fmtNum(task.target) + '</span><span class="ml-auto">' + esc(rewardText(task.reward)) + '</span></div>'
      + '<button class="ui-btn ui-btn--sm ' + (canTask ? 'ui-btn--gold' : 'ui-btn--ghost') + ' w-full mt-2" data-se-task' + (canTask ? '' : ' disabled') + '>'
      + (task.claimed ? '任务奖励已领取' : (canTask ? '领取任务奖励' : '任务进行中')) + '</button>'
      + '</div>';

    const track = ''
      + '<div class="text-[10px] font-bold text-gray-400 mb-1">赛季奖励轨（' + (sum.claimable || 0) + ' 项可领）</div>'
      + '<div class="grid grid-cols-4 gap-2">' + (sum.levels || []).map(levelChip).join('') + '</div>';

    const claimAll = ''
      + '<button class="ui-btn ui-btn--sm ' + (sum.claimable ? 'ui-btn--gold' : 'ui-btn--ghost') + ' w-full" data-se-claim-all' + (sum.claimable ? '' : ' disabled') + '>'
      + '<i class="fa fa-gift mr-1"></i>' + (sum.claimable ? '一键领取（' + sum.claimable + '）' : '暂无可领取') + '</button>';

    const foot = ''
      + '<div class="text-[10px] text-gray-500">赛季结束时按达到等级发放结算奖：当前预估 <b class="text-yellow-400">' + (sum.settlePreview ? sum.settlePreview.gems : 0) + '</b> 钻石，并开启下一赛季（等级与奖励轨重置）。</div>'
      + '<div class="ui-divider my-2"></div>'
      + '<div class="text-[10px] font-bold text-gray-400 mb-1">往季档案</div>'
      + (hist.length
        ? hist.map(h => '<div class="text-[10px] text-gray-400">第 ' + h.seasonNo + ' 赛季 · ' + esc(h.themeName || '—') + ' · Lv.' + h.level + ' · ' + h.rewardGems + ' 钻石</div>').join('')
        : '<div class="text-[10px] text-gray-500">本赛季是第一次记录，暂无往季档案</div>');

    // E6-2：赛季秘境（主题玩法）—— 由 ui/season_trial.js 提供，拿不到就只渲染赛季本体
    let trialBlock = '';
    const TU = (window.Game && window.Game.ui && window.Game.ui.seasonTrial) || window.__trialUI;
    if (TU && typeof TU.trialHtml === 'function') {
      try { trialBlock = TU.trialHtml() || ''; } catch (e) { trialBlock = ''; }
    }

    body.innerHTML = themeCard
      + '<div>' + lvRow + '</div>'
      + taskCard
      + trialBlock
      + '<div>' + track + '</div>'
      + claimAll
      + '<div class="mt-1">' + foot + '</div>';

    const cd = document.getElementById('seasonCountdown');
    if (cd) cd.textContent = leftText(sum.msLeft);
  }

  function tick() {
    const S = season();
    const cd = document.getElementById('seasonCountdown');
    if (!S || !cd) return;
    try {
      const s = S.ensure();
      if (!s) return;
      cd.textContent = leftText(Math.max(0, (s.endsAt || 0) - Date.now()));
    } catch (e) { /* noop */ }
  }

  function afterChange() {
    render();
    if (typeof window.refreshRedDots === 'function') window.refreshRedDots();
  }

  function initSeason() {
    const S = season();
    if (!S) return;
    S.sync();                 // 补建窗口 + 跨季滚动（会改档，只在这里做）
    // E6-2：赛季秘境（主题玩法）初始化 —— 幂等，模块没加载就静默跳过
    if (typeof window.initSeasonTrialUI === 'function') {
      try { window.initSeasonTrialUI(); } catch (e) { /* noop */ }
    }
    render();
    document.body.addEventListener('click', (e) => {
      const t = e.target.closest('[data-se-claim],[data-se-task],[data-se-claim-all]');
      if (!t) return;
      const ui = uiComp();
      if (t.hasAttribute('data-se-claim-all')) {
        const r = S.claimAll();
        if (ui) ui.toast(r.count ? ('赛季奖励已领取 ' + r.count + ' 项') : '暂无可领取', r.count ? 'primary' : 'ghost');
      } else if (t.hasAttribute('data-se-task')) {
        const r = S.claimTask();
        if (!r.ok) { if (ui) ui.toast(r.reason === 'claimed' ? '任务奖励已领取' : '任务尚未完成', 'ghost'); return; }
        if (ui) ui.toast('赛季任务奖励已到账', 'primary');
      } else {
        const lv = Number(t.getAttribute('data-se-claim'));
        const r = S.claim(lv);
        if (!r.ok) { if (ui) ui.toast(r.reason === 'claimed' ? '该级奖励已领取' : '还没达到这一级', 'ghost'); return; }
        if (ui) ui.toast('Lv.' + lv + ' 奖励已到账', 'primary');
      }
      afterChange();
    });
    setInterval(tick, 1000);
  }

  const api = { render, tick, initSeason, renderSeasonPanel: render };
  const segs = 'Game.ui.season'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__seasonUI = api;
  window.initSeason = initSeason;
  window.renderSeasonPanel = render;
})();
