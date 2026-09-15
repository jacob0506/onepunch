/**
 * character_view.js —— 角色详情 / 被动预览文本
 *
 * 由 index.html 内联主脚本**整段原样搬入**（P5，2026-09-12）。
 *
 * 承载：getCharacterPassivePreviewText（cultivate.js 在用） · showCharacterDetail（inventory.js 在用）
 *
 * 🧹 B6（2026-09-13）删除 3 个死函数：updateCharactersList / updateFormation / editFormation
 *    —— 它们的容器（#charactersList / #formationSlotN）早在旧版 UI 迭代中就被移除，
 *    全仓（含 HTML onclick）无任何调用点。若将来要重做角色卡片网格，直接用
 *    Game.ui.components.charCard（见 components.css / components.js），不要复活旧实现。
 *
 * ⚠️ 裸标识符依赖：本模块的函数读写内联顶层声明的 `let/const`
 *    （gameData / charactersData / GAME_CONFIG …）。
 *    它们落在 classic script 的**全局词法环境**里，跨 <script> 可按裸名访问；
 *    但本文件加载**早于**内联主脚本，所以**只能**在函数体内使用 —— 模块顶层读写会命中 TDZ。
 *
 * ⚠️ 对外暴露：文件末尾把每个顶层函数 `window.X = X`。新增函数请同步补一行。

 */
