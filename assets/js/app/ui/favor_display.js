/* ════════════════════════════════════════════════════════════════
   幻卡传说 · 好感外观展示（E5-B · 2026-09-16）
   ────────────────────────────────────────────────────────────────
   主页右侧的「羁绊展示位」：把你投入过好感的那名角色摆在主页，
   配上好感达标解锁的**头像框**。

   为什么值得做（策划口径）：
     好感此前只有两处回报 —— 属性加成（看不见）和剧情（要点进去）。
     玩家的投入需要一个**每天打开游戏第一眼就能看到**的落点，
     否则"我为什么每天谈心"这个问题在主页上没有答案。

   为什么是纯外观（硬约束）：
     好感的数值回报已经由 domain/favor.js 的 attrBonus 给出
     （攻/防/生各 (lv-1)×0.5%）。这里再叠加任何加成都会动到数值基线，
     snapshot-numbers 会红。所以展示位**一点战力都不给** ——
     它证明的是"你和谁的关系"，不是"你变强了多少"。

   挂载：index.html 的 #favorDisplayBody；由 updateUI() 驱动刷新。
   ════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  let bound = false;
  let pickerMode = 'char';

  const favorApi = () => (window.__favor || (window.Game && window.Game.domain && window.Game.domain.favor) || null);
  const uiComp = () => (window.__uiComponents || (window.Game && window.Game.ui && window.Game.ui.components) || null);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmt(n) { return Math.floor(Number(n) || 0).toLocaleString(); }

  function toast(msg, tone) {
    const C = uiComp();
    if (C && C.toast) C.toast(msg, tone || '');
    else if (window.uiToast) window.uiToast(msg, tone);
  }

  function afterChange() {
    renderFavorDisplay();
    if (typeof window.updateUI === 'function') window.updateUI();
  }

  /* ── 主页展示卡 ─────────────────────────────────────────── */

  function emptyHtml(hasOwned) {
    return `<div class="ui-showcase__empty">` +
      `<i class="fa fa-user-circle-o"></i>` +
      `<div class="ui-showcase__empty-text">还没有设置展示角色</div>` +
      (hasOwned
        ? `<button type="button" class="ui-btn ui-btn--sm ui-btn--primary" data-display-pick="char">选一位角色</button>`
        : `<div class="ui-showcase__empty-sub">先去抽卡获得角色吧</div>`) +
      `</div>`;
  }

  function cardHtml(info) {
    const C = uiComp();
    const s = info.summary;
    if (!s) return emptyHtml((info.candidates || []).length > 0);
    const p = s.progress;
    const fr = info.frame || {};
    const bar = (C && C.progress)
      ? C.progress(Math.round(p.pct * 100), p.isMax ? 'gold' : 'accent', !p.isMax)
      : '';
    const persona = s.persona || {};
    return `<div class="ui-showcase">` +
        `<div class="ui-showcase__frame ui-frame--${esc(fr.tone || 'muted')}" data-display-open="${esc(s.id)}">` +
          `<img class="ui-showcase__img" src="${esc(s.imageUrl || '')}" alt="${esc(s.name)}">` +
          `<span class="ui-showcase__badge" title="${esc(fr.name || '')}"><i class="fa ${esc(fr.icon || 'fa-circle-o')}"></i></span>` +
        `</div>` +
        `<div class="ui-showcase__name">${esc(s.name)}</div>` +
        `<div class="ui-showcase__title">Lv.${fmt(p.level)} · ${esc(p.title)}</div>` +
        `<div class="ui-showcase__frame-name"><i class="fa ${esc(fr.icon || 'fa-circle-o')}"></i>${esc(fr.name || '不加框')}</div>` +
        `<div class="ui-showcase__quote">${esc(persona.quote || '')}</div>` +
        `<div class="ui-showcase__bar">${bar}</div>` +
        `<div class="ui-showcase__acts">` +
          `<button type="button" class="ui-btn ui-btn--sm ui-btn--ghost" data-display-pick="char">更换角色</button>` +
          `<button type="button" class="ui-btn ui-btn--sm ui-btn--ghost" data-display-pick="frame">头像框</button>` +
        `</div>` +
      `</div>`;
  }

  function renderFavorDisplay() {
    const api = favorApi();
    const host = document.getElementById('favorDisplayBody');
    if (!host || !api) return;
    let info;
    try { info = api.displayInfo(); }
    catch (e) { info = null; }
    if (!info) { host.innerHTML = emptyHtml(false); return; }
    host.innerHTML = (!info.id || !info.owned)
      ? emptyHtml((info.candidates || []).length > 0)
      : cardHtml(info);
    const prog = api.frameProgress ? api.frameProgress() : null;
    const hint = document.getElementById('favorDisplayHint');
    if (hint && prog) {
      hint.textContent = `头像框 ${prog.globalGot}/${prog.globalTotal} · 专属 ${prog.charGot}/${prog.charTotal}`;
    }
  }

  /* ── 选择器（角色 / 头像框）──────────────────────────────── */

  function charListHtml(api, current) {
    const ids = (api.displayInfo().candidates || []);
    if (!ids.length) return `<div class="ui-favor__empty">你还没有持有任何角色</div>`;
    const cells = ids.map(id => {
      let name = id, img = '', lv = 1, title = '';
      try {
        const s = api.summary(id);
        name = s.name; img = s.imageUrl; lv = s.progress.level; title = s.progress.title;
      } catch (e) { /* 数据缺失时用 id 兜底 */ }
      return `<button type="button" class="ui-pick__cell${id === current ? ' is-current' : ''}" data-display-char="${esc(id)}">` +
        `<img class="ui-pick__img" src="${esc(img)}" alt="">` +
        `<span class="ui-pick__name">${esc(name)}</span>` +
        `<span class="ui-pick__lv">Lv.${fmt(lv)} ${esc(title)}</span>` +
        `</button>`;
    }).join('');
    return `<div class="ui-pick__grid">${cells}</div>`;
  }

  function frameListHtml(api, current) {
    const list = api.frameCatalog();
    const globals = list.filter(f => f.kind === 'global');
    const chars = list.filter(f => f.kind === 'char');
    const cell = (f) =>
      `<button type="button" class="ui-pick__frame ui-frame--${esc(f.tone || 'muted')}${f.unlocked ? '' : ' is-locked'}${f.id === current ? ' is-current' : ''}"` +
        ` data-display-frame="${esc(f.id)}"${f.unlocked ? '' : ' disabled'}>` +
        `<span class="ui-pick__frame-icon"><i class="fa ${esc(f.icon || 'fa-circle-o')}"></i></span>` +
        `<span class="ui-pick__frame-name">${esc(f.name)}</span>` +
        `<span class="ui-pick__frame-desc">${f.unlocked ? esc(f.desc || '') : `未解锁 · ${esc(f.desc || '')}`}</span>` +
        (f.id === current ? `<span class="ui-pick__frame-flag">佩戴中</span>` : '') +
      `</button>`;
    const sec = (label, arr) => arr.length
      ? `<div class="ui-pick__sec-title">${esc(label)}</div><div class="ui-pick__frames">${arr.map(cell).join('')}</div>`
      : `<div class="ui-pick__sec-title">${esc(label)}</div><div class="ui-favor__empty">还没有解锁 —— 把某位角色的好感升到 Lv.7 试试</div>`;
    return sec('通用头像框', globals) + sec('角色专属框', chars);
  }

  function openPicker(mode) {
    const api = favorApi();
    const C = uiComp();
    if (!api || !C || typeof C.openModal !== 'function') return;
    pickerMode = (mode === 'frame') ? 'frame' : 'char';
    const info = api.displayInfo();

    const tab = (key, label) =>
      `<button type="button" class="ui-pick__tab${pickerMode === key ? ' is-active' : ''}" data-display-tab="${esc(key)}">${esc(label)}</button>`;

    const bodyHtml = () =>
      `<div class="ui-pick__tabs">${tab('char', '展示角色')}${tab('frame', '头像框')}</div>` +
      `<div class="ui-pick__body">` +
        (pickerMode === 'char' ? charListHtml(api, info.id) : frameListHtml(api, info.frame ? info.frame.id : '')) +
      `</div>`;

    C.openModal({
      title: '羁绊展示位',
      body: bodyHtml(),
      actions: [{ label: '关闭', tone: 'ghost' }],
      onMount(wrap, close) {
        wrap.addEventListener('click', (e) => {
          const t = e.target;
          if (!t || !t.closest) return;

          const tabBtn = t.closest('[data-display-tab]');
          if (tabBtn) {
            pickerMode = tabBtn.getAttribute('data-display-tab') === 'frame' ? 'frame' : 'char';
            const b = wrap.querySelector('.ui-pick__body');
            if (b) {
              const cur = api.displayInfo();
              b.innerHTML = (pickerMode === 'char' ? charListHtml(api, cur.id) : frameListHtml(api, cur.frame ? cur.frame.id : ''));
            }
            wrap.querySelectorAll('[data-display-tab]').forEach(el => {
              el.classList.toggle('is-active', el.getAttribute('data-display-tab') === pickerMode);
            });
            return;
          }

          const chBtn = t.closest('[data-display-char]');
          if (chBtn) {
            const r = api.setDisplay(chBtn.getAttribute('data-display-char'));
            if (r.ok) {
              toast('已设为主页展示角色', 'success');
              close();
              afterChange();
            } else if (r.reason === 'notowned') {
              toast('还没拥有这名角色', 'warning');
            }
            return;
          }

          const frBtn = t.closest('[data-display-frame]');
          if (frBtn && !frBtn.disabled) {
            const r = api.setFrame(frBtn.getAttribute('data-display-frame'));
            if (r.ok) {
              toast(`已佩戴「${(r.frame && r.frame.name) || '头像框'}」`, 'success');
              close();
              afterChange();
            } else if (r.reason === 'locked') {
              toast('这个头像框还没解锁', 'warning');
            }
          }
        });
      }
    });
  }

  /* ── 事件 ───────────────────────────────────────────────── */

  function onBodyClick(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    const pick = t.closest('[data-display-pick]');
    if (pick) { openPicker(pick.getAttribute('data-display-pick')); return; }
    const open = t.closest('[data-display-open]');
    if (open) {
      const id = open.getAttribute('data-display-open');
      if (id && typeof window.openCharArchive === 'function') window.openCharArchive(id);
    }
  }

  function bind() {
    if (bound) return;
    document.body.addEventListener('click', onBodyClick);
    bound = true;
  }

  function initFavorDisplay() {
    bind();
    renderFavorDisplay();
  }

  const api = {
    renderFavorDisplay, openPicker, initFavorDisplay,
    get pickerMode() { return pickerMode; }
  };

  const segs = 'Game.ui.favorDisplay'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__favorDisplay = api;
  window.renderFavorDisplay = renderFavorDisplay;
  window.initFavorDisplay = initFavorDisplay;
})();
