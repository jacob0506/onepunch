/* season_trial.js（UI）—— 赛季秘境面板（E6-2）
   数值单源：domain/season_trial.js（window.__trial）。本文件只渲染与交互。
   挂载点：赛季面板 #seasonBody 内（由 ui/season.js 调 trialHtml() 插入）。 */
(() => {
  'use strict';

  function T() { return window.__trial || null; }
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
    if (r && r.gold) out.push('金 ' + fmtNum(r.gold));
    if (r && r.gems) out.push('钻 ' + fmtNum(r.gems));
    if (r && r.materials) Object.keys(r.materials).forEach(k => out.push(materialName(k) + '×' + r.materials[k]));
    return out.length ? out.join(' · ') : '—';
  }

  function layerCard(L, i, sum) {
    const can = L.unlocked && sum.triesLeft > 0;
    const state = L.cleared ? '已通关' : (L.unlocked ? '可挑战' : '未解锁');
    const stateCls = L.cleared ? 'text-green-400' : (L.unlocked ? 'text-yellow-400' : 'text-gray-500');
    const cls = 'ui-opt text-left' + (L.cleared ? ' ui-opt--disabled' : (can ? ' ui-opt--active' : ' ui-opt--disabled'));
    return '<div class="' + cls + ' p-2">'
      + '<div class="flex items-center">'
      + '<span class="text-[11px] font-bold">第 ' + (i + 1) + ' 层</span>'
      + '<span class="ml-auto text-[9px] ' + stateCls + '">' + state + '</span>'
      + '</div>'
      + '<div class="text-[10px] font-bold mt-1" style="color:' + esc(sum.themeColor || '#7dd3fc') + '">' + esc((L.affix || {}).name || '') + '</div>'
      + '<div class="text-[9px] text-gray-400 leading-tight">' + esc((L.affix || {}).desc || '') + '</div>'
      + '<div class="text-[9px] text-gray-500 mt-1">首通：' + esc(rewardText(L.reward)) + '</div>'
      + '<button type="button" class="ui-btn ui-btn--sm ' + (can ? 'ui-btn--gold' : 'ui-btn--ghost') + ' w-full mt-1"'
      + ' data-tr-fight="' + i + '"' + (can ? '' : ' disabled') + '>'
      + (L.cleared ? '重复挑战' : '挑战') + '</button>'
      + '</div>';
  }

  /** 供 ui/season.js 插入的秘境区块 HTML（无数据时返回空串） */
  function trialHtml() {
    const X = T();
    if (!X) return '';
    let sum = null;
    try { sum = X.summary(); } catch (e) { return ''; }
    if (!sum) return '';

    const head = ''
      + '<div class="ui-panel ui-panel--tight">'
      + '<div class="flex items-center text-xs font-bold">'
      + '<i class="fa fa-compass mr-1" style="color:' + esc(sum.themeColor || '#7dd3fc') + '"></i>'
      + '赛季秘境 · ' + esc(sum.title || '无名秘境')
      + '<span class="ml-auto text-[10px] text-gray-400">今日 ' + sum.triesLeft + ' / ' + sum.dailyTries + ' 次</span>'
      + '</div>'
      + '<div class="text-[11px] text-gray-400 mt-1 leading-relaxed">' + esc(sum.intro || '') + '</div>'
      + '<div class="text-[10px] text-gray-500 mt-1">已通关 <b class="text-yellow-400">' + sum.clearedCount + ' / ' + sum.layerCount + '</b>'
      + (sum.allCleared ? ' · 本季秘境已全通' : '')
      + ' · 通关计入赛季经验（本主题专属权重）</div>';

    const grid = '<div class="grid grid-cols-2 gap-2 mt-2">'
      + (sum.layers || []).map((L, i) => layerCard(L, i, sum)).join('')
      + '</div>';

    const foot = '<div class="text-[10px] text-gray-500 mt-2">'
      + '重复通关：' + esc(rewardText(sum.repeatReward)) + ' · 失败：' + esc(rewardText(sum.failReward))
      + ' · 每层词缀只在本秘境生效，不影响主线与其它玩法。新赛季会换成新主题的新秘境。'
      + '</div>';

    return head + grid + foot + '</div>';
  }

  /** 挑战按钮：起战斗 */
  function fight(layer) {
    const X = T();
    const ui = uiComp();
    if (!X) return;
    const chk = X.canFight(layer);
    if (!chk.ok) {
      const msg = {
        empty_formation: '先去布阵里上人',
        locked: '通关上一层才能解锁',
        no_tries: '今日挑战次数已用完',
        bad_layer: '层数不存在'
      }[chk.reason] || '现在打不了';
      if (ui) ui.toast(msg, 'ghost');
      return;
    }
    const r = X.start(layer);
    if (!r.ok) { if (ui) ui.toast('进入秘境失败', 'ghost'); return; }
    if (window.Game && window.Game.battle && typeof window.Game.battle.enterBattle === 'function') {
      window.Game.battle.enterBattle(r.stageId);
    } else if (typeof enterBattle === 'function') {
      enterBattle(r.stageId);
    }
    if (typeof window.renderSeasonPanel === 'function') window.renderSeasonPanel();
  }

  /** 战斗结束后：提示 + 重绘（由 fallback_hud 回调） */
  function afterBattle(ret) {
    const ui = uiComp();
    if (ret && ret.ok && ui) {
      if (ret.win && ret.firstClear) ui.toast('第 ' + (ret.layer + 1) + ' 层首通！奖励已到账', 'primary', 2600);
      else if (ret.win) ui.toast('再次通关第 ' + (ret.layer + 1) + ' 层', 'ghost');
      else ui.toast('挑战失败 —— 再练练', 'warning');
    }
    if (typeof window.renderSeasonPanel === 'function') window.renderSeasonPanel();
    if (typeof window.refreshRedDots === 'function') window.refreshRedDots();
  }

  let bound = false;
  function initSeasonTrialUI() {
    const X = T();
    if (!X) return;
    X.ensure();
    if (bound) return;                 // 幂等：重复初始化不再挂第二套监听
    bound = true;
    document.body.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tr-fight]');
      if (!t) return;
      fight(Number(t.getAttribute('data-tr-fight')));
    });
  }

  const api = { trialHtml, fight, afterBattle, initSeasonTrialUI };
  const segs = 'Game.ui.seasonTrial'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__trialUI = api;
  window.initSeasonTrialUI = initSeasonTrialUI;
})();
