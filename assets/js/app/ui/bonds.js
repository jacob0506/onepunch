/* ════════════════════════════════════════════════════════════════
   幻卡传说 · 羁绊界面层（Stage 1 · C6）
   ────────────────────────────────────────────────────────────────
   养成页「上阵设置」下方的羁绊面板。数值全在 domain/bonds.js（单源），
   本文件只渲染。

   ⚠️ 加成只在**战斗单位构建时**由 battle/scene.js 应用一次；
      这里的「阵容战力」是"假如现在开打"的含羁绊数值，用 character.js
      的 powerFromStats 单源公式算，别自己再抄一遍。
   ════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const bondsApi = () => (window.__bonds || (window.Game && window.Game.domain && window.Game.domain.bonds) || null);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function fmt(n) {
    const v = Math.round(Number(n) || 0);
    return v.toLocaleString('en-US');
  }

  /** 徽章的配色依据：职业用职业 token，阵营/剧情各一色 */
  function badgeKind(item) {
    if (item.type === 'class') return String(item.key || '').split(':')[1] || 'class';
    return item.type;
  }

  function activeHtml(item) {
    const kind = badgeKind(item);
    const tier = item.have > item.need
      ? `${item.need} 人<span class="ui-bond__extra">（多 ${item.have - item.need}）</span>`
      : `${item.need} 人`;
    return `<div class="ui-bond ui-bond--on" title="${esc(item.text)}">`
      + `<span class="ui-bond__badge" data-kind="${esc(kind)}">${esc(item.badge)}</span>`
      + `<div class="ui-bond__main">`
      + `<div class="ui-bond__title">${esc(item.name)}<span class="ui-bond__tier">${tier}</span></div>`
      + `<div class="ui-bond__text">${esc(item.text)}</div>`
      + `</div></div>`;
  }

  function progressHtml(item) {
    const kind = badgeKind(item);
    const hint = item.type === 'story'
      ? `还差 ${item.remaining} 名指定角色`
      : `再上阵 ${item.remaining} 名${esc(item.name)}角色`;
    return `<div class="ui-bond ui-bond--off">`
      + `<span class="ui-bond__badge" data-kind="${esc(kind)}">${esc(item.badge)}</span>`
      + `<div class="ui-bond__main">`
      + `<div class="ui-bond__title">${esc(item.name)}<span class="ui-bond__tier">${item.have}/${item.need}</span></div>`
      + `<div class="ui-bond__text">${hint}</div>`
      + `</div></div>`;
  }

  /**
   * 渲染羁绊面板。
   * @param {HTMLElement} [target] 默认 #cultivateBondPanel
   */
  function renderBonds(target) {
    const el = target || document.getElementById('cultivateBondPanel');
    if (!el) return;
    const api = bondsApi();
    if (!api) { el.innerHTML = ''; return; }

    const info = api.formationInfo();
    const on = info.active || [];
    const off = (info.progress || []).slice(0, 3);

    const head = `<div class="ui-bond__head">`
      + `<span class="ui-bond__head-label">羁绊${on.length ? ` · ${on.length}` : ''}</span>`
      + (info.power ? `<span class="ui-bond__power">阵容战力<b>${fmt(info.power)}</b></span>` : '')
      + `</div>`;

    let body = '';
    if (on.length) {
      body += on.map(activeHtml).join('');
    } else {
      body += `<div class="ui-bond__empty">上阵 2 名同职业 / 同阵营角色即可激活羁绊</div>`;
    }
    if (off.length) {
      body += `<div class="ui-bond__sep">即将激活</div>` + off.map(progressHtml).join('');
    }

    el.innerHTML = head + body;
  }

  const api = { renderBonds };
  const segs = 'Game.ui.bonds'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__bondsUI = api;

  window.renderBonds = renderBonds;
})();
