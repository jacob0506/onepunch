/**
 * arena UI —— E8 镜像竞技场界面（挂在「战斗」页的「竞技场」模式 tab）
 *
 * 数值全部来自 domain/arena.js（单源）；本文件只负责画与点，不写任何数值。
 * 弹窗 / toast 一律走组件库（window.__uiComponents）与 uiToast 单源通知。
 */
(() => {
  'use strict';

  const comp = () => (window.__uiComponents || (window.Game && window.Game.ui && window.Game.ui.components) || null);
  const ar = () => window.__arena;
  function toast(msg, tone) {
    if (typeof window.uiToast === 'function') { window.uiToast(msg, tone); return; }
    const c = comp();
    if (c && typeof c.toast === 'function') c.toast(msg, tone);
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c2) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c2]));
  const fmtNum = (n) => {
    const v = Number(n) || 0;
    if (v >= 100000000) return (v / 100000000).toFixed(2) + '亿';
    if (v >= 10000) return (v / 10000).toFixed(v >= 1000000 ? 0 : 1) + '万';
    return String(Math.floor(v));
  };
  const CLASS_CN = { warrior: '战士', mage: '法师', archer: '弓手', tank: '坦克', healer: '治疗', assassin: '刺客' };

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

  /* ── 主面板 ─────────────────────────────────────────────────────────── */
  function renderArenaPanel(container) {
    const api = ar();
    if (!api) return;
    const s = api.summary();
    if (!s || !s.rank) {
      const empty = document.createElement('div');
      empty.className = 'ui-panel rounded-xl p-6 text-center text-xs text-gray-400';
      empty.textContent = '竞技场尚未开放（缺少 arena.json 配置）';
      container.appendChild(empty);
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'space-y-3 pb-40';

    /* 1. 段位卡 */
    const starDots = Array.from({ length: s.starsPerRank }, (_, i) =>
      '<i class="fa ' + (i < s.star ? 'fa-star' : 'fa-star-o') + ' text-[13px] ' + (i < s.star ? 'text-yellow-400' : 'text-gray-600') + '"></i>').join('');
    const streakTxt = s.streak > 0 ? ('连胜 ' + s.streak + (s.winStreakBonus > 0 ? '（每 ' + s.winStreakBonus + ' 连胜 +1 星）' : '')) : '';
    const rankCard = document.createElement('div');
    rankCard.className = 'ui-panel rounded-xl p-4 border border-gray-800';
    rankCard.innerHTML =
      '<div class="flex items-center gap-3">' +
      '<div class="w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 border border-gray-700" style="background:var(--c-surface-2,#111)">' +
      '<i class="fa ' + esc((s.rank && s.rank.icon) || 'fa-shield') + ' text-2xl" style="color:var(--c-primary)"></i>' +
      '</div>' +
      '<div class="min-w-0 flex-1">' +
      '<div class="text-[10px] text-gray-500">竞技场 · 第 ' + (s.weekNo + 1) + ' 周 · ' + s.daysLeft + ' 天后结算</div>' +
      '<div class="text-lg font-black">' + esc((s.rank && s.rank.name) || '') + ' <span class="text-[11px] text-gray-400 font-normal">' + (s.isMax ? '满星' : (s.star + 1) + '/' + s.starsPerRank + ' 星') + '</span></div>' +
      '<div class="mt-1 flex items-center gap-1">' + starDots +
      (streakTxt ? '<span class="text-[10px] ml-2 text-yellow-400">' + esc(streakTxt) + '</span>' : '') +
      '</div>' +
      '</div>' +
      '<div class="text-right flex-shrink-0">' +
      '<div class="text-[10px] text-gray-500">今日次数</div>' +
      '<div class="font-black">' + s.triesLeft + '/' + s.maxTries + '</div>' +
      '</div>' +
      '</div>' +
      '<div class="mt-3 grid grid-cols-3 gap-2 text-center">' +
      '<div class="rounded-lg bg-gray-900 border border-gray-800 py-2"><div class="text-[10px] text-gray-500">历史最高</div><div class="text-[11px] font-black">' + esc((s.bestRank && s.bestRank.name) || '—') + '</div></div>' +
      '<div class="rounded-lg bg-gray-900 border border-gray-800 py-2"><div class="text-[10px] text-gray-500">胜负</div><div class="text-[11px] font-black"><span style="color:var(--c-ok,#4ade80)">' + s.wins + '</span> / <span style="color:var(--c-danger,#f87171)">' + s.losses + '</span></div></div>' +
      '<div class="rounded-lg bg-gray-900 border border-gray-800 py-2"><div class="text-[10px] text-gray-500">本周出战</div><div class="text-[11px] font-black">' + s.weekRuns + ' 场</div></div>' +
      '</div>';

    /* 2. 对手卡 + 出战按钮 */
    const opp = s.opponent;
    const oppCard = document.createElement('div');
    oppCard.className = 'ui-panel rounded-xl p-4 border ' + (opp && opp.isPromotion ? 'border-yellow-700' : 'border-gray-800');
    const memberGrid = (opp && opp.members || []).map(m =>
      '<div class="min-w-0">' +
      '<div class="aspect-[3/4] rounded-md overflow-hidden border border-gray-800" style="background:var(--c-surface-2,#111)">' +
      (m.imageUrl
        ? '<img src="' + esc(m.imageUrl) + '" alt="" class="w-full h-full object-cover">'
        : '<div class="w-full h-full flex items-center justify-center"><i class="fa fa-user text-gray-700"></i></div>') +
      '</div>' +
      '<div class="text-[9px] text-gray-400 truncate mt-0.5">' + esc(m.name) + '</div>' +
      '</div>').join('');
    const powerRatio = opp ? Math.round((opp.power / Math.max(1, s.myPower)) * 100) : 0;
    oppCard.innerHTML =
      '<div class="flex items-start justify-between gap-2">' +
      '<div class="min-w-0">' +
      '<div class="text-[10px] text-gray-500">' + (opp && opp.isPromotion ? '升段赛 · 镜像' : '本轮对手 · 名宿阵容') + ' · 难度系数 ×' + (opp ? opp.scale.toFixed(2) : '1.00') + '</div>' +
      '<div class="text-base font-black truncate">' + esc((opp && opp.name) || '未知对手') + '</div>' +
      '<div class="text-[11px] text-gray-400">' + esc((opp && opp.desc) || '') + '</div>' +
      '</div>' +
      '<div class="text-right flex-shrink-0">' +
      '<div class="text-[10px] text-gray-500">对手战力</div>' +
      '<div class="font-black" style="color:' + (powerRatio > 100 ? 'var(--c-danger,#f87171)' : 'var(--c-ok,#4ade80)') + '">' + fmtNum(opp && opp.power) + '</div>' +
      '<div class="text-[10px] text-gray-500">我方 ' + fmtNum(s.myPower) + '</div>' +
      '</div>' +
      '</div>' +
      '<div class="mt-3 grid grid-cols-6 gap-1">' + memberGrid + '</div>' +
      '<div class="mt-3 rounded-lg bg-gray-900 border border-gray-800 p-3 text-[11px] text-gray-300 leading-relaxed">' +
      '<i class="fa fa-lightbulb-o mr-1" style="color:var(--c-primary)"></i>' + esc((opp && opp.hint) || '') +
      '</div>' +
      (opp && opp.isPromotion
        ? '<div class="mt-2 text-[10px] text-yellow-400 text-center"><i class="fa fa-flag-checkered mr-1"></i>升段赛：赢下即晋升下一段；失败掉 1 星（段位保留）</div>'
        : '') +
      '<button type="button" id="arFightBtn" class="ui-btn ui-btn--primary w-full mt-3">' +
      '<i class="fa fa-crosshairs mr-1"></i>' + (s.triesLeft > 0 ? '出战（消耗 1 次）' : '今日次数已用尽') + '</button>' +
      '<div class="text-[10px] text-gray-500 mt-2 text-center">对手强度随你的队伍成长 · 失败掉 1 星但不掉段</div>';

    /* 3. 段位阶梯 */
    const ladder = document.createElement('div');
    ladder.className = 'ui-panel rounded-xl p-4 border border-gray-800';
    ladder.innerHTML = '<div class="text-xs font-bold text-gray-400 mb-2 uppercase">段位阶梯（每周结算发奖）</div>' +
      '<div class="space-y-1.5">' + (s.ranks || []).map(r =>
        '<div class="rounded-lg border p-2 flex items-center justify-between gap-2 ' + (r.current ? 'border-yellow-600' : (r.reached ? 'border-green-700' : 'border-gray-800')) + '" style="background:var(--c-surface-2,#0f0f12)">' +
        '<div class="flex items-center gap-2 min-w-0">' +
        '<i class="fa ' + esc(r.icon || 'fa-shield') + ' text-[13px] ' + (r.current ? 'text-yellow-400' : (r.reached ? 'text-green-400' : 'text-gray-600')) + '"></i>' +
        '<span class="text-[11px] font-black">' + esc(r.name) + '</span>' +
        '<span class="text-[10px] text-gray-500">×' + (Number(r.scale) || 1).toFixed(2) + '</span>' +
        '</div>' +
        '<div class="text-[10px] text-gray-400 truncate flex-shrink-0">周奖 ' + esc(rewardText(r.weekly)) + '</div>' +
        '</div>').join('') + '</div>';

    /* 4. 周结算历史 */
    const weekly = s.lastWeekly;
    const weekCard = document.createElement('div');
    weekCard.className = 'ui-panel rounded-xl p-4 border border-gray-800';
    weekCard.innerHTML = '<div class="text-xs font-bold text-gray-400 mb-2 uppercase">上周结算</div>' +
      (weekly
        ? '<div class="text-[11px] text-gray-300">第 ' + (weekly.weekNo + 1) + ' 周 · ' + esc(weekly.rankName || '—') +
          (weekly.settled
            ? ' · 已发放：' + ((weekly.lines && weekly.lines.length) ? esc(weekly.lines.join(' / ')) : '奖励已到账')
            : ' · 未参战，无奖励') + '</div>'
        : '<div class="text-[11px] text-gray-500">本赛季还没有结算记录</div>') +
      '<div class="text-[10px] text-gray-500 mt-2">跨周结算后段位降一段（不低于青铜），历史最高段位永久保留</div>';

    wrap.appendChild(rankCard);
    wrap.appendChild(oppCard);
    wrap.appendChild(ladder);
    wrap.appendChild(weekCard);
    container.appendChild(wrap);

    const fight = document.getElementById('arFightBtn');
    if (fight) {
      fight.disabled = s.triesLeft <= 0;
      fight.addEventListener('click', () => doFight());
    }
  }

  function doFight() {
    const api = ar();
    if (!api) return;
    const chk = api.canFight();
    if (!chk.ok) {
      toast(chk.reason === 'empty_formation' ? '请先在上阵阵容里配置角色' : '今日出战次数已用尽', 'warn');
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

  /* ── 战斗结束后的 UI 衔接（由 battle/fallback_hud.js 的竞技场分支调用）── */
  function afterBattle(ret, result) {
    if (!ret) return;
    const c = comp();
    const lines = [];
    const delta = Number(ret.starDelta) || 0;
    lines.push(delta > 0 ? '星数 +' + delta + (ret.streakBonus ? '（含连胜奖励）' : '') : (delta < 0 ? '星数 −1（不掉段）' : '星数不变'));
    if (ret.promoted) lines.push('★ 晋升 ' + (ret.rankName || '下一段') + '！');
    if (ret.demoted) lines.push('段位降至 ' + (ret.rankName || ''));
    if (ret.isMax) lines.push('已达最高段位 · 王者满星');
    if (ret.streak > 1) lines.push('当前连胜 ' + ret.streak + ' 场');
    if (c && typeof c.openModal === 'function') {
      c.openModal({
        title: ret.win ? '竞技场胜利' : '竞技场失利',
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

  const api = { renderArenaPanel, afterBattle, refresh };
  if (window.Game && window.Game.ui) window.Game.ui.arena = api;
  window.__arenaUI = api;
  window.renderArenaPanel = renderArenaPanel;
})();
