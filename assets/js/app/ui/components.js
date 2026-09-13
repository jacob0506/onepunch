/* ════════════════════════════════════════════════════════════════
   幻卡传说 · UI 组件 JS 工厂（Stage 1 · B5）
   ────────────────────────────────────────────────────────────────
   配套样式见 assets/css/components.css（.ui-* 类）。
   这里只做 DOM 字符串/节点工厂，不做业务判断 —— 业务逻辑不进本文件。

   用法（B6 起新界面一律走这里，不再手拼玻璃面板/按钮/弹窗）：
     const C = window.Game.ui.components;
     el.innerHTML = C.charCard({ name, rarity, stars, maxStars, img, power, level, selected });
     el.insertAdjacentHTML('beforeend', C.starRow(3, 5) + C.tag('SSR', 'ssr') + C.progress(72, 'accent', true));
     const close = C.openModal({ title: '确认', body: '<p>…</p>', actions: [...] });
     C.toast('保存成功', 'success');

   ⚠️ 加载顺序：components.css → tokens.css 任意先后均可（token 在 :root），
      但本文件必须在调用方（内联主脚本 / 其它 ui 模块）**之前**加载。
   ════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /* ── 星星行 ──────────────────────────────────────────────── */
  function starRow(filled, max) {
    const n = Math.max(0, filled | 0);
    const m = Math.max(n, max | 0);
    let html = '<span class="ui-stars">';
    for (let i = 0; i < m; i++) {
      html += '<i class="fa fa-star ui-star' + (i < n ? ' ui-star--on' : '') + '"></i>';
    }
    return html + '</span>';
  }

  /* ── 标签 ────────────────────────────────────────────────── */
  function tag(text, tone) {
    return '<span class="ui-tag"' + (tone ? ' data-tone="' + esc(tone) + '"' : '') + '>' + esc(text) + '</span>';
  }

  /* ── 进度条 ──────────────────────────────────────────────── */
  function progress(pct, tone, striped) {
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    return '<div class="ui-progress">' +
      '<div class="ui-progress__fill' + (striped ? ' ui-progress__fill--striped' : '') + '"' +
      (tone ? ' data-tone="' + esc(tone) + '"' : '') +
      ' style="width:' + p + '%"></div></div>';
  }

  /* ── 角色卡 ────────────────────────────────────────────────
     opts: { id, name, rarity('r|sr|ssr|ur|sur'), className, classTone,
             level, stars, maxStars, img, power, selected, disabled,
             square(1:1 图), dim(图区压暗), pop(入场弹跳),
             overlay(图区覆盖层 HTML，如碎片转化标记), extra(卡体附加 HTML) }
     内部结构类（.ui-card__*）定义在 components.css，不依赖 Tailwind。 */
  function charCard(opts) {
    const o = opts || {};
    const imgCls = 'ui-card__img' + (o.square ? ' ui-card__img--square' : '') +
      (o.dim ? ' ui-card__img--dim' : '');
    const phCls = 'ui-card__ph' + (o.square ? ' ui-card__ph--square' : '');
    let inner = '<div class="ui-card__media">';
    if (o.img) {
      inner += '<img class="' + imgCls + '" src="' + esc(o.img) + '" alt="' + esc(o.name || '') + '" loading="lazy">';
    } else {
      inner += '<div class="' + phCls + '"><i class="fa fa-vcard-o"></i></div>';
    }
    if (o.rarity) {
      inner += '<div class="ui-card__flag ui-card__flag--tl">' + tag(o.rarity, String(o.rarity).toLowerCase()) + '</div>';
    }
    if (o.className) {
      inner += '<div class="ui-card__flag ui-card__flag--tr">' + tag(o.className, o.classTone) + '</div>';
    }
    if (o.overlay) inner += '<div class="ui-card__overlay">' + o.overlay + '</div>';
    inner += '</div>';
    inner += '<div class="ui-card__body">';
    inner += '<div class="ui-card__row">' +
      '<span class="ui-card__name">' + esc(o.name || '') + '</span>' +
      (o.level != null ? '<span class="ui-card__lv">Lv.' + esc(o.level) + '</span>' : '') +
      '</div>';
    if (o.maxStars) inner += starRow(o.stars || 0, o.maxStars);
    if (o.power != null) {
      inner += '<div class="ui-card__power"><i class="fa fa-bolt mr-1"></i>' + esc(o.power) + '</div>';
    }
    if (o.extra) inner += o.extra;
    inner += '</div>';
    return '<div class="ui-card' + (o.pop ? ' ui-card--pop' : '') +
      (o.selected ? ' ui-card--selected' : '') +
      (o.disabled ? ' ui-card--disabled' : '') + ' ui-card--tappable"' +
      (o.id ? ' data-char-id="' + esc(o.id) + '"' : '') +
      (o.rarity ? ' data-rarity="' + esc(String(o.rarity).toLowerCase()) + '"' : '') +
      '>' + inner + '</div>';
  }

  /* ── 弹窗 ──────────────────────────────────────────────────
     openModal({ title, body(html|string), actions:[{label, tone, onClick(close)}],
                 onClose, dismissible }) → close() */
  function openModal(opts) {
    const o = opts || {};
    const wrap = document.createElement('div');
    wrap.className = 'ui-modal';
    let actionsHtml = '';
    (o.actions || []).forEach((a, i) => {
      const tone = a.tone === 'gold' ? 'gold' : a.tone || 'primary';
      const cls = tone === 'gold' ? 'ui-btn--gold' : tone === 'ghost' ? 'ui-btn--ghost' :
        tone === 'danger' ? 'ui-btn--danger' : 'ui-btn--primary';
      actionsHtml += '<button type="button" class="ui-btn ' + cls + '" data-act="' + i + '">' + esc(a.label) + '</button>';
    });
    wrap.innerHTML =
      '<div class="ui-modal__dialog" role="dialog" aria-modal="true">' +
      '<div class="ui-modal__header"><span>' + esc(o.title || '') + '</span>' +
      '<button type="button" class="ui-modal__close" aria-label="关闭"><i class="fa fa-times"></i></button></div>' +
      '<div class="ui-modal__body">' + (o.body || '') + '</div>' +
      (o.actions && o.actions.length ? '<div class="ui-modal__footer">' + actionsHtml + '</div>' : '') +
      '</div>';

    const close = () => {
      wrap.classList.remove('ui-modal--open');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => wrap.remove(), 320);
      if (typeof o.onClose === 'function') o.onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape' && o.dismissible !== false) close(); };

    wrap.querySelector('.ui-modal__close').addEventListener('click', () => {
      if (o.dismissible !== false) close();
    });
    if (o.dismissible !== false) {
      wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    }
    (o.actions || []).forEach((a, i) => {
      wrap.querySelector('[data-act="' + i + '"]').addEventListener('click', () => {
        if (typeof a.onClick === 'function') a.onClick(close);
        else close();
      });
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('ui-modal--open'));
    return close;
  }

  /* ── 轻提示 ────────────────────────────────────────────────
     toast(msg, tone('success'|'danger'|'warning'|''), durationMs) */
  function toast(msg, tone, duration) {
    let wrap = document.querySelector('.ui-toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'ui-toast-wrap';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = 'ui-toast';
    if (tone) el.dataset.tone = tone;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => {
      el.classList.add('ui-toast--out');
      setTimeout(() => el.remove(), 320);
    }, duration || 2200);
  }

  /* ── 确认弹窗（openModal 的常用封装）───────────────────── */
  function confirmModal(opts) {
    const o = opts || {};
    return openModal({
      title: o.title || '确认',
      body: o.body || '',
      actions: [
        { label: o.cancelText || '取消', tone: 'ghost' },
        { label: o.okText || '确定', tone: o.okTone || 'primary', onClick: (close) => { close(); if (typeof o.onOk === 'function') o.onOk(); } }
      ]
    });
  }

  const api = { esc, starRow, tag, progress, charCard, openModal, confirmModal, toast };
  if (window.Game && window.Game.ui) window.Game.ui.components = api;
  window.__uiComponents = api;
})();
