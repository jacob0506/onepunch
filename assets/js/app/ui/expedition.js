/**
 * expedition UI —— E1 肉鸽远征界面（挂在「战斗」页的第 4 个模式 tab）
 *
 * 数值全部来自 domain/expedition.js（单源）；本文件只负责画与点，不写任何数值。
 * 弹窗 / 选择卡 / toast 一律走组件库（window.__uiComponents），不手写一次性 DOM。
 */
(() => {
  'use strict';

  const comp = () => (window.__uiComponents || (window.Game && window.Game.ui && window.Game.ui.components) || null);
  const ex = () => window.__expedition;
  function toast(msg, tone) {
    if (typeof window.uiToast === 'function') { window.uiToast(msg, tone); return; }
    const c = comp();
    if (c && typeof c.toast === 'function') c.toast(msg, tone);
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  let pickedTeam = [];          // 开局选人时的临时选择
  let practiceMode = false;     // 练习模式（不计入周奖励的话语见 domain 层，实际只做标记）

  /* ── 主面板 ─────────────────────────────────────────────────────────── */
  function renderExpeditionPanel(container) {
    const api = ex();
    const c = comp();
    if (!api || !c) return;
    const s = api.summary();
    if (!s) return;

    const wrap = document.createElement('div');
    wrap.className = 'space-y-3 pb-40';

    // 顶部概览：远征币 / 历史 / meta 按钮
    const head = document.createElement('div');
    head.className = 'ui-panel rounded-xl p-4 border border-gray-800';
    head.innerHTML =
      '<div class="flex items-center justify-between gap-3">' +
      '<div>' +
      '<div class="text-lg font-black">肉鸽远征</div>' +
      '<div class="text-[10px] text-gray-400 mt-1">镜像队伍 · 全员同一档位 · 生命跨节点累计 —— 冷门角色也能当核心</div>' +
      '</div>' +
      '<div class="text-right">' +
      '<div class="text-[10px] text-gray-400">远征币</div>' +
      '<div class="text-xl font-black" style="color:var(--c-primary)">' + s.coins + '</div>' +
      '</div>' +
      '</div>' +
      '<div class="grid grid-cols-3 gap-2 mt-3 text-center">' +
      '<div class="rounded-lg bg-gray-900 border border-gray-800 py-2"><div class="text-[10px] text-gray-500">累计远征</div><div class="font-black">' + s.runs + '</div></div>' +
      '<div class="rounded-lg bg-gray-900 border border-gray-800 py-2"><div class="text-[10px] text-gray-500">最深层数</div><div class="font-black">' + s.bestLayer + '</div></div>' +
      '<div class="rounded-lg bg-gray-900 border border-gray-800 py-2"><div class="text-[10px] text-gray-500">本周</div><div class="font-black">' + s.weekRuns + '</div></div>' +
      '</div>' +
      '<div class="flex gap-2 mt-3">' +
      '<button type="button" id="expMetaBtn" class="ui-btn ui-btn--ghost ui-btn--sm flex-1"><i class="fa fa-sitemap mr-1"></i>永久解锁</button>' +
      '<button type="button" id="expHistoryBtn" class="ui-btn ui-btn--ghost ui-btn--sm flex-1"><i class="fa fa-history mr-1"></i>战绩</button>' +
      '</div>';
    wrap.appendChild(head);

    if (s.run) wrap.appendChild(renderRun(s.run, s));
    else wrap.appendChild(renderIdle(s));

    container.appendChild(wrap);

    const metaBtn = wrap.querySelector('#expMetaBtn');
    if (metaBtn) metaBtn.addEventListener('click', () => openMetaPanel(s));
    const hisBtn = wrap.querySelector('#expHistoryBtn');
    if (hisBtn) hisBtn.addEventListener('click', () => openHistoryPanel(s));
  }

  /* ── 未开局：开始远征 ─────────────────────────────────────────────── */
  function renderIdle(s) {
    const el = document.createElement('div');
    el.className = 'ui-panel rounded-xl p-4 border border-gray-800 text-center';
    const last = s.lastRun;
    el.innerHTML =
      '<div class="text-sm font-bold mb-1">选择 6 名角色开始远征</div>' +
      '<div class="text-[10px] text-gray-400 mb-3">远征中全员统一到镜像档位（等级 ' + ((s.run && s.run.tier && s.run.tier.level) || '-') + ' / ' + mirrorStarsText() + '星），主线练度不带入 —— 只看角色与祝福的搭配</div>' +
      (last ? '<div class="text-[11px] mb-3" style="color:var(--c-text-dim)">上局：' + resultText(last.result) + ' · 第 ' + last.layers + ' 层 · 清除 ' + last.cleared + ' 节点 · +' + last.coins + ' 币</div>' : '') +
      '<div class="flex items-center justify-center gap-2 mb-3">' +
      '<label class="flex items-center gap-1 text-[11px] text-gray-400 cursor-pointer">' +
      '<input type="checkbox" id="expPractice" ' + (practiceMode ? 'checked' : '') + '> 练习模式（不领取远征币，随时重来）' +
      '</label>' +
      '</div>' +
      '<button type="button" id="expStartBtn" class="ui-btn ui-btn--primary w-full"><i class="fa fa-compass mr-1"></i>选择队伍 · 开始远征</button>';
    setTimeout(() => {
      const start = el.querySelector('#expStartBtn');
      if (start) start.addEventListener('click', () => openTeamPicker());
      const pr = el.querySelector('#expPractice');
      if (pr) pr.addEventListener('change', () => { practiceMode = !!pr.checked; });
    }, 0);
    return el;
  }

  function mirrorStarsText() {
    const api = ex();
    try { return api.cfg().mirrorStars; } catch (e) { return 3; }
  }

  function resultText(r) {
    return r === 'clear' ? '通关' : r === 'defeat' ? '阵败' : '放弃';
  }

  /* ── 进行中：队伍 + 祝福 + 地图 ───────────────────────────────────── */
  function renderRun(run, s) {
    const el = document.createElement('div');
    el.className = 'space-y-3';

    // 队伍
    const team = document.createElement('div');
    team.className = 'ui-panel rounded-xl p-3 border border-gray-800';
    team.innerHTML = '<div class="text-[10px] font-bold text-gray-500 mb-2">远征队伍（生命跨节点累计）</div>'
      + '<div class="grid grid-cols-6 gap-2">'
      + run.team.map(m => {
        const pct = Math.round((m.ratio || 0) * 100);
        const color = pct > 60 ? 'var(--c-success, #4ade80)' : pct > 25 ? '#facc15' : '#f87171';
        return '<div class="text-center">'
          + '<div class="relative rounded-lg overflow-hidden bg-gray-900 border border-gray-800 aspect-square">'
          + '<img src="' + esc(m.imageUrl) + '" class="w-full h-full object-cover" alt="">'
          + (pct <= 0 ? '<div class="absolute inset-0 flex items-center justify-center text-[10px] font-black" style="background:rgba(0,0,0,.65)">阵亡</div>' : '')
          + '</div>'
          + '<div class="mt-1 h-1 rounded bg-gray-800"><div style="width:' + pct + '%;height:100%;background:' + color + '"></div></div>'
          + '<div class="text-[9px] text-gray-500 truncate">' + esc(m.name) + '</div>'
          + '</div>';
      }).join('')
      + '</div>'
      + '<div class="flex items-center justify-between mt-3 text-[11px]">'
      + '<span class="text-gray-400">第 <b style="color:var(--c-primary)">' + (run.layer + 1) + '</b>/' + run.layers + ' 层 · 已清 ' + run.cleared + ' 节点</span>'
      + '<span style="color:var(--c-primary)">远征币 ' + run.coins + '</span>'
      + '</div>';
    el.appendChild(team);

    // 祝福
    if (run.blessings && run.blessings.length) {
      const bl = document.createElement('div');
      bl.className = 'ui-panel rounded-xl p-3 border border-gray-800';
      bl.innerHTML = '<div class="text-[10px] font-bold text-gray-500 mb-2">已获祝福（' + run.blessings.length + '）</div>'
        + '<div class="flex flex-wrap gap-2">'
        + run.blessings.map(b => '<span class="ui-tag" data-tone="gold" title="' + esc(b.desc) + '">' + esc(b.name) + '</span>').join('')
        + '</div>';
      el.appendChild(bl);
    }

    // 地图（从高到低显示，当前层高亮）
    const map = document.createElement('div');
    map.className = 'ui-panel rounded-xl p-3 border border-gray-800';
    const rows = run.map.slice().reverse().map((row, ri) => {
      const layer = run.layers - 1 - ri;
      const isCurrent = layer === run.layer;
      const isDone = layer < run.layer;
      return '<div class="mb-2 ' + (isCurrent ? '' : 'opacity-60') + '">'
        + '<div class="flex items-center gap-2 mb-1">'
        + '<span class="text-[10px] font-black ' + (isCurrent ? '' : 'text-gray-500') + '" ' + (isCurrent ? 'style="color:var(--c-primary)"' : '') + '>第 ' + (layer + 1) + ' 层</span>'
        + (isDone ? '<span class="text-[9px] text-gray-500">已通过</span>' : (isCurrent ? '<span class="text-[9px]" style="color:var(--c-primary)">选择一条路径</span>' : ''))
        + '</div>'
        + '<div class="grid grid-cols-' + Math.max(2, row.length) + ' gap-2">'
        + row.map(n => {
          const meta = (ex().NODE_META || {})[n.type] || {};
          const tone = n.type === 'boss' ? 'danger' : n.type === 'elite' ? 'gold' : n.type === 'rest' ? 'primary' : 'ghost';
          const disabled = !isCurrent;
          return '<button type="button" class="ui-btn ui-btn--sm ui-btn--' + tone + '" data-node="' + n.index + '" data-layer="' + layer + '"'
            + (disabled ? ' disabled' : '') + ' title="' + esc(meta.desc || '') + '">'
            + '<i class="fa ' + (meta.icon || 'fa-circle') + ' mr-1"></i>' + esc(meta.name || n.type)
            + '</button>';
        }).join('')
        + '</div></div>';
    }).join('');
    map.innerHTML = '<div class="text-[10px] font-bold text-gray-500 mb-2">远征路线</div>' + rows
      + '<div class="flex gap-2 mt-2">'
      + '<button type="button" id="expAbandonBtn" class="ui-btn ui-btn--danger ui-btn--sm flex-1"><i class="fa fa-sign-out mr-1"></i>放弃本局</button>'
      + '</div>';
    el.appendChild(map);

    // 日志
    if (run.log && run.log.length) {
      const log = document.createElement('div');
      log.className = 'ui-panel rounded-xl p-3 border border-gray-800';
      log.innerHTML = '<div class="text-[10px] font-bold text-gray-500 mb-1">远征日志</div>'
        + run.log.slice(-6).reverse().map(t => '<div class="text-[10px] text-gray-400">· ' + esc(t) + '</div>').join('');
      el.appendChild(log);
    }

    setTimeout(() => {
      map.querySelectorAll('[data-node]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-node'));
          onPickNode(idx);
        });
      });
      const ab = map.querySelector('#expAbandonBtn');
      if (ab) ab.addEventListener('click', () => {
        const c = comp();
        if (!c || typeof c.confirmModal !== 'function') return;
        c.confirmModal({
          title: '放弃本局？',
          body: '本局已获得的远征币将<b>不会</b>结算（放弃不带走收益）。',
          confirmLabel: '放弃',
          onConfirm: () => {
            const r = ex().abandon();
            if (r && r.ok) { toast('已放弃本局', 'ghost'); refresh(); }
          }
        });
      });
    }, 0);

    // 有待选祝福 ⇒ 立刻弹 3 选 1（刷新页面后回来也能接着选，不能靠重开逃避）
    if (run.pending && run.pending.length) {
      setTimeout(() => openBlessingPicker(run.pending), 350);
    }
    // 商店未关闭 ⇒ 恢复货架（同样不能靠刷新换货）
    if (run.pendingShop && run.pendingShop.stock && run.pendingShop.stock.length) {
      setTimeout(() => openShop(run.pendingShop.stock, run.pendingShop.cost), 350);
    }
    return el;
  }

  /* ── 节点选择 ─────────────────────────────────────────────────────── */
  function onPickNode(index) {
    const api = ex();
    const r = api.chooseNode(index);
    if (!r || !r.ok) { toast('无法进入该节点', 'danger'); return; }
    if (r.battle) {
      if (window.Game && Game.battle && typeof Game.battle.enterBattle === 'function') {
        Game.battle.enterBattle(r.stageId);
      } else if (typeof enterBattleUnified === 'function') {
        enterBattleUnified(r.stageId);
      }
      return;
    }
    // 非战斗节点：立即结算（rest / event）
    if (r.type === 'shop') {
      openShop(r.stock || [], r.cost || 30);
      return;
    }
    toast(r.text || '已通过', 'success');
    refresh();
  }

  /* ── 队伍选择（开局）───────────────────────────────────────────────── */
  function openTeamPicker() {
    const api = ex();
    const c = comp();
    if (!api || !c || typeof c.openModal !== 'function') return;
    const list = api.roster();
    if (!list.length) { toast('还没有任何角色', 'danger'); return; }
    const tier = api.mirrorTier();
    pickedTeam = [];

    const body =
      '<div class="text-xs text-gray-400 mb-3">镜像档位：等级 <b>' + tier.level + '</b> · <b>' + tier.stars + '</b> 星 · 无装备铭文（全员一致）</div>'
      + '<div class="grid grid-cols-3 gap-2 max-h-[46vh] overflow-y-auto pr-1">'
      + list.map(ch =>
        '<button type="button" class="ui-opt" data-char="' + esc(ch.id) + '">'
        + '<span class="ui-opt__name">' + esc(ch.name) + '</span>'
        + '<span class="ui-opt__desc">' + esc(ch.rarity || '') + ' · ' + esc(ch.class || '') + ' · Lv' + ch.level + '</span>'
        + '<span class="ui-opt__hint">点击选择</span>'
        + '</button>').join('')
      + '</div>'
      + '<div class="text-[11px] mt-3" id="expPickHint">已选 0 / 6</div>';

    c.openModal({
      title: '选择远征队伍（最多 6 人）',
      body,
      actions: [
        { label: '开始远征', onClick: (close) => {
          if (!pickedTeam.length) { toast('至少选择 1 名角色', 'danger'); return; }
          const r = api.startRun(pickedTeam, { practice: practiceMode });
          close();
          if (r && r.ok) { toast('远征开始', 'success'); refresh(); }
          else toast('开局失败：' + ((r && r.reason) || '未知'), 'danger');
        } },
        { label: '取消', tone: 'ghost' }
      ],
      onMount: (wrap) => {
        const hint = wrap.querySelector('#expPickHint');
        const sync = () => {
          wrap.querySelectorAll('[data-char]').forEach(el => {
            const on = pickedTeam.indexOf(el.getAttribute('data-char')) >= 0;
            el.style.borderColor = on ? 'var(--c-primary)' : '';
            el.style.boxShadow = on ? '0 0 0 1px var(--c-primary) inset' : '';
            el.style.opacity = on ? '1' : '';
          });
          if (hint) hint.textContent = '已选 ' + pickedTeam.length + ' / 6（前 3 位站前排）';
        };
        wrap.querySelectorAll('[data-char]').forEach(el => {
          el.addEventListener('click', () => {
            const id = el.getAttribute('data-char');
            const at = pickedTeam.indexOf(id);
            if (at >= 0) pickedTeam.splice(at, 1);
            else if (pickedTeam.length >= 6) { toast('最多 6 人', 'danger'); return; }
            else pickedTeam.push(id);
            sync();
          });
        });
        sync();
      }
    });
  }

  /* ── 祝福 3 选 1 ─────────────────────────────────────────────────── */
  function openBlessingPicker(list) {
    const api = ex();
    const c = comp();
    if (!api || !c || typeof c.openModal !== 'function' || !list || !list.length) return;
    const body =
      '<div class="text-xs text-gray-400 mb-3">选择 1 个祝福，本局内持续生效（可叠加同名以外的所有祝福）</div>'
      + '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">'
      + list.map((b, i) =>
        '<button type="button" class="ui-opt" data-bless="' + esc(b.id) + '">'
        + '<span class="ui-opt__name">' + esc(b.name) + '</span>'
        + '<span class="ui-opt__desc">' + esc(b.desc) + '</span>'
        + '<span class="ui-opt__hint">选择</span>'
        + '</button>').join('')
      + '</div>';
    c.openModal({
      title: '获得祝福 · 三选一',
      body,
      dismissible: false,
      onMount: (wrap, close) => {
        wrap.querySelectorAll('[data-bless]').forEach(el => {
          el.addEventListener('click', () => {
            const id = el.getAttribute('data-bless');
            const r = api.pickBlessing(id);
            close();
            if (r && r.ok) toast('获得祝福：' + (r.blessing ? r.blessing.name : id), 'success');
            refresh();
          });
        });
      }
    });
  }

  /* ── 商店 ─────────────────────────────────────────────────────────── */
  /** 商店（两阶段：先看货 → 买了或离开才推进层；domain 层挂 pendingShop） */
  function openShop(stock, cost) {
    const api = ex();
    const c = comp();
    if (!c || typeof c.openModal !== 'function') return;
    const body =
      '<div class="text-xs text-gray-400 mb-3">每个祝福 <b style="color:var(--c-primary)">' + cost + '</b> 远征币</div>'
      + (stock.length ? '<div class="grid grid-cols-1 gap-2">'
        + stock.map(b =>
          '<button type="button" class="ui-opt" data-buy="' + esc(b.id) + '">'
          + '<span class="ui-opt__name">' + esc(b.name) + '</span>'
          + '<span class="ui-opt__desc">' + esc(b.desc) + '</span>'
          + '<span class="ui-opt__hint">' + cost + ' 币</span>'
          + '</button>').join('')
        + '</div>' : '<div class="ui-result-empty">商人今天没有存货</div>');
    c.openModal({
      title: '流浪商人',
      body,
      actions: [{ label: '离开', tone: 'ghost', onClick: (close) => { close(); api.closeShop(); refresh(); } }],
      onMount: (wrap, close) => {
        wrap.querySelectorAll('[data-buy]').forEach(el => {
          el.addEventListener('click', () => {
            const r = api.buyShop(el.getAttribute('data-buy'));
            close();
            toast((r && r.text) || '交易完成', (r && r.ok) ? 'success' : 'ghost');
            refresh();
          });
        });
      }
    });
  }

  /* ── meta 解锁面板 ────────────────────────────────────────────────── */
  function openMetaPanel(s) {
    const api = ex();
    const c = comp();
    if (!c || typeof c.openModal !== 'function') return;
    const body =
      '<div class="text-xs text-gray-400 mb-3">远征币 <b style="color:var(--c-primary)">' + s.coins + '</b>（永久保留，每周不重置）</div>'
      + '<div class="grid grid-cols-1 gap-2">'
      + s.meta.map(u =>
        '<div class="ui-panel rounded-lg p-3 border border-gray-800 flex items-center justify-between gap-2">'
        + '<div class="min-w-0"><div class="text-[12px] font-black">' + esc(u.name) + ' <span class="text-gray-500">Lv' + u.level + '/' + u.max + '</span></div>'
        + '<div class="text-[10px] text-gray-400">' + esc(u.desc) + '</div></div>'
        + (u.maxed ? '<span class="ui-tag" data-tone="gold">已满</span>'
          : '<button type="button" class="ui-btn ui-btn--sm ui-btn--primary" data-buy="' + esc(u.id) + '"' + (s.coins < u.cost ? ' disabled' : '') + '>' + u.cost + ' 币</button>')
        + '</div>').join('')
      + '</div>';
    c.openModal({
      title: '远征永久解锁',
      body,
      actions: [{ label: '关闭', tone: 'ghost' }],
      onMount: (wrap, close) => {
        wrap.querySelectorAll('[data-buy]').forEach(btn => {
          btn.addEventListener('click', () => {
            const r = api.buyUnlock(btn.getAttribute('data-buy'));
            if (r && r.ok) { toast('已解锁：' + r.id + ' Lv' + r.level, 'success'); close(); refresh(); }
            else toast(r && r.reason === 'poor' ? '远征币不足' : '解锁失败', 'danger');
          });
        });
      }
    });
  }

  function openHistoryPanel(s) {
    const c = comp();
    if (!c || typeof c.openModal !== 'function') return;
    const body = (s.history && s.history.length)
      ? '<div class="space-y-2">' + s.history.map(h =>
        '<div class="ui-panel rounded-lg p-2 border border-gray-800 flex items-center justify-between">'
        + '<span class="text-[11px]">' + resultText(h.result) + ' · 第 ' + h.layers + ' 层 · 清除 ' + h.cleared + '</span>'
        + '<span class="text-[11px]" style="color:var(--c-primary)">+' + h.coins + ' 币</span>'
        + '</div>').join('') + '</div>'
      : '<div class="ui-result-empty">还没有远征记录</div>';
    c.openModal({ title: '远征战绩（最近 6 局）', body, actions: [{ label: '关闭', tone: 'ghost' }] });
  }

  /* ── 战斗结束后的 UI 衔接（由 battle/fallback_hud.js 的远征分支调用）── */
  function afterBattle(ret) {
    if (!ret) return;
    if (ret.over) {
      const s = ex().summary();
      const last = s && s.lastRun;
      toast(last ? ('远征结束：' + resultText(last.result) + ' · 第 ' + last.layers + ' 层 · +' + last.coins + ' 远征币') : '远征结束', last && last.result === 'clear' ? 'success' : 'ghost');
      setTimeout(refresh, 200);
      return;
    }
    if (ret.needPick && ret.picks) {
      setTimeout(() => openBlessingPicker(ret.picks), 420);
    }
    setTimeout(refresh, 500);
  }

  function refresh() {
    if (typeof updateStagesList === 'function') updateStagesList();
  }

  const api = { renderExpeditionPanel, afterBattle, openTeamPicker, openBlessingPicker, refresh };
  if (window.Game && window.Game.ui) window.Game.ui.expedition = api;
  window.__expeditionUI = api;
  window.renderExpeditionPanel = renderExpeditionPanel;
})();
