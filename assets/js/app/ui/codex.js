/* ════════════════════════════════════════════════════════════════
   幻卡传说 · 图鉴与成就界面层（Stage 1 · C8）
   ────────────────────────────────────────────────────────────────
   第 5 个页面（首页 / 抽卡 / 养成 / 战斗 / 图鉴），页内两个子 tab：
     · 角色图鉴 —— 收集率 + 稀有度筛选 + 角色网格（未收录显示暗色剪影）
     · 成就     —— 分组列表 + 一键领取
   数值全在 domain/codex.js 与 domain/achievements.js（单源），本文件只渲染
   与转发点击，不直接改存档。

   交互口径：
   · 未收录的格子**仍然显示角色名**（只压暗立绘）。图鉴的目的是「告诉你还缺谁」
     —— 名字糊成 ??? 只会让玩家不知道下一个目标，收集欲反而更低。
   · 点已收录角色 → 弹出详情（属性 / 技能 / 首次收录时间）。
   · 点未收录角色 → toast 提示，不开空弹窗。
   ════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  /** 页内 tab（界面态，不进存档） */
  let activeTab = 'codex';
  /** 图鉴筛选（界面态） */
  let filterRarity = 'all';
  let filterOwned = 'all';
  let inited = false;

  const uiComp = () => (window.__uiComponents || (window.Game && window.Game.ui && window.Game.ui.components) || null);
  const codexApi = () => (window.__codex || (window.Game && window.Game.domain && window.Game.domain.codex) || null);
  const achApi = () => (window.__achievements || (window.Game && window.Game.domain && window.Game.domain.achievements) || null);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmt(n) { return Math.floor(Number(n) || 0).toLocaleString(); }

  function classNameOf(c) { return (typeof window.getClassName === 'function') ? window.getClassName(c) : c; }
  function factionNameOf(f) { return (typeof window.getFactionName === 'function') ? window.getFactionName(f) : f; }

  function materialName(key) {
    const mats = window.__materials;
    if (mats && typeof mats.getMaterialMeta === 'function') {
      const m = mats.getMaterialMeta(key);
      if (m && m.name) return m.name;
    }
    return key;
  }

  function dateText(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function rewardHtml(rw) {
    const parts = [];
    if (!rw) return '<span class="ui-codex__noreward">-</span>';
    if (rw.gold) parts.push(`<span class="ui-codex__rw" data-tone="gold"><i class="fa fa-money"></i>${fmt(rw.gold)}</span>`);
    if (rw.gems) parts.push(`<span class="ui-codex__rw" data-tone="gem"><i class="fa fa-diamond"></i>${fmt(rw.gems)}</span>`);
    Object.keys(rw.materials || {}).forEach(k => {
      parts.push(`<span class="ui-codex__rw" data-tone="mat"><i class="fa fa-cube"></i>${esc(materialName(k))} ${fmt(rw.materials[k])}</span>`);
    });
    return parts.length ? parts.join('') : '<span class="ui-codex__noreward">-</span>';
  }

  /* ── 图鉴：收集率总览 ─────────────────────────────────────── */

  function overviewHtml(s) {
    const C = uiComp();
    const bar = (C && C.progress) ? C.progress(s.pct, s.pct >= 100 ? 'success' : 'accent', s.pct < 100) : '';
    const rarityBadges = (codexApi() ? codexApi().rarityRows() : []).map(r =>
      `<span class="ui-codex__rar" data-rarity="${esc(String(r.rarity).toLowerCase())}">` +
      `${esc(r.rarity)} <b>${fmt(r.owned)}</b><span class="ui-codex__rar-total">/${fmt(r.total)}</span></span>`
    ).join('');

    return `<div class="ui-panel ui-panel--loose mb-4">` +
      `<div class="ui-codex__sum">` +
        `<div class="ui-codex__sum-main">` +
          `<div class="ui-codex__sum-label">图鉴收集率</div>` +
          `<div class="ui-codex__sum-pct">${s.pct}<span>%</span>` +
            `<span class="ui-codex__sum-count">已收录 ${fmt(s.owned)} / ${fmt(s.total)}</span></div>` +
        `</div>` +
        `<div class="ui-codex__sum-missing">还差 <b>${fmt(s.missing)}</b> 名</div>` +
      `</div>` +
      `<div class="ui-codex__bar">${bar}</div>` +
      `<div class="ui-codex__rars">${rarityBadges}</div>` +
      `</div>`;
  }

  /* ── 图鉴：筛选栏 ─────────────────────────────────────────── */

  function filterHtml() {
    const apis = codexApi();
    const rarities = apis ? apis.RARITY_ORDER : ['SUR', 'UR', 'SSR', 'SR', 'R'];
    const rarBtn = (key, label) =>
      `<button type="button" class="ui-codex__chip${filterRarity === key ? ' is-active' : ''}" data-codex-rarity="${esc(key)}">${esc(label)}</button>`;
    const ownBtn = (key, label) =>
      `<button type="button" class="ui-codex__chip${filterOwned === key ? ' is-active' : ''}" data-codex-owned="${esc(key)}">${esc(label)}</button>`;

    return `<div class="ui-codex__filters">` +
      `<div class="ui-codex__filter-row">${rarBtn('all', '全部')}${rarities.map(r => rarBtn(r, r)).join('')}</div>` +
      `<div class="ui-codex__filter-row">${ownBtn('all', '全部')}${ownBtn('owned', '已收录')}${ownBtn('missing', '未收录')}</div>` +
      `</div>`;
  }

  /* ── 图鉴：角色网格 ───────────────────────────────────────── */

  function visibleEntries() {
    const apis = codexApi();
    if (!apis) return [];
    return apis.entries().filter(e => {
      if (filterRarity !== 'all' && e.rarity !== filterRarity) return false;
      if (filterOwned === 'owned' && !e.owned) return false;
      if (filterOwned === 'missing' && e.owned) return false;
      return true;
    });
  }

  function cardHtml(e) {
    const C = uiComp();
    const img = e.imageUrl || (window.__sprites ? window.__sprites.portraitPlaceholder(e.name, e.rarity) : '');
    if (!C || typeof C.charCard !== 'function') {
      return `<div class="ui-card" data-rarity="${esc(String(e.rarity).toLowerCase())}" data-codex-card="${esc(e.id)}">` +
        `<div class="ui-card__media"><img class="ui-card__img ui-card__img--square" src="${esc(img)}" alt=""></div>` +
        `<div class="ui-card__body"><div class="ui-card__row"><span class="ui-card__name">${esc(e.name)}</span></div></div></div>`;
    }
    return C.charCard({
      id: e.id,
      name: e.name,
      rarity: e.rarity,
      className: classNameOf(e.className),
      classTone: e.className,
      img,
      square: true,
      dim: !e.owned,
      extra: `<div class="ui-codex__flag">${e.owned ? '<span class="ui-codex__own"><i class="fa fa-check"></i>已收录</span>' : '<span class="ui-codex__lock"><i class="fa fa-lock"></i>未收录</span>'}</div>`
    });
  }

  function gridHtml() {
    const list = visibleEntries();
    if (!list.length) return `<div class="ui-codex__empty">没有符合筛选条件的角色</div>`;
    return `<div class="ui-codex__grid" id="codexGrid">${list.map(cardHtml).join('')}</div>`;
  }

  function codexPanelHtml() {
    const apis = codexApi();
    if (!apis) return `<div class="ui-codex__empty">图鉴数据未就绪</div>`;
    const s = apis.summary();
    return overviewHtml(s) + filterHtml() + gridHtml();
  }

  /* ── 成就面板 ─────────────────────────────────────────────── */

  function achRowHtml(a) {
    const C = uiComp();
    const bar = (C && C.progress) ? C.progress(a.pct, a.claimed ? 'muted' : (a.done ? 'success' : 'accent'), !a.done && !a.claimed) : '';
    let btn;
    if (a.claimed) btn = `<button type="button" class="ui-btn ui-btn--sm ui-btn--ghost ui-achieve__btn" disabled>已领取</button>`;
    else if (a.claimable) btn = `<button type="button" class="ui-btn ui-btn--sm ui-btn--gold ui-achieve__btn" data-ach="${esc(a.id)}" data-act="claim">领取</button>`;
    else btn = `<button type="button" class="ui-btn ui-btn--sm ui-btn--ghost ui-achieve__btn" disabled>进行中</button>`;

    return `<div class="ui-achieve${a.claimed ? ' ui-achieve--done' : ''}${a.claimable ? ' ui-achieve--ready' : ''}" data-ach-row="${esc(a.id)}">` +
      `<div class="ui-achieve__head">` +
        `<span class="ui-achieve__name">${esc(a.name)}${a.claimed ? '<i class="fa fa-check ui-achieve__check"></i>' : ''}</span>` +
        `<span class="ui-achieve__count">${fmt(a.cur)}/${fmt(a.target)}</span>` +
      `</div>` +
      `<div class="ui-achieve__desc">${esc(a.desc)}</div>` +
      `<div class="ui-achieve__bar">${bar}</div>` +
      `<div class="ui-achieve__foot">` +
        `<span class="ui-achieve__reward">${rewardHtml(a.reward)}</span>` +
        btn +
      `</div>` +
      `</div>`;
  }

  function achievePanelHtml() {
    const api = achApi();
    if (!api) return `<div class="ui-codex__empty">成就数据未就绪</div>`;
    const C = uiComp();
    const sum = api.summary();
    const bar = (C && C.progress) ? C.progress(sum.pct, sum.pct >= 100 ? 'success' : 'accent', sum.pct < 100) : '';
    const groups = api.byGroup();

    const head = `<div class="ui-panel ui-panel--loose mb-4">` +
      `<div class="ui-codex__sum">` +
        `<div class="ui-codex__sum-main">` +
          `<div class="ui-codex__sum-label">成就进度</div>` +
          `<div class="ui-codex__sum-pct">${sum.pct}<span>%</span>` +
            `<span class="ui-codex__sum-count">已达成 ${fmt(sum.done)} / ${fmt(sum.total)}</span></div>` +
        `</div>` +
        `<div class="ui-codex__sum-missing">已领取 <b>${fmt(sum.claimed)}</b></div>` +
      `</div>` +
      `<div class="ui-codex__bar">${bar}</div>` +
      `<button id="achClaimAllBtn" class="ui-btn ${sum.claimable > 0 ? 'ui-btn--gold' : 'ui-btn--ghost opacity-50'} w-full mt-3"${sum.claimable > 0 ? '' : ' disabled'}>` +
        `${sum.claimable > 0 ? `一键领取 (${sum.claimable})` : '暂无可领取'}</button>` +
      `</div>`;

    const body = groups.map(g => {
      const items = g.items.map(achRowHtml).join('');
      return `<div class="ui-achieve__group">` +
        `<div class="ui-achieve__group-head" data-tone="${esc(g.def.tone || 'primary')}">` +
        `<i class="fa ${esc(g.def.icon || 'fa-star')}"></i>` +
        `<span class="ui-achieve__group-name">${esc(g.def.name || g.key)}</span>` +
        `<span class="ui-achieve__group-count">${g.items.filter(a => a.done).length}/${g.items.length}</span>` +
        `</div>` +
        `<div class="ui-achieve__list">${items}</div>` +
        `</div>`;
    }).join('');

    return head + body;
  }

  /* ── 页面渲染 ─────────────────────────────────────────────── */

  function tabHtml() {
    const tab = (key, label, icon) =>
      `<button type="button" class="ui-codex__tab${activeTab === key ? ' is-active' : ''}" data-codex-tab="${esc(key)}">` +
      `<i class="fa ${icon}"></i><span>${esc(label)}</span></button>`;
    return `<div class="ui-codex__tabs">${tab('codex', '角色图鉴', 'fa-book')}${tab('achieve', '成就', 'fa-trophy')}${tab('favor', '档案', 'fa-heart')}</div>`;
  }

  /** E5：档案面板由 ui/favor.js 渲染（数值在 domain/favor.js），这里只转发 */
  function favorPanelHtml() {
    if (typeof window.renderFavorPanel === 'function') return window.renderFavorPanel();
    return `<div class="ui-favor__empty">档案数据未就绪</div>`;
  }

  function bodyHtml() {
    if (activeTab === 'achieve') return achievePanelHtml();
    if (activeTab === 'favor') return favorPanelHtml();
    return codexPanelHtml();
  }

  function renderCodexPage() {
    const root = document.getElementById('codexRoot');
    if (!root) return;
    const apis = codexApi();
    if (apis && typeof apis.sync === 'function') {
      // sync 是幂等的只增登记；只有真的补了新记录时才写盘（避免每次切页都落盘）
      const added = apis.sync();
      if (added > 0 && typeof window.saveGameProgress === 'function') window.saveGameProgress();
    }

    root.innerHTML =
      `<div class="flex items-center justify-between mb-3 gap-2">` +
        `<h2 class="text-lg md:text-xl font-bold flex items-center"><i class="fa fa-book text-primary mr-2"></i>图鉴与成就</h2>` +
        tabHtml() +
      `</div>` +
      `<div id="codexTabBody">${bodyHtml()}</div>`;

    bindGrid(root);
    return true;
  }

  function rerender() {
    renderCodexPage();
    if (typeof window.refreshRedDots === 'function') window.refreshRedDots();
  }

  /* ── 角色详情 ─────────────────────────────────────────────── */

  function openCharDetail(id) {
    const C = uiComp();
    const apis = codexApi();
    if (!C || !apis) return;
    const e = apis.entries().filter(x => x.id === id)[0];
    if (!e) return;
    if (!e.owned) {
      if (C.toast) C.toast(`「${e.name}」尚未收录 · 去召唤试试`, 'ghost');
      return;
    }

    const attrs = e.baseAttributes || {};
    const attrName = (k) => (typeof window.getAttributeName === 'function') ? window.getAttributeName(k) : k;
    const attrRows = ['attack', 'defense', 'health', 'speed']
      .filter(k => attrs[k] != null)
      .map(k => `<div class="ui-result-row"><span>${esc(attrName(k))}</span><span class="ui-result-row__val">${fmt(attrs[k])}</span></div>`)
      .join('');

    const skills = (e.skills || []).map(s =>
      `<div class="ui-codex__skill">` +
      `<div class="ui-codex__skill-name"><i class="fa fa-magic"></i>${esc(s.name)}</div>` +
      `<div class="ui-codex__skill-desc">${esc(s.description || '')}</div>` +
      `</div>`
    ).join('') || `<div class="text-xs text-gray-400">无技能数据</div>`;

    // 持有实例（有则是可养成状态，无则是"曾拥有"）
    const inst = (function () {
      try {
        if (typeof gameData !== 'undefined' && gameData && Array.isArray(gameData.characters)) {
          return gameData.characters.filter(c => c && c.id === id)[0] || null;
        }
      } catch (err) { /* TDZ */ }
      return null;
    })();

    const body =
      `<div class="ui-codex__detail-top">` +
        `<img class="ui-codex__detail-img${inst ? '' : ' is-dim'}" src="${esc(e.imageUrl || '')}" alt="">` +
        `<div class="ui-codex__detail-meta">` +
          `<div class="ui-codex__detail-name">${esc(e.name)}</div>` +
          `<div class="ui-codex__detail-tags">` +
            `<span class="ui-tag" data-tone="${esc(String(e.rarity).toLowerCase())}">${esc(e.rarity)}</span>` +
            `<span class="ui-tag" data-tone="${esc(e.className)}">${esc(classNameOf(e.className))}</span>` +
            `<span class="ui-tag">${esc(factionNameOf(e.faction))}</span>` +
          `</div>` +
          `<div class="ui-codex__detail-sub">` +
            (inst ? `Lv.${fmt(inst.level)} · ${fmt(inst.stars)} 星` : '当前未持有（图鉴记录保留）') +
            `<br>首次收录 ${esc(dateText(e.ownedAt))}` +
          `</div>` +
        `</div>` +
      `</div>` +
      `<div class="ui-result-block"><div class="ui-result-block__title">基础属性</div>${attrRows}</div>` +
      `<div class="ui-result-block mt-3"><div class="ui-result-block__title">技能</div>${skills}</div>`;

    document.querySelectorAll('.ui-modal').forEach(m => m.remove());
    C.openModal({
      title: '图鉴详情',
      body,
      actions: [
        {
          label: '查看档案', tone: 'primary',
          onClick: (close) => {
            close();
            // E5：从图鉴直接跳到档案浮层（先关弹窗再开，避免两层叠着）
            if (typeof window.openCharArchive === 'function') window.openCharArchive(id);
          }
        },
        { label: '关闭', tone: 'ghost' }
      ]
    });
  }

  /* ── 交互 ─────────────────────────────────────────────────── */

  function bindGrid(root) {
    if (root.__codexBound) return;
    root.__codexBound = true;
    root.addEventListener('click', onRootClick);
  }

  function onRootClick(e) {
    const t = e.target;
    if (!t || !t.closest) return;

    const tabBtn = t.closest('[data-codex-tab]');
    if (tabBtn) {
      activeTab = tabBtn.getAttribute('data-codex-tab') || 'codex';
      rerender();
      return;
    }

    const rarBtn = t.closest('[data-codex-rarity]');
    if (rarBtn) {
      filterRarity = rarBtn.getAttribute('data-codex-rarity') || 'all';
      rerender();
      return;
    }

    const ownBtn = t.closest('[data-codex-owned]');
    if (ownBtn) {
      filterOwned = ownBtn.getAttribute('data-codex-owned') || 'all';
      rerender();
      return;
    }

    const claimBtn = t.closest('[data-ach][data-act="claim"]');
    if (claimBtn && !claimBtn.disabled) {
      claimOne(claimBtn.getAttribute('data-ach'));
      return;
    }

    if (t.closest('#achClaimAllBtn') && !t.closest('#achClaimAllBtn').disabled) {
      claimAll();
      return;
    }

    const card = t.closest('[data-codex-card]') || t.closest('[data-char-id]');
    if (card && t.closest('#codexGrid')) {
      openCharDetail(card.getAttribute('data-codex-card') || card.getAttribute('data-char-id'));
      return;
    }
  }

  function claimOne(id) {
    const api = achApi();
    const C = uiComp();
    if (!api) return;
    const r = api.claim(id);
    if (!r || !r.ok) {
      if (C && C.toast) C.toast(r && r.reason === 'claimed' ? '这个成就已经领过啦' : '条件还没达成', 'ghost');
      return;
    }
    if (C && C.toast) C.toast(`「${r.achievement.name}」达成：${(r.given || []).join(' · ')}`, 'gold', 2800);
    afterChange();
  }

  function claimAll() {
    const api = achApi();
    const C = uiComp();
    if (!api) return;
    const r = api.claimAll();
    if (!r || !r.ok) {
      if (C && C.toast) C.toast('暂无可领取的成就奖励', 'ghost');
      return;
    }
    if (C && C.toast) C.toast(`领取 ${r.count} 项成就奖励：${(r.given || []).join(' · ')}`, 'gold', 3400);
    afterChange();
  }

  function afterChange() {
    if (typeof window.updateUI === 'function') window.updateUI();
    rerender();
    if (typeof window.renderDailyGoals === 'function') window.renderDailyGoals();
  }

  /* ── 初始化 ───────────────────────────────────────────────── */

  function initCodex() {
    const apis = codexApi();
    if (!apis) return;
    apis.sync();
    if (typeof window.saveGameProgress === 'function') window.saveGameProgress();

    renderCodexPage();

    // 红点：有可领取的成就时，底部「图鉴」按钮亮（语义 = 有东西可领）
    const reddot = window.__reddot;
    if (reddot && typeof reddot.register === 'function') {
      reddot.register('achievements', ['codex'], () => {
        const a = window.__achievements;
        return !!(a && typeof a.hasClaimable === 'function' && a.hasClaimable());
      });
    }

    inited = true;
  }

  const api = {
    renderCodexPage, initCodex, openCharDetail,
    get tab() { return activeTab; },
    setTab(k) { activeTab = (k === 'achieve' || k === 'favor') ? k : 'codex'; renderCodexPage(); },
    resetFilters() { filterRarity = 'all'; filterOwned = 'all'; }
  };

  const segs = 'Game.ui.codex'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__codexUI = api;

  window.renderCodexPage = renderCodexPage;
  window.initCodex = initCodex;
  window.openCodexCharDetail = openCharDetail;
})();
