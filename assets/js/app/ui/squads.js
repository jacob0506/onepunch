/**
 * squads UI —— E4 多队远征界面（挂在「战斗」页的第 6 个模式 tab）
 *
 * 数值全部来自 domain/squads.js（单源）；本文件只负责画与点，不写任何数值。
 * 弹窗 / toast 一律走组件库（window.__uiComponents）与 uiToast 单源通知。
 */
(() => {
  'use strict';

  const comp = () => (window.__uiComponents || (window.Game && window.Game.ui && window.Game.ui.components) || null);
  const sq = () => window.__squads;
  function toast(msg, tone) {
    if (typeof window.uiToast === 'function') { window.uiToast(msg, tone); return; }
    const c = comp();
    if (c && typeof c.toast === 'function') c.toast(msg, tone);
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch2) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch2]));

  let curTeam = 0;   // 当前正在编辑的队伍

  function charOf(id) {
    if (typeof gameData === 'undefined' || !gameData) return null;
    return (gameData.characters || []).find(c => c && c.id === id) || null;
  }
  function tplOf(id) {
    const list = (typeof charactersData !== 'undefined' && Array.isArray(charactersData)) ? charactersData : [];
    return list.find(c => c && c.id === id) || null;
  }
  function imgOf(id) {
    const inst = charOf(id); const tpl = tplOf(id);
    return (inst && inst.imageUrl) || (tpl && tpl.imageUrl) || '';
  }
  function nameOf(id) {
    const inst = charOf(id); const tpl = tplOf(id);
    return (inst && inst.name) || (tpl && tpl.name) || id;
  }

  /* ── 主面板 ─────────────────────────────────────────────────────────── */
  function renderSquadsPanel(container) {
    const api = sq();
    if (!api) return;
    const s = api.summary();

    const wrap = document.createElement('div');
    wrap.className = 'space-y-3 pb-40';

    /* ① 推进线概览 */
    const head = document.createElement('div');
    head.className = 'ui-panel rounded-xl p-4 border border-gray-800';
    const isRest = s.restLayers.includes(s.layer);
    head.innerHTML =
      '<div class="flex items-center justify-between gap-3">' +
      '<div>' +
      '<div class="text-lg font-black">远征队</div>' +
      '<div class="text-[10px] text-gray-400 mt-1">3 支互不重复的队伍轮换推图 · 生命跨层累计 · 营地按层恢复</div>' +
      '</div>' +
      '<div class="text-right">' +
      '<div class="text-[10px] text-gray-400">进度</div>' +
      '<div class="text-xl font-black" style="color:var(--c-primary)">' + s.layer + '<span class="text-xs text-gray-500">/' + s.layers + '</span></div>' +
      '</div>' +
      '</div>' +
      '<div class="grid grid-cols-3 gap-2 mt-3 text-center">' +
      '<div class="rounded-lg bg-gray-900 border border-gray-800 py-2"><div class="text-[10px] text-gray-500">最远纪录</div><div class="font-black">' + s.bestLayer + '</div></div>' +
      '<div class="rounded-lg bg-gray-900 border border-gray-800 py-2"><div class="text-[10px] text-gray-500">已编队伍</div><div class="font-black">' + s.teams.filter(t => t.members > 0).length + '/3</div></div>' +
      '<div class="rounded-lg bg-gray-900 border border-gray-800 py-2"><div class="text-[10px] text-gray-500">状态</div><div class="font-black" style="color:' + (s.cleared ? 'var(--c-ok,#4ade80)' : (s.allDown ? 'var(--c-danger,#f87171)' : 'var(--c-text-hi,#e5e7eb)')) + '">' + (s.cleared ? '已通关' : (s.allDown ? '全员失能' : (s.active ? '推进中' : '待出发'))) + '</div></div>' +
      '</div>';

    /* ② 当前层 + 选队上阵 */
    const runBox = document.createElement('div');
    runBox.className = 'ui-panel rounded-xl p-4 border border-gray-800';
    if (!s.active) {
      runBox.innerHTML =
        '<div class="text-[11px] text-gray-400 mb-3">' + (s.cleared ? '本轮已通关 —— 每周重置后可再挑战一次。' : '编好队伍后即可出发：每通过一层都有奖励，营地会为全员恢复生命。') + '</div>' +
        '<button type="button" id="sqStartBtn" class="ui-btn ui-btn--primary w-full"><i class="fa fa-flag mr-1"></i>开始新一轮</button>';
    } else if (s.cleared || s.allDown) {
      runBox.innerHTML =
        '<div class="text-[11px] text-gray-400 mb-3">' + (s.cleared ? '恭喜通关全部 ' + s.layers + ' 层！' : '三支队伍全部失去战斗力，本轮结束（到达第 ' + s.layer + ' 层）。') + '</div>' +
        '<button type="button" id="sqEndBtn" class="ui-btn ui-btn--ghost w-full"><i class="fa fa-refresh mr-1"></i>结束本轮</button>';
    } else {
      const label = s.labels[s.layer] || ('第 ' + (s.layer + 1) + ' 层');
      runBox.innerHTML =
        '<div class="flex items-center justify-between mb-2">' +
        '<div class="text-xs font-bold text-gray-400 uppercase">当前位置</div>' +
        '<div class="text-[11px] font-black" style="color:var(--c-primary)">第 ' + (s.layer + 1) + ' 层 · ' + esc(label) + (isRest ? ' · 营地' : '') + '</div>' +
        '</div>' +
        '<div class="text-[10px] text-gray-500 mb-3">选择一支队伍挑战本层；队伍生命跨层累计，倒下的成员下场不会自动复活。</div>' +
        '<div class="space-y-2" id="sqTeamChoose"></div>';
    }

    /* ③ 编队面板 */
    const teamBox = document.createElement('div');
    teamBox.className = 'ui-panel rounded-xl p-4 border border-gray-800';
    teamBox.innerHTML =
      '<div class="flex items-center justify-between mb-2">' +
      '<div class="text-xs font-bold text-gray-400 uppercase">队伍编排</div>' +
      '<div class="flex gap-2">' +
      '<button type="button" id="sqAutoBtn" class="ui-btn ui-btn--ghost ui-btn--sm"><i class="fa fa-magic mr-1"></i>一键编队</button>' +
      '<button type="button" id="sqClearBtn" class="ui-btn ui-btn--danger ui-btn--sm">清空</button>' +
      '</div>' +
      '</div>' +
      '<div class="flex gap-2 mb-3" id="sqTeamTabs"></div>' +
      '<div id="sqSlots" class="grid grid-cols-6 gap-2"></div>' +
      '<div class="text-[10px] text-gray-500 mt-2">同一名角色只能编入一支队伍 —— 把强者分散到三队，才能走得更远。</div>';

    wrap.appendChild(head);
    wrap.appendChild(runBox);
    wrap.appendChild(teamBox);
    container.appendChild(wrap);

    bindRunBox(s, runBox);
    renderTeamTabs(teamBox);
    renderSlots(teamBox);
  }

  function bindRunBox(s, box) {
    const start = box.querySelector('#sqStartBtn');
    if (start) start.addEventListener('click', () => {
      const r = sq().startRun();
      if (!r.ok) { toast(r.reason === 'empty_teams' ? '请先编好至少一支队伍' : '无法开始', 'warn'); return; }
      toast('远征开始 —— 第 1 层', 'success');
      refresh();
    });
    const end = box.querySelector('#sqEndBtn');
    if (end) end.addEventListener('click', () => {
      sq().abandon();
      toast('本轮已结束', 'ghost');
      refresh();
    });
    const choose = box.querySelector('#sqTeamChoose');
    if (choose) {
      s.teams.forEach((t) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const pct = Math.round((t.alive || 0) * 100);
        const ok = t.usable;
        btn.className = 'ui-opt' + (ok ? '' : ' ui-opt--disabled');
        btn.disabled = !ok;
        btn.innerHTML =
          '<span class="ui-opt__name">' + (t.index + 1) + ' 队 · ' + t.members + ' 人' + (ok ? '' : '（已失能）') + '</span>' +
          '<span class="ui-opt__desc">' + t.ids.filter(Boolean).map(id => esc(nameOf(id))).join('、') + '</span>' +
          '<span class="ui-opt__hint">剩余生命 ' + pct + '%</span>';
        btn.addEventListener('click', () => {
          const r = sq().choose(t.index);
          if (!r.ok) { toast('该队伍无法出战', 'warn'); return; }
          if (window.Game && Game.battle && typeof Game.battle.enterBattle === 'function') {
            Game.battle.enterBattle(r.stageId);
          } else if (typeof enterBattleUnified === 'function') {
            enterBattleUnified(r.stageId);
          }
        });
        choose.appendChild(btn);
      });
    }
  }

  function renderTeamTabs(box) {
    const tabs = box.querySelector('#sqTeamTabs');
    if (!tabs) return;
    tabs.innerHTML = '';
    const ts = sq().teams();
    ts.forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ui-btn ui-btn--sm ' + (i === curTeam ? 'ui-btn--primary' : 'ui-btn--ghost');
      b.textContent = (i + 1) + ' 队（' + t.filter(Boolean).length + '）';
      b.addEventListener('click', () => { curTeam = i; renderTeamTabs(box); renderSlots(box); });
      tabs.appendChild(b);
    });
  }

  function renderSlots(box) {
    const grid = box.querySelector('#sqSlots');
    if (!grid) return;
    grid.innerHTML = '';
    const api = sq();
    const t = api.teams()[curTeam] || [];
    for (let i = 0; i < t.length; i++) {
      const id = t[i];
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'aspect-square rounded-lg border border-gray-800 flex items-center justify-center overflow-hidden';
      slot.style.background = 'var(--c-surface-2,#111)';
      if (id) {
        const img = imgOf(id);
        slot.innerHTML = img
          ? '<img src="' + esc(img) + '" alt="" class="w-full h-full object-cover">'
          : '<i class="fa fa-user text-gray-500 text-xs"></i>';
        slot.title = nameOf(id) + '（点击移除）';
        slot.addEventListener('click', () => {
          const r = api.setMember(curTeam, i, null);
          if (r && r.ok) refresh();
        });
      } else {
        slot.innerHTML = '<i class="fa fa-plus text-gray-600 text-xs"></i>';
        slot.addEventListener('click', () => openPicker(i));
      }
      grid.appendChild(slot);
    }
    // 一键 / 清空按钮（每次重渲染都要重新绑定 —— 面板是重建的）
    const auto = box.querySelector('#sqAutoBtn');
    if (auto) auto.onclick = () => {
      const r = api.autoDeploy();
      if (!r.ok) { toast(r.reason === 'no_chars' ? '没有可用角色' : '无法编队', 'warn'); return; }
      toast('已按战力均衡分配到 3 支队伍', 'success');
      refresh();
    };
    const clear = box.querySelector('#sqClearBtn');
    if (clear) clear.onclick = () => { api.clearTeams(); toast('已清空全部队伍', 'ghost'); refresh(); };
  }

  function openPicker(slotIdx) {
    const api = sq();
    const c = comp();
    if (!c || typeof c.openModal !== 'function') return;
    const pool = api.pool().slice(0, 60);
    const body = pool.length
      ? '<div class="grid grid-cols-4 gap-2">' + pool.map(ch => {
        const img = ch.imageUrl || imgOf(ch.id);
        return '<button type="button" class="rounded-lg border border-gray-800 overflow-hidden aspect-square" data-pick="' + esc(ch.id) + '" style="background:var(--c-surface-2,#111)">'
          + (img ? '<img src="' + esc(img) + '" alt="" class="w-full h-full object-cover">' : '<i class="fa fa-user text-gray-600"></i>')
          + '</button>';
      }).join('') + '</div>'
      : '<div class="ui-result-empty">没有可编入的角色（都已编入其它队伍）</div>';
    c.openModal({
      title: '选择角色 · ' + (curTeam + 1) + ' 队',
      body,
      actions: [{ label: '取消', tone: 'ghost' }],
      onMount: (wrap, close) => {
        wrap.querySelectorAll('[data-pick]').forEach(el => {
          el.addEventListener('click', () => {
            const r = api.setMember(curTeam, slotIdx, el.getAttribute('data-pick'));
            close();
            if (!r.ok) {
              toast(r.reason === 'duplicate' ? ('该角色已在 ' + (r.team + 1) + ' 队中') : '无法编入', 'warn');
            }
            refresh();
          });
        });
      }
    });
  }

  /* ── 战斗结束后的 UI 衔接（由 battle/fallback_hud.js 的多队分支调用）── */
  function afterBattle(adv) {
    if (!adv) { refresh(); return; }
    const s = sq().summary();
    if (adv.cleared) {
      toast('通关全部 ' + s.layers + ' 层！', 'success');
    } else if (adv.win) {
      const msg = '第 ' + s.layer + ' 层已通过' + (adv.healed ? ' · 营地休整（全员回血）' : '') + (adv.reward ? ' · +' + adv.reward.gold + ' 金币' : '');
      toast(msg, 'success');
    } else {
      toast('挑战失败 —— 换一支队伍再来', 'warn');
    }
    setTimeout(refresh, 300);
  }

  function refresh() {
    if (typeof updateStagesList === 'function') updateStagesList();
  }

  const api = { renderSquadsPanel, afterBattle, refresh };
  if (window.Game && window.Game.ui) window.Game.ui.squads = api;
  window.__squadsUI = api;
  window.renderSquadsPanel = renderSquadsPanel;
})();
