/* ════════════════════════════════════════════════════════════════
   幻卡传说 · 角色档案 / 好感 / 剧情演出 界面层（E5 · 2026-09-16）
   ────────────────────────────────────────────────────────────────
   挂载点：图鉴页（#codexRoot）的第三个子 tab「档案」。本文件**不接页面
   切换**——只在 ui/codex.js 渲染出 tab 内容后注入 HTML 并自己绑事件，
   因此 codex.js 的改动只有"多一个 tab + 一个分支"。

   与 domain/favor.js 的分工：
     domain → 好感 XP / 等级 / 加成 / 解锁判定（唯一真相源）
     ui     → 只渲染 + 转发点击（不改存档，除了 domain 那一个入口）

   三类界面：
     ① 档案列表    —— 角色网格：好感等级条 + 称谓 + 剧情进度
     ② 档案浮层    —— 立绘 + 称号/标签/座右铭/档案 + 好感操作 + 章节列表
     ③ 剧情演出    —— 全屏立绘 + 逐句对白，结束才结算好感（幂等）

   为什么剧情要"读完才给好感"：读一半跑掉不该算数，而且这样"看剧情"
   本身就是推好感的手段 —— 不花钱的玩家也有进度感。
   ════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  /** 列表筛选（界面态，不进存档） */
  let filterMode = 'all';        // all | story | touched
  let archiveEl = null;          // 档案浮层根节点
  let archiveId = null;
  let storyEl = null;            // 剧情演出根节点
  let storyState = null;
  let rootBound = false;

  const favorApi = () => (window.__favor || (window.Game && window.Game.domain && window.Game.domain.favor) || null);
  const uiComp = () => (window.__uiComponents || (window.Game && window.Game.ui && window.Game.ui.components) || null);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmt(n) { return Math.floor(Number(n) || 0).toLocaleString(); }
  function classNameOf(c) { return (typeof window.getClassName === 'function') ? window.getClassName(c) : c; }
  function factionNameOf(f) { return (typeof window.getFactionName === 'function') ? window.getFactionName(f) : f; }

  function toast(msg, tone) {
    const C = uiComp();
    if (C && C.toast) C.toast(msg, tone || '');
    else if (window.uiToast) window.uiToast(msg, tone);
  }

  function afterChange() {
    if (typeof window.updateUI === 'function') window.updateUI();
    if (typeof window.refreshRedDots === 'function') window.refreshRedDots();
  }

  /* ── ① 档案列表 ───────────────────────────────────────────── */

  function overviewHtml(ov) {
    const C = uiComp();
    const bar = (C && C.progress) ? C.progress(ov.readPct, 'accent', true) : '';
    return `<div class="ui-favor__sum ui-panel ui-panel--loose mb-4">` +
      `<div class="ui-favor__sum-main">` +
        `<div class="ui-favor__sum-label">已建立好感</div>` +
        `<div class="ui-favor__sum-pct">${fmt(ov.touched)}<span> / ${fmt(ov.total)}</span>` +
          `<span class="ui-favor__sum-count">最高 Lv.${fmt(ov.highest)}</span></div>` +
      `</div>` +
      `<div class="ui-favor__sum-extra">` +
        `可读剧情 <b>${fmt(ov.storyChars)}</b> 名角色 · 已读 ${fmt(ov.readTotal)}/${fmt(ov.chaptersTotal)} 章` +
      `</div>` +
      `<div class="ui-favor__bar">${bar}</div>` +
      `</div>`;
  }

  function filterHtml() {
    const chip = (key, label) =>
      `<button type="button" class="ui-favor__chip${filterMode === key ? ' is-active' : ''}" data-favor-filter="${esc(key)}">${esc(label)}</button>`;
    return `<div class="ui-favor__chips">` +
      chip('all', '全部') + chip('story', '有专属剧情') + chip('touched', '已建立好感') +
      `</div>`;
  }

  function cellHtml(s) {
    const C = uiComp();
    const p = s.progress;
    if (!C || typeof C.charCard !== 'function') return '';
    const bar = C.progress(Math.round(p.pct * 100), p.isMax ? 'gold' : 'accent', !p.isMax);
    const readN = s.chapters.filter(c => c.read).length;
    const chTotal = s.chapters.length;
    const chText = chTotal ? `${readN}/${chTotal} 章` : '档案';
    const extra =
      `<div class="ui-favor__bar">${bar}</div>` +
      `<div class="ui-favor__cell-meta">` +
        `<span class="ui-favor__cell-lv">Lv.${fmt(p.level)}</span>` +
        `<span class="ui-favor__cell-title">${esc(p.title)}</span>` +
        `<span class="ui-favor__cell-ch">${esc(chText)}</span>` +
      `</div>`;
    return C.charCard({
      id: s.id, name: s.name, rarity: s.rarity,
      className: classNameOf(s.className), classTone: s.className,
      img: s.imageUrl, square: true,
      extra,
      overlay: s.persona.hasStory ? `<div class="ui-favor__story-flag"><i class="fa fa-book"></i></div>` : ''
    });
  }

  function listEntries() {
    const api = favorApi();
    if (!api) return [];
    const out = [];
    api.allIds().forEach(id => {
      const s = api.summary(id);
      if (filterMode === 'story' && !s.persona.hasStory) return;
      if (filterMode === 'touched' && s.progress.level <= 1 && !s.progress.xp) return;
      out.push(s);
    });
    // 有专属剧情的排前面，其余保持模板顺序（图鉴顺序一致），保证"值得看的人"优先露出
    out.sort((a, b) => (b.persona.hasStory ? 1 : 0) - (a.persona.hasStory ? 1 : 0));
    return out;
  }

  function renderFavorPanel() {
    const api = favorApi();
    if (!api) return `<div class="ui-favor__empty">好感数据未就绪</div>`;
    const ov = api.overview();
    const list = listEntries();
    const grid = list.length
      ? `<div class="ui-favor__grid" id="favorGrid">${list.map(cellHtml).join('')}</div>`
      : `<div class="ui-favor__empty">没有符合条件的角色</div>`;
    return overviewHtml(ov) + filterHtml() + grid;
  }

  /* ── ② 档案浮层 ───────────────────────────────────────────── */

  function giftBtnHtml(g, gold) {
    const can = gold >= g.gold;
    return `<button type="button" class="ui-archive__gift${can ? '' : ' is-poor'}" data-favor-gift="${esc(g.id)}"${can ? '' : ' disabled'}>` +
      `<span class="ui-archive__gift-name"><i class="fa ${esc(g.icon)}"></i>${esc(g.name)}</span>` +
      `<span class="ui-archive__gift-cost">${fmt(g.gold)} 金 → 好感 +${fmt(g.xp)}</span>` +
      `</button>`;
  }

  function chapterHtml(c, s) {
    const C = uiComp();
    const cls = 'ui-archive__chapter' + (c.unlocked ? '' : ' is-locked') + (c.read ? ' is-read' : '');
    const sub = !c.unlocked
      ? `<span class="ui-archive__ch-lock"><i class="fa fa-lock"></i> 好感 Lv.${fmt(c.unlockLevel)} 解锁</span>`
      : (c.read ? `<span class="ui-archive__ch-read"><i class="fa fa-check"></i> 已读</span>` : `<span class="ui-archive__ch-new">未读 · 首次阅读 +好感</span>`);
    const btn = c.unlocked
      ? `<button type="button" class="ui-btn ui-btn--sm ${c.read ? 'ui-btn--ghost' : 'ui-btn--primary'}" data-favor-chapter="${fmt(c.index)}">${c.read ? '重看' : '阅读'}</button>`
      : `<button type="button" class="ui-btn ui-btn--sm ui-btn--ghost" disabled>未解锁</button>`;
    return `<div class="${cls}" data-ch="${fmt(c.index)}">` +
      `<div class="ui-archive__ch-head">` +
        `<span class="ui-archive__ch-num">${fmt(c.index + 1)}</span>` +
        `<span class="ui-archive__ch-title">${esc(c.title)}</span>` +
      `</div>` +
      `<div class="ui-archive__ch-foot">${sub}${btn}</div>` +
      `</div>`;
  }

  function archiveBodyHtml(s) {
    const C = uiComp();
    const p = s.progress;
    const persona = s.persona;
    const gold = (function () {
      try { return Number(gameData && gameData.player && gameData.player.gold) || 0; }
      catch (e) { return 0; }
    })();

    const tags =
      C.tag(s.rarity, String(s.rarity).toLowerCase()) +
      C.tag(classNameOf(s.className), s.className) +
      C.tag(factionNameOf(s.faction), '');

    const traits = (persona.traits || []).map(t => `<span class="ui-archive__trait">${esc(t)}</span>`).join('');

    const bar = C.progress(Math.round(p.pct * 100), p.isMax ? 'gold' : 'accent', !p.isMax);
    const bonus = s.bonus && s.bonus.atkPercent
      ? `<span class="ui-favor__bonus"><i class="fa fa-bolt"></i> 属性加成 攻/防/生 +${esc(s.bonus.atkPercent)}%</span>`
      : `<span class="ui-favor__bonus is-off">属性加成 Lv.2 起生效</span>`;

    const routineBtn = s.canRoutine
      ? `<button type="button" class="ui-btn ui-btn--sm ui-btn--primary" data-favor-routine="1"><i class="fa fa-comments-o"></i> 谈心 +${fmt(s.routineXp)}</button>`
      : `<button type="button" class="ui-btn ui-btn--sm ui-btn--ghost" disabled>今日已谈心</button>`;

    const chapters = s.chapters.length
      ? `<div class="ui-archive__chapters">${s.chapters.map(c => chapterHtml(c, s)).join('')}</div>`
      : `<div class="ui-favor__empty">${esc(persona.name)} 的专属剧情还在书写中 —— 档案先收下了。</div>`;

    return `<div class="ui-archive__hero">` +
        `<img class="ui-archive__img" src="${esc(s.imageUrl || '')}" alt="${esc(s.name)}">` +
        `<div class="ui-archive__meta">` +
          `<div class="ui-archive__name">${esc(s.name)}</div>` +
          `<div class="ui-archive__tags">${tags}</div>` +
          `<div class="ui-archive__title">「${esc(persona.title)}」</div>` +
          `<div class="ui-archive__traits">${traits}</div>` +
          `<div class="ui-archive__quote">${esc(persona.quote)}</div>` +
        `</div>` +
      `</div>` +
      `<div class="ui-archive__profile">${esc(persona.profile)}</div>` +
      `<div class="ui-archive__sec">` +
        `<div class="ui-archive__sec-title"><i class="fa fa-heart text-primary mr-2"></i>好感 · Lv.${fmt(p.level)} ${esc(p.title)}</div>` +
        `<div class="ui-favor__bar">${bar}</div>` +
        `<div class="ui-archive__favor-head">` +
          `<span>${p.isMax ? '好感已满' : `${fmt(p.into)} / ${fmt(p.need)}（距下一级 ${fmt(p.toNext)}）`}</span>` +
          bonus +
        `</div>` +
        `<div class="ui-archive__actions">` + routineBtn + `</div>` +
        `<div class="ui-archive__gifts">${s.gifts.map(g => giftBtnHtml(g, gold)).join('')}</div>` +
        `<div class="ui-archive__gold">当前金币：<b>${fmt(gold)}</b> · 已赠礼 ${fmt(s.giftsGiven)} 次</div>` +
      `</div>` +
      `<div class="ui-archive__sec">` +
        `<div class="ui-archive__sec-title"><i class="fa fa-book text-primary mr-2"></i>档案剧情</div>` +
        chapters +
      `</div>`;
  }

  function closeArchive() {
    if (!archiveEl) return;
    const el = archiveEl;
    archiveEl = null;
    archiveId = null;
    el.classList.remove('is-open');
    setTimeout(() => el.remove(), 240);
  }

  function openArchive(id) {
    const api = favorApi();
    if (!api || !id) return;
    const s = api.summary(id);
    if (!s || !s.name) return;
    closeArchive();
    archiveId = id;

    const el = document.createElement('div');
    el.className = 'ui-archive';
    el.dataset.favorArchive = id;
    el.innerHTML =
      `<div class="ui-archive__panel" role="dialog" aria-modal="true">` +
        `<button type="button" class="ui-archive__close" data-favor-close="1" aria-label="关闭"><i class="fa fa-times"></i></button>` +
        archiveBodyHtml(s) +
      `</div>`;
    document.body.appendChild(el);
    archiveEl = el;
    requestAnimationFrame(() => el.classList.add('is-open'));
  }

  function refreshArchive() {
    if (!archiveEl || !archiveId) return;
    const api = favorApi();
    if (!api) return;
    const s = api.summary(archiveId);
    const panel = archiveEl.querySelector('.ui-archive__panel');
    if (!panel) return;
    panel.innerHTML =
      `<button type="button" class="ui-archive__close" data-favor-close="1" aria-label="关闭"><i class="fa fa-times"></i></button>` +
      archiveBodyHtml(s);
  }

  /* ── ③ 剧情演出 ───────────────────────────────────────────── */

  function closeStory() {
    if (!storyEl) return;
    const el = storyEl;
    storyEl = null;
    storyState = null;
    el.classList.remove('is-open');
    setTimeout(() => el.remove(), 200);
  }

  function storyRender() {
    if (!storyEl || !storyState) return;
    const st = storyState;
    const line = st.lines[st.pos] || null;
    const img = st.imageUrl || '';
    const isEnd = !line;
    const body = isEnd
      ? `<div class="ui-story__end">` +
          `<div class="ui-story__end-title">本章完</div>` +
          (st.firstRead
            ? `<div class="ui-story__end-gain">好感 +${fmt(st.gain)}${st.levelUp ? ` · 升到 Lv.${fmt(st.newLevel)}` : ''}</div>`
            : `<div class="ui-story__end-gain is-none">（已读过，本次不再增加好感）</div>`) +
          `<button type="button" class="ui-btn ui-btn--primary" data-story-done="1">回到档案</button>` +
        `</div>`
      : `<div class="ui-story__who">${esc(line.who || '')}</div>` +
        `<div class="ui-story__text">${esc(line.text || '')}</div>` +
        `<div class="ui-story__hint">${st.pos + 1}/${st.lines.length} · 点击继续 <i class="fa fa-angle-right"></i></div>`;

    storyEl.innerHTML =
      `<div class="ui-story__top">` +
        `<span class="ui-story__chapter">${esc(st.chapterTitle)}</span>` +
        `<button type="button" class="ui-story__skip" data-story-skip="1">跳过</button>` +
      `</div>` +
      `<div class="ui-story__stage">` +
        (img ? `<img class="ui-story__img" src="${esc(img)}" alt="">` : '') +
      `</div>` +
      `<div class="ui-story__box">${body}</div>`;
  }

  function storyAdvance() {
    if (!storyState) return;
    if (storyState.pos >= storyState.lines.length) return;
    storyState.pos += 1;
    storyRender();
  }

  function storyFinish() {
    if (!storyState || storyState.pos < storyState.lines.length) return;
    const st = storyState;
    if (st.settled) return;
    st.settled = true;
    const api = favorApi();
    if (!api) return;
    const r = api.markRead(st.id, st.index);
    if (r && r.ok) {
      st.firstRead = true;
      st.gain = r.xpGain;
      st.levelUp = r.levelUp;
      st.newLevel = api.levelOf(st.id);
      afterChange();
    } else {
      st.firstRead = false;
    }
    storyRender();
    refreshArchive();
  }

  function openChapter(id, index) {
    const api = favorApi();
    if (!api || !id) return;
    const s = api.summary(id);
    const ch = s.chapters.filter(c => c.index === Number(index))[0];
    if (!ch) return;
    if (!ch.unlocked) { toast(`好感 Lv.${ch.unlockLevel} 才能解锁这一章`, 'warning'); return; }

    closeStory();
    const el = document.createElement('div');
    el.className = 'ui-story';
    document.body.appendChild(el);
    storyEl = el;
    storyState = {
      id, index: Number(index), lines: ch.lines, pos: 0,
      chapterTitle: ch.title, imageUrl: s.imageUrl,
      settled: false, firstRead: false, gain: 0, levelUp: 0, newLevel: s.progress.level
    };
    storyRender();
    requestAnimationFrame(() => el.classList.add('is-open'));
  }

  /* ── 事件（自绑 #codexRoot + body 级浮层事件） ────────────── */

  function onRootClick(e) {
    const t = e.target;
    if (!t || !t.closest) return;

    const chip = t.closest('[data-favor-filter]');
    if (chip) {
      filterMode = chip.getAttribute('data-favor-filter') || 'all';
      const root = document.getElementById('codexTabBody');
      if (root) root.innerHTML = renderFavorPanel();
      return;
    }

    if (t.closest('#favorGrid')) {
      const card = t.closest('[data-char-id]');
      if (card) { openArchive(card.getAttribute('data-char-id')); return; }
    }
  }

  function onBodyClick(e) {
    const t = e.target;
    if (!t || !t.closest) return;

    // 档案浮层
    if (archiveEl && archiveEl.contains(t)) {
      if (t.closest('[data-favor-close]')) { closeArchive(); return; }
      if (!archiveId) return;

      const gift = t.closest('[data-favor-gift]');
      if (gift && !gift.disabled) {
        const api = favorApi();
        const r = api.giveGift(archiveId, gift.getAttribute('data-favor-gift'));
        if (r.ok) {
          toast(`赠礼成功：好感 +${fmt(r.xpGain)}` + (r.levelUp ? ` · 好感升到 Lv.${fmt(api.levelOf(archiveId))}` : ''), 'gold', 2600);
          afterChange();
          refreshArchive();
        } else if (r.reason === 'gold') {
          toast(`金币不足，还差 ${fmt(r.need)}`, 'warning');
        } else if (r.reason === 'maxed') {
          toast('这名角色的好感已经满了', 'ghost');
        }
        return;
      }

      const routine = t.closest('[data-favor-routine]');
      if (routine && !routine.disabled) {
        const api = favorApi();
        const r = api.routine(archiveId);
        if (r.ok) {
          toast(`谈心 · 好感 +${fmt(r.xpGain)}${r.levelUp ? ` · 好感提升！` : ''}`, 'success', 2400);
          afterChange();
          refreshArchive();
        } else if (r.reason === 'done') {
          toast('今天已经聊过了，明天再来', 'ghost');
        } else if (r.reason === 'maxed') {
          toast('好感已满', 'ghost');
        }
        return;
      }

      const chBtn = t.closest('[data-favor-chapter]');
      if (chBtn && !chBtn.disabled) {
        openChapter(archiveId, Number(chBtn.getAttribute('data-favor-chapter')));
        return;
      }
      return;
    }

    // 剧情演出（点击任意处推进）
    if (storyEl && storyEl.contains(t)) {
      if (t.closest('[data-story-skip]')) { closeStory(); return; }
      if (t.closest('[data-story-done]')) { closeStory(); return; }
      storyAdvance();
      if (storyState && storyState.pos >= storyState.lines.length) storyFinish();
    }
  }

  function onBodyKey(e) {
    if (!e || e.key !== 'Escape') return;
    if (storyEl) { closeStory(); return; }
    if (archiveEl) { closeArchive(); }
  }

  function bindRoot() {
    if (rootBound) return;
    const root = document.getElementById('codexRoot');
    if (root) root.addEventListener('click', onRootClick);
    document.body.addEventListener('click', onBodyClick);
    document.addEventListener('keydown', onBodyKey);
    rootBound = true;
  }

  /* ── 初始化（红点） ───────────────────────────────────────── */

  function initFavor() {
    bindRoot();
    const reddot = window.__reddot;
    if (reddot && typeof reddot.register === 'function') {
      // 红点语义 =「有你可以读的东西」：有未读且已解锁的章节才亮，读完就熄。
      // 不做"今日还能谈心"这种天天亮的规则（红点疲劳，见 reddot.js 的反例清单）。
      reddot.register('favor', ['codex'], () => {
        const api = window.__favor;
        if (!api || typeof api.chaptersOf !== 'function') return false;
        return api.storyCharIds().some(id => {
          try { return api.chaptersOf(id).some(c => c.unlocked && !c.read); }
          catch (e) { return false; }
        });
      });
    }
  }

  const api = {
    renderFavorPanel, openArchive, closeArchive, openChapter, initFavor,
    get filter() { return filterMode; },
    setFilter(k) { filterMode = (k === 'story' || k === 'touched') ? k : 'all'; }
  };

  const segs = 'Game.ui.favor'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__favorUI = api;
  window.renderFavorPanel = renderFavorPanel;
  window.openCharArchive = openArchive;
  window.initFavor = initFavor;
})();
