/**
 * dev.js —— 开发者模式（Developer Mode）
 *
 * 目的：把「内部调试入口」从"默认常显给所有玩家"改为"需主动开启"。
 *   - #debugMenu（红色脉冲圆钮 +「管理员的禁忌之书」面板）
 *   - 关卡卡片上的「场景调试」按钮（[data-stage-debug]）
 *   - #mobile-logger（真理之门日志台）
 *   - #battleSceneDebug（战斗场景调试全屏面板，本身即 hidden，只能由上面两个入口打开）
 *
 * 开启 / 关闭：连点顶部标题「幻卡传说」5 次（相邻点击间隔 < 700ms）。
 * 状态持久化：localStorage['cardGameDevMode'] === '1'。
 * 状态同步：<body> 上增删 .dev-mode 类；并向 window 派发 'game:devmodechange' 事件。
 *
 * 可见性规则全部写在 index.html 的一段普通 <style> 里（非 Tailwind 层），
 * 形如 `body:not(.dev-mode) #debugMenu { display: none !important; }`，
 * 因此本模块不需要去逐个 add/remove 'hidden' 类，避免与既有逻辑（如
 * battleSceneDebugApplyShellUI 记录的 prevDebugMenuHidden）互相打架。
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'cardGameDevMode';
  const TAP_TARGET = 5;    // 连点次数
  const TAP_WINDOW = 700;  // 相邻两次点击的最大间隔（ms）

  let on = false;
  try { on = window.localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { /* 隐私模式下 localStorage 可能不可用 */ }

  /** 把当前状态刷到 DOM / localStorage / 事件总线上 */
  function apply() {
    const body = document.body;
    if (body) body.classList.toggle('dev-mode', on);
    try { window.localStorage.setItem(STORAGE_KEY, on ? '1' : ''); } catch (e) { /* ignore */ }
    try {
      window.dispatchEvent(new CustomEvent('game:devmodechange', { detail: { on: on } }));
    } catch (e) { /* 老浏览器兜底 */ }
  }

  function isOn() { return on; }

  function set(v) {
    const next = !!v;
    if (next === on) { apply(); return on; }
    on = next;
    apply();
    console.log(on ? '[dev] 开发者模式已开启（调试入口已显示）' : '[dev] 开发者模式已关闭（调试入口已隐藏）');
    return on;
  }

  function toggle() { return set(!on); }

  /** 连点标题触发开关。标题不存在时退化为连点任意 h1，再退化则放弃（不影响其它功能）。 */
  function bindTrigger() {
    const target = document.getElementById('gameTitle') || document.querySelector('header h1');
    if (!target) return;
    target.style.cursor = 'pointer';
    target.style.userSelect = 'none';
    target.style.webkitUserSelect = 'none';
    target.setAttribute('title', '连点 5 次切换开发者模式');

    let count = 0;
    let last = 0;
    let resetTimer = 0;

    target.addEventListener('click', () => {
      const now = Date.now();
      if (now - last > TAP_WINDOW) count = 0;
      count += 1;
      last = now;
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => { count = 0; }, TAP_WINDOW);
      if (count >= TAP_TARGET) {
        count = 0;
        clearTimeout(resetTimer);
        toggle();
      }
    });
  }

  window.Game = window.Game || {};
  window.Game.dev = {
    isOn: isOn,
    set: set,
    toggle: toggle,
    enable: () => set(true),
    disable: () => set(false),
    STORAGE_KEY: STORAGE_KEY
  };

  function boot() {
    apply();
    bindTrigger();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
