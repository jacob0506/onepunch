/**
 * challenge UI —— E3 周期挑战界面（挂在「战斗」页的第 5 个模式 tab）
 *
 * 数值全部来自 domain/challenge.js（单源）；本文件只负责画与点，不写任何数值。
 * 弹窗 / toast 一律走组件库（window.__uiComponents）与 uiToast 单源通知。
 */
(() => {
  'use strict';

  const comp = () => (window.__uiComponents || (window.Game && window.Game.ui && window.Game.ui.components) || null);
  const ch = () => window.__challenge;
  function toast(msg, tone) {
    if (typeof window.uiToast === 'function') { window.uiToast(msg, tone); return; }
    const c = comp();
    if (c && typeof c.toast === 'function') c.toast(msg, tone);
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch2) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch2]));
  const fmtNum = (n) => {
    const v = Number(n) || 0;
    if (v >= 100000000) return (v / 100000000).toFixed(2) + '亿';
    if (v >= 10000) return (v / 10000).toFixed(v >= 1000000 ? 0 : 1) + '万';
    return String(Math.floor(v));
  };

  /* ── 主面板 ─────────────────────────────────────────────────────────── */
  function renderChallengePanel(container) {
    const api = ch();
    if (!api) return;
    const s = api.summary();
    if (!s || !s.boss) {
      const empty = document.createElement('div');
      empty.className = 'ui-panel rounded-xl p-6 text-center text-xs text-gray-400';
      empty.textContent = '周期挑战尚未开放（缺少 challenge.json 配置）';
      container.appendChild(empty);
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'space-y-3 pb-40';

    /* 首领卡：立绘 + 名号 + 机制 */
    const mech = s.mechanic || {};
    const boss = s.boss;
    const head = document.createElement('div');
    head.className = 'ui-panel rounded-xl p-4 border border-gray-800';
    head.innerHTML =
      '<div class="flex items-center gap-3">' +
      '<div class="w-20 h-24 rounded-lg overflow-hidden border border-gray-800 flex-shrink-0" style="background:var(--c-surface-2,#111)">' +
      (boss.imageUrl
        ? '<img src="' + esc(boss.imageUrl) + '" alt="" class="w-full h-full object-cover">'
        : '<div class="w-full h-full flex items-center justify-center"><i class="fa fa-user text-2xl text-gray-600"></i></div>') +
      '</div>' +
      '<div class="min-w-0 flex-1">' +
      '<div class="text-[10px] text-gray-500">本周首领 · 第 ' + (s.weekNo + 1) + ' 期 · ' + s.daysLeft + ' 天后轮换</div>' +
      '<div class="text-lg font-black truncate">' + esc(boss.name) + '</div>' +
      '<div class="text-[11px] text-gray-400 truncate">' + esc(boss.title || '') + '</div>' +
      '<div class="mt-2 inline-block px-2 py-1 rounded text-[11px] font-black" style="background:var(--c-primary-soft,rgba(255,255,255,.06));color:var(--c-primary)">' +
      '机制 · ' + esc(mech.name || '未知') + ' · ' + (mech.roundLimit || 15) + ' 回合</div>' +
      '</div>' +
      '</div>' +
      '<div class="mt-3 rounded-lg bg-gray-900 border border-gray-800 p-3">' +
      '<div class="text-[11px] text-gray-300 leading-relaxed">' + esc(mech.desc || '') + '</div>' +
      '<div class="text-[11px] mt-2" style="color:var(--c-primary)"><i class="fa fa-lightbulb-o mr-1"></i>' + esc(mech.hint || '') + '</div>' +
      '</div>';

    /* 进度与次数 */
    const tiers = s.tiers || [];
    const nextTier = tiers.find(t => !t.reached);
    const barPct = nextTier ? Math.min(100, Math.round(s.best / Math.max(1, nextTier.damage) * 100)) : 100;
    const stat = document.createElement('div');
    stat.className = 'ui-panel rounded-xl p-4 border border-gray-800';
    stat.innerHTML =
      '<div class="grid grid-cols-3 gap-2 text-center">' +
      '<div class="rounded-lg bg-gray-900 border border-gray-800 py-2"><div class="text-[10px] text-gray-500">本周最佳</div><div class="font-black" style="color:var(--c-primary)">' + fmtNum(s.best) + '</div></div>' +
      '<div class="rounded-lg bg-gray-900 border border-gray-800 py-2"><div class="text-[10px] text-gray-500">历史最佳</div><div class="font-black">' + fmtNum(s.historyBest) + '</div></div>' +
      '<div class="rounded-lg bg-gray-900 border border-gray-800 py-2"><div class="text-[10px] text-gray-500">今日次数</div><div class="font-black">' + s.triesLeft + '/' + s.maxTries + '</div></div>' +
      '</div>' +
      '<div class="mt-3">' +
      '<div class="flex items-center justify-between text-[10px] text-gray-400 mb-1">' +
      '<span>' + (nextTier ? '下一档：' + esc(nextTier.label) + '（' + fmtNum(nextTier.damage) + '）' : '已达成全部档位') + '</span>' +
      '<span>' + barPct + '%</span>' +
      '</div>' +
      '<div class="h-2 rounded-full bg-gray-800 overflow-hidden">' +
      '<div class="h-full rounded-full" style="width:' + barPct + '%;background:var(--c-primary)"></div>' +
      '</div>' +
      '</div>' +
      '<button type="button" id="chFightBtn" class="ui-btn ui-btn--primary w-full mt-3">' +
      '<i class="fa fa-crosshairs mr-1"></i>' + (s.triesLeft > 0 ? '发起挑战（消耗 1 次）' : '今日次数已用尽') + '</button>' +
      '<div class="text-[10px] text-gray-500 mt-2 text-center">分数 = 本场累计伤害 · 首领血量刻意打不完，比拼的是输出效率</div>';

    /* 档位奖励 */
    const tierBox = document.createElement('div');
    tierBox.className = 'ui-panel rounded-xl p-4 border border-gray-800';
    tierBox.innerHTML = '<div class="text-xs font-bold text-gray-400 mb-2 uppercase">伤害档位奖励（每周可领一次）</div>'
      + '<div class="space-y-2">' + tiers.map(t =>
        '<div class="rounded-lg border p-2 flex items-center justify-between gap-2 ' + (t.claimed ? 'border-green-700' : (t.reached ? 'border-yellow-600' : 'border-gray-800')) + '" style="background:var(--c-surface-2,#0f0f12)">' +
        '<div class="min-w-0">' +
        '<div class="text-[11px] font-black">' + esc(t.label) + '<span class="text-gray-500 font-normal ml-1">' + fmtNum(t.damage) + '</span></div>' +
        '<div class="text-[10px] text-gray-400 truncate">' + rewardText(t.rewards) + '</div>' +
        '</div>' +
        '<div class="text-[10px] font-black flex-shrink-0" style="color:' + (t.claimed ? 'var(--c-ok,#4ade80)' : (t.reached ? 'var(--c-primary)' : 'var(--c-text-dim)')) + '">' +
        (t.claimed ? '已领取' : (t.reached ? '已达成' : t.pct + '%')) + '</div>' +
        '</div>').join('') + '</div>';

    wrap.appendChild(head);
    wrap.appendChild(stat);
    wrap.appendChild(tierBox);
    container.appendChild(wrap);

    const fight = document.getElementById('chFightBtn');
    if (fight) {
      fight.disabled = s.triesLeft <= 0;
      fight.addEventListener('click', () => doFight());
    }
  }

  /** 材料中文名走 idle.materialName 单源（拿不到才退回 key） */
  function matName(key) {
    const idle = window.__idle;
    if (idle && typeof idle.materialName === 'function') {
      try { const n = idle.materialName(key); if (n) return n; } catch (e) { /* 兜底用 key */ }
    }
    return key;
  }
  function rewardText(r) {
    const parts = [];
    if (r && r.gold) parts.push('金币 ' + fmtNum(r.gold));
    if (r && r.gems) parts.push('钻石 ' + fmtNum(r.gems));
    if (r && r.materials) Object.keys(r.materials).forEach(k => parts.push(matName(k) + ' ×' + r.materials[k]));
    return parts.length ? parts.join(' · ') : '无';
  }

  function doFight() {
    const api = ch();
    if (!api) return;
    const chk = api.canFight();
    if (!chk.ok) {
      toast(chk.reason === 'empty_formation' ? '请先在上阵阵容里配置角色' : '今日挑战次数已用尽', 'warn');
      return;
    }
    const r = api.start();
    if (!r.ok) { toast('无法发起挑战', 'warn'); return; }
    if (window.Game && Game.battle && typeof Game.battle.enterBattle === 'function') {
      Game.battle.enterBattle(r.stageId);
    } else if (typeof enterBattleUnified === 'function') {
      enterBattleUnified(r.stageId);
    }
  }

  /* ── 战斗结束后的 UI 衔接（由 battle/fallback_hud.js 的挑战分支调用）── */
  function afterBattle(sum, result) {
    if (!sum) return;
    const last = sum.last;
    if (!last) { refresh(); return; }
    const c = comp();
    const lines = [];
    lines.push('本场累计伤害 ' + fmtNum(last.damage));
    lines.push('最高单次 ' + fmtNum(last.maxHit));
    if (last.damage >= (sum.historyBest || 0) && last.damage > 0) lines.push('★ 新纪录！');

    // 新达成的档位（domain 已发奖，这里只报账）
    const gainedTiers = (sum.tiers || []).filter(t => t.claimed && t.reached);
    if (gainedTiers.length) {
      lines.push('已达成档位：' + gainedTiers.map(t => t.label).join('、'));
    }
    if (c && typeof c.openModal === 'function') {
      c.openModal({
        title: last.win ? '挑战成功' : '挑战结束',
        body: '<div class="space-y-2">' + lines.map(l =>
          '<div class="ui-panel rounded-lg p-2 border border-gray-800 text-[11px]">' + esc(l) + '</div>').join('') + '</div>',
        actions: [{ label: '好', tone: 'primary' }]
      });
    } else {
      toast(lines[0], 'ghost');
    }
    setTimeout(refresh, 300);
  }

  function refresh() {
    if (typeof updateStagesList === 'function') updateStagesList();
  }

  const api = { renderChallengePanel, afterBattle, refresh };
  if (window.Game && window.Game.ui) window.Game.ui.challenge = api;
  window.__challengeUI = api;
  window.renderChallengePanel = renderChallengePanel;
})();
