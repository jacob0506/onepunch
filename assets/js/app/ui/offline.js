/**
 * offline.js —— 兼容转发壳（C1/C3 之后）
 *
 * ⚠️ 历史包袱：checkOfflineRewards / claimOfflineRewards 这两个名字被 index.html 内联、
 *    home.js、bootstrap.js 调用，且已写进玩家存档心智。改名风险 > 收益，因此保留名字，
 *    但**实现全部下沉到 domain/idle.js（window.__idle）** —— 在线挂机与离线收益共用同一套
 *    速率，避免两份数值互相漂移（本项目历史上最大的 bug 来源）。
 *
 * 本文件**不得**再包含任何数值计算。
 */
(() => {
  'use strict';

  const idleApi = () => (window.__idle || (window.Game && window.Game.domain && window.Game.domain.idle) || null);
  const idleUI = () => (window.__idleUI || (window.Game && window.Game.ui && window.Game.ui.idle) || null);

  function checkOfflineRewards() {
    const ui = idleUI();
    const idle = idleApi();
    if (idle) idle.syncIdleStage();
    if (ui && typeof ui.renderIdlePanel === 'function') return ui.renderIdlePanel();
    return null;
  }

  function claimOfflineRewards() {
    const ui = idleUI();
    if (ui && typeof ui.claimIdleRewards === 'function') return ui.claimIdleRewards();
    const idle = idleApi();
    if (idle) idle.claimIdle();
    if (typeof window.updateUI === 'function') window.updateUI();
    return null;
  }

  const api = { checkOfflineRewards, claimOfflineRewards };
  if (window.Game && window.Game.ui) window.Game.ui.offline = api;
  window.__offlineUI = api;

  window.checkOfflineRewards = checkOfflineRewards;
  window.claimOfflineRewards = claimOfflineRewards;
})();
