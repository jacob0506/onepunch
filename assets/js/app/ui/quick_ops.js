/**
 * quick_ops.js (ui) —— 一键操作集的界面层（C4）
 *
 * 数值全部来自 domain/quick_ops.js（window.__quickOps），本文件只负责
 * 确认弹窗 / 结果展示 / 刷新与存档 —— **不复制任何一条养成规则**。
 *
 * 入口（index.html 养成页「一键操作」面板）：
 *   #quickEquipBtn  一键穿戴（当前角色，只用闲置装备）
 *   #quickEquipAllBtn 全员配装（全体回收后按战力重排，二次确认）
 *   #quickFormationBtn 一键上阵（战力 Top6）
 *   #quickClaimAllBtn  一键领取全部（首页/养成页共用）
 *
 * ⚠️ 依赖 assets/js/app/ui/components.js（Game.ui.components），必须先加载。
 */
(() => {
  'use strict';

  const uiComp = () => (window.__uiComponents || (window.Game && window.Game.ui && window.Game.ui.components) || null);
  const ops = () => (window.__quickOps || (window.Game && window.Game.domain && window.Game.domain.quickOps) || null);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmt(n) {
    const v = Math.round(Number(n) || 0);
    return v.toLocaleString();
  }

  function sel() {
    try { return (typeof selectedCharacter !== 'undefined' && selectedCharacter) ? selectedCharacter : null; }
    catch (e) { return null; }
  }

  function toast(msg, tone) {
    const ui = uiComp();
    if (ui && ui.toast) ui.toast(msg, tone);
  }

  /** 改完状态后的收尾：刷新 + 存档（顺序照抄 equipItem，不要改） */
  function commit(char) {
    try { if (char && typeof selectCharacterToCultivate === 'function') selectCharacterToCultivate(char); } catch (e) { /* ignore */ }
    try { if (typeof updateUI === 'function') updateUI(); } catch (e) { /* ignore */ }
    try { if (typeof saveGameProgress === 'function') saveGameProgress(); } catch (e) { /* ignore */ }
  }

  function gainRow(label, gain) {
    const tone = gain > 0 ? 'good' : (gain < 0 ? 'bad' : 'flat');
    const sign = gain > 0 ? '+' : '';
    return `<div class="ui-result-row"><span>${esc(label)}</span>` +
      `<span class="ui-result-row__val" data-tone="${tone}">${sign}${fmt(gain)}</span></div>`;
  }

  function powerHead(before, after) {
    const gain = after - before;
    return `<div class="ui-result-block">` +
      `<div class="ui-result-row"><span>战力</span>` +
      `<span class="ui-result-row__val" data-tone="flat">${fmt(before)} → ${fmt(after)}` +
      `<span class="ui-result-row__sub">${gain >= 0 ? '+' : ''}${fmt(gain)}</span></span></div>` +
      `</div>`;
  }

  /* ── 一键穿戴（当前角色）─────────────────────────────── */

  function runAutoEquip() {
    const api = ops();
    const ui = uiComp();
    const char = sel();
    if (!api || !ui) return;
    if (!char) { toast('请先在下方选择一个角色', 'warning'); return; }

    const res = api.autoEquipBest(char);
    if (!res || !res.ok) {
      toast('已经是当前可用装备的最优搭配了', 'ghost');
      return;
    }
    commit(char);

    const rows = res.changes.map(c => {
      const from = c.from ? `${esc(c.from.name)}` : '空';
      const to = c.to ? `${esc(c.to.name)}` : '空';
      return `<div class="ui-result-row"><span>${esc(c.slotName)}</span>` +
        `<span class="ui-result-row__val" data-tone="good">${from} → ${to}` +
        `<span class="ui-result-row__sub">+${fmt(c.gain)}</span></span></div>`;
    }).join('');

    ui.openModal({
      title: `一键穿戴 · ${char.name || ''}`,
      body: powerHead(res.powerBefore, res.powerAfter) +
        `<div class="ui-result-block">${rows}</div>`,
      actions: [{ label: '好的', tone: 'primary' }]
    });
  }

  /* ── 一键全员配装 ────────────────────────────────────── */

  function runAutoEquipAll() {
    const api = ops();
    const ui = uiComp();
    if (!api || !ui) return;

    ui.confirmModal({
      title: '全员配装',
      okText: '开始配装',
      okTone: 'gold',
      body: `<p class="text-sm text-gray-300 leading-relaxed">` +
        `会先把<b class="text-white">所有角色</b>的装备与铭文全部卸下，再按裸装战力从高到低重新分配。</p>` +
        `<p class="text-xs text-gray-500 mt-2">装备不会丢失，仍在背包里；已手动搭配的方案会被覆盖。</p>`,
      onOk: () => {
        const res = api.autoEquipAll();
        if (!res || !res.ok) { toast('暂无可分配的装备', 'warning'); return; }
        commit(null);

        const top = res.characters.slice(0, 8).map(c =>
          `<div class="ui-result-row"><span>${esc(c.name)}</span>` +
          `<span class="ui-result-row__val" data-tone="good">装备 ${c.count} 件` +
          `<span class="ui-result-row__sub">+${fmt(c.after - c.before)}</span></span></div>`
        ).join('');
        const more = res.characters.length > 8
          ? `<div class="text-xs text-gray-500 mt-2">… 另有 ${res.characters.length - 8} 名角色也拿到了装备</div>`
          : '';

        ui.openModal({
          title: '全员配装完成',
          body: powerHead(res.powerBefore, res.powerAfter) +
            `<div class="text-xs text-gray-400 mb-2">共分配 ${res.equipped} 件装备/铭文</div>` +
            `<div class="ui-result-block">${top}</div>${more}`,
          actions: [{ label: '好的', tone: 'primary' }]
        });
      }
    });
  }

  /* ── 一键上阵 ────────────────────────────────────────── */

  function runAutoFormation() {
    const api = ops();
    const ui = uiComp();
    if (!api || !ui) return;

    const res = api.autoFormation();
    if (!res) return;
    if (!res.ok) {
      if (res.reason === 'no-character') toast('还没有任何角色', 'warning');
      else toast('当前已是战力最高的阵容', 'ghost');
      return;
    }
    commit(null);

    const members = res.members.map((m, i) =>
      `<div class="ui-result-row"><span>${i + 1}. ${esc(m.name)}</span>` +
      `<span class="ui-result-row__val" data-tone="flat">${fmt(m.power)}</span></div>`
    ).join('');
    const diff = [];
    if (res.added.length) diff.push(`新增 ${res.added.map(a => esc(a.name)).join('、')}`);
    if (res.removed.length) diff.push(`移出 ${res.removed.map(a => esc(a.name)).join('、')}`);

    ui.openModal({
      title: '一键上阵',
      body: powerHead(res.powerBefore, res.powerAfter) +
        (diff.length ? `<div class="text-xs text-gray-400 mb-2">${diff.join(' · ')}</div>` : '') +
        `<div class="ui-result-block">${members}</div>`,
      actions: [{ label: '好的', tone: 'primary' }]
    });
  }

  /* ── 一键升级（静默版，不弹 alert）──────────────────── */

  function runAutoLevelUp() {
    const api = ops();
    const char = sel();
    if (!api) return;
    if (!char) { toast('请先在下方选择一个角色', 'warning'); return; }

    const res = api.autoLevelUp(char);
    if (!res) return;
    if (!res.ok) {
      if (res.reason === 'max-level') toast('已达到满级', 'warning');
      else if (res.reason === 'need-star') toast(`当前星级上限 Lv.${res.cap}，请先升星`, 'warning');
      else toast('金币不足，先去挂机或扫荡攒点金币', 'warning');
      return;
    }
    commit(char);
    // C5：连升 N 级 = N 次（与手动升级同一事件，进度口径一致）
    try { if (typeof window.bumpGoal === 'function') window.bumpGoal('levelup', res.levels); } catch (e) { /* ignore */ }
    try { if (typeof renderDailyGoals === 'function') renderDailyGoals(); } catch (e) { /* ignore */ }
    try { if (typeof refreshRedDots === 'function') refreshRedDots(); } catch (e) { /* ignore */ }
    toast(`【${char.name}】Lv.${res.from} → Lv.${res.to}（消耗金币 ${fmt(res.goldSpent)}）`, 'success', 3000);
  }

  /* ── 一键领取全部 ────────────────────────────────────── */

  function runClaimAll() {
    const api = ops();
    const ui = uiComp();
    if (!api || !ui) return;
    const res = api.claimAll();
    if (!res || !res.ok) { toast('暂无可领取的收益', 'ghost'); return; }
    try { if (typeof updateUI === 'function') updateUI(); } catch (e) { /* ignore */ }
    try { if (typeof renderIdlePanel === 'function') renderIdlePanel(); } catch (e) { /* ignore */ }
    try { if (typeof renderDailyGoals === 'function') renderDailyGoals(); } catch (e) { /* ignore */ }
    try { if (typeof refreshRedDots === 'function') refreshRedDots(); } catch (e) { /* ignore */ }
    const lines = res.results.map(r => {
      if (r.text) {
        return `<div class="ui-result-row"><span>${esc(r.label)}</span>` +
          `<span class="ui-result-row__val" data-tone="gold">${esc(r.text)}</span></div>`;
      }
      const rw = r.rewards || {};
      const mats = Object.keys(rw.materials || {}).map(k => `${k} +${fmt(rw.materials[k])}`).join(' · ');
      return `<div class="ui-result-row"><span>${esc(r.label)}</span>` +
        `<span class="ui-result-row__val" data-tone="gold">金币 +${fmt(rw.gold || 0)}` +
        `<span class="ui-result-row__sub">经验 +${fmt(rw.exp || 0)}${mats ? ' · ' + esc(mats) : ''}</span></span></div>`;
    }).join('');
    ui.openModal({
      title: '一键领取',
      body: `<div class="ui-result-block">${lines}</div>`,
      actions: [{ label: '好的', tone: 'primary' }]
    });
  }

  /* ── 初始化 ──────────────────────────────────────────── */

  function initQuickOps() {
    const bind = (id, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', handler);
    };
    bind('quickEquipBtn', runAutoEquip);
    bind('quickEquipAllBtn', runAutoEquipAll);
    bind('quickFormationBtn', runAutoFormation);
    // quickLevelUp / quickClaimAllBtn 由 home.js / 首页面板复用同一 handler
    bind('quickClaimAllBtn', runClaimAll);
  }

  const api = {
    initQuickOps,
    runAutoEquip, runAutoEquipAll, runAutoFormation, runAutoLevelUp, runClaimAll
  };
  const segs = 'Game.ui.quickOps'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__quickOpsUI = api;

  window.initQuickOps = initQuickOps;
  window.runAutoEquip = runAutoEquip;
  window.runAutoEquipAll = runAutoEquipAll;
  window.runAutoFormation = runAutoFormation;
  window.runAutoLevelUp = runAutoLevelUp;
  window.runClaimAll = runClaimAll;
})();