(() => {
  'use strict';


    function getCharacterPassivePreviewText(char) {
      if (!char) return '';
      const parts = [];
      if (char.passive) parts.push(String(char.passive));
      if (char.awakened) {
        const p = getAwakenProfile(char);
        if (p && p.passiveEffect) parts.push(`觉醒：${p.passiveEffect}`);
      }
      const equipments = char.equipments || {};
      Object.values(equipments).forEach(item => {
        if (item && item.passiveEffect) parts.push(String(item.passiveEffect));
      });
      const setCounts = {};
      const inscriptions = Array.isArray(char.inscriptions) ? char.inscriptions : [];
      inscriptions.forEach(ins => {
        if (!ins) return;
        if (ins.passiveEffect) parts.push(String(ins.passiveEffect));
        if (ins.setEffect) {
          const setName = ins.name.split('铭文')[0];
          setCounts[setName] = (setCounts[setName] || 0) + 1;
        }
      });
      for (const [name, count] of Object.entries(setCounts)) {
        const insData = inscriptionsData.find(i => i && i.name && i.name.startsWith(name));
        if (insData && insData.setEffect && count >= insData.setEffect.pieces) {
          if (insData.setEffect.effect) parts.push(String(insData.setEffect.effect));
        }
      }
      return parts.filter(Boolean).join('；');
    }

    // 存量数据迁移：将多出的同名角色转化为碎片（见 data/characters.js）

    // 显示角色详情 —— B6（2026-09-13）用组件库重建：
    // 旧版依赖的 #characterDetailModal 一整块 DOM 已在历史 UI 迭代中被删除，
    // 导致本函数抛 TypeError（还连累 inventory.js 的强化/精炼跳过 saveGameProgress —— 真实丢档 bug）。
    // 新实现：Game.ui.components.openModal + token/组件类，零一次性样式。
    function showCharacterDetail(char) {
      selectedCharacter = char;
      const stats = calculateTotalStats(char);
      const C = window.__uiComponents || window.Game.ui.components;
      if (!C) return;

      const maxLevel = 10 + (char.stars * 5);
      const expPct = Math.min(100, Math.max(0, (char.exp / calculateExpToNextLevel(char.level)) * 100));
      const rar = String(char.rarity || '').toLowerCase();
      const fragments = gameData.fragments[char.id] || 0;

      const equipIcons = { weapon: 'gavel', armor: 'shield', helmet: 'user-secret', shoes: 'paw', accessory: 'sun-o' };
      const equipSlot = (key) => {
        const item = (char.equipments || {})[key];
        return '<div style="width:44px;flex-shrink:0">' +
          (item
            ? '<img src="' + C.esc(item.imageUrl) + '" alt="' + C.esc(item.name || '') + '" class="ui-card__img ui-card__img--square" style="border-radius:var(--radius-md);border:2px solid var(--c-rarity-' + C.esc(String(item.rarity || 'r').toLowerCase()) + ')">'
            : '<div class="ui-card__ph ui-card__ph--square" style="border-radius:var(--radius-md);font-size:15px"><i class="fa fa-' + equipIcons[key] + '"></i></div>') +
          '</div>';
      };
      const insSlot = (i) => {
        const ins = (char.inscriptions || [])[i];
        return '<div style="width:44px;flex-shrink:0">' +
          (ins
            ? '<img src="' + C.esc(ins.imageUrl) + '" alt="' + C.esc(ins.name || '') + '" class="ui-card__img ui-card__img--square" style="border-radius:50%;border:2px solid var(--c-rarity-sr)">'
            : '<div class="ui-card__ph ui-card__ph--square" style="border-radius:50%;font-size:15px"><i class="fa fa-diamond"></i></div>') +
          '</div>';
      };

      const coreStat = (label, val) =>
        '<div class="rounded p-2 text-center" style="background:rgba(0,0,0,0.4)">' +
        '<div class="text-[10px]" style="color:var(--c-text-dim)">' + label + '</div>' +
        '<div class="font-black text-sm">' + C.esc(val) + '</div></div>';

      // E5：好感一行 —— 养成页是玩家最常看角色的地方，好感入口放这里最好找
      const favApi = window.__favor;
      let favLine = '';
      if (favApi && char.id && typeof favApi.progress === 'function') {
        try {
          const fp = favApi.progress(char.id);
          const fs = favApi.summary(char.id);
          const chN = (fs.chapters || []).length;
          favLine = '<div class="text-xs mt-1" style="color:var(--c-text-dim)">' +
            '<i class="fa fa-heart mr-1" style="color:var(--c-accent)"></i>好感 Lv.' + C.esc(fp.level) + ' ' + C.esc(fp.title) +
            (chN ? ' · 剧情 ' + fs.readCount + '/' + chN + ' 章' : '') +
            '</div>';
        } catch (e) { favLine = ''; }
      }

      const skill = (char.skills || [])[0];
      const skillHtml = skill
        ? '<div class="ui-panel ui-panel--tight"><div class="flex justify-between items-center">' +
          '<b class="text-sm">' + C.esc(skill.name) + ' <span class="text-xs" style="color:var(--c-primary)">Lv.' + C.esc(skill.level || 1) + '</span></b>' +
          '<span class="ui-tag" data-tone="primary">能量: ' + ((/速度/.test(skill.description || '') && /(增加|提升)/.test(skill.description || '') && !/降低/.test(skill.description || '')) ? 0 : 2) + '</span></div>' +
          '<p class="text-xs mt-1" style="color:var(--c-text-dim)">' + C.esc(skill.description) + '</p></div>'
        : '';

      const body =
        '<div class="flex gap-3">' +
          '<div class="ui-card" data-rarity="' + rar + '" style="width:104px;flex-shrink:0">' +
            '<img class="ui-card__img" src="' + C.esc(char.imageUrl) + '" alt="' + C.esc(char.name) + '">' +
          '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div class="flex items-center gap-1.5 flex-wrap">' + C.tag(char.rarity, rar) + C.tag(getClassName(char.class), char.class) + '</div>' +
            '<div class="mt-1.5">' + C.starRow(char.stars || 0, GAME_CONFIG.maxStars || 8) + '</div>' +
            '<div class="text-xs mt-1.5" style="color:var(--c-text-dim)">Lv.' + C.esc(char.level) + ' / ' + maxLevel + ' · 碎片 ' + C.esc(fragments) + '</div>' +
            '<div class="mt-1">' + C.progress(expPct, 'accent', true) + '</div>' +
            '<div class="mt-1.5 text-sm font-black" style="color:var(--c-accent)"><i class="fa fa-bolt mr-1"></i>战力 ' + C.esc(Math.round(calculateCharacterPower(char)).toLocaleString()) + '</div>' +
            favLine +
          '</div>' +
        '</div>' +
        '<hr class="ui-divider">' +
        '<div class="grid grid-cols-4 gap-1.5">' +
          coreStat('攻击', stats.attack) + coreStat('防御', stats.defense) + coreStat('生命', stats.health) + coreStat('速度', stats.speed) +
        '</div>' +
        '<div class="flex flex-wrap gap-1 mt-2">' +
          C.tag('暴击 ' + stats.critRate + '%', 'danger') + C.tag('闪避 ' + stats.dodgeRate + '%', 'info') +
          C.tag('格挡 ' + stats.blockRate + '%', 'success') + C.tag('免伤 ' + stats.dmgReduc + '%', 'warning') +
          C.tag('吸血 ' + stats.lifesteal + '%', 'sur') + C.tag('命中 ' + stats.effectHit + '%', 'primary') +
        '</div>' +
        '<hr class="ui-divider">' +
        '<div class="text-[10px] font-bold uppercase mb-1.5" style="color:var(--c-text-dim)">装备 / 铭文</div>' +
        '<div class="flex gap-1.5 items-center flex-wrap">' +
          ['weapon', 'armor', 'helmet', 'shoes', 'accessory'].map(equipSlot).join('') +
          '<span style="width:1px;height:32px;margin:0 4px;background:var(--c-border-strong)"></span>' +
          insSlot(0) + insSlot(1) +
        '</div>' +
        '<hr class="ui-divider">' +
        '<div class="text-[10px] font-bold uppercase mb-1.5" style="color:var(--c-text-dim)">技能</div>' +
        skillHtml +
        (getCharacterPassivePreviewText(char)
          ? '<p class="text-xs mt-2" style="color:var(--c-text-dim)"><i class="fa fa-magic mr-1" style="color:var(--c-rarity-sur)"></i>' + C.esc(getCharacterPassivePreviewText(char)) + '</p>'
          : '');

      C.openModal({
        title: char.name,
        body,
        actions: [
          {
            label: '查看档案', tone: 'primary',
            onClick: (close) => {
              close();
              if (typeof window.openCharArchive === 'function') window.openCharArchive(char.id);
            }
          },
          { label: '关闭', tone: 'ghost' }
        ]
      });
    }

  // ── 对外暴露（内联 / 其它模块 / HTML onclick 都靠裸标识符或 window 取用）──
  window.getCharacterPassivePreviewText = getCharacterPassivePreviewText;
  window.showCharacterDetail = showCharacterDetail;

  const api = { getCharacterPassivePreviewText, showCharacterDetail };
  const segs = 'Game.ui.characterView'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__characterView = api;
})();
