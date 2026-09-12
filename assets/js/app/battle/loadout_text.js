/**
 * loadout_text.js —— 搭载被动文本装配（单一实现 + 内联转发壳）
 *
 * 由 index.html 内联主脚本**整段原样搬入**（P5，2026-09-12）。刻意不做任何重排 /
 * 重命名 / 重缩进 —— 保证"搬代码不改变行为"，证据是 `npm run check:numbers` 的
 * 6 场战斗快照逐位一致。因此本文件保留内联的 4 空格缩进，**不要全局格式化**。
 *
 * 承载：getLoadoutPassiveText · battleSceneDebugGetLoadoutPassiveText
 *
 * ⚠️ 裸标识符依赖：本模块的函数读写内联顶层声明的 `let/const`
 *    （gameData / charactersData / stagesData / GAME_CONFIG / AWAKEN_PROFILES …）。
 *    它们落在 classic script 的**全局词法环境**里，跨 <script> 可按裸名访问；
 *    但本文件加载**早于**内联主脚本，所以**只能**在函数体内使用 —— 模块顶层读写会命中 TDZ。
 *
 * ⚠️ 对外暴露：文件末尾把每个顶层函数 `window.X = X`，因此 index.html 内联调用点、
 *    其它模块以及 HTML 的 onclick 全部零改动。新增函数请同步补一行。

 */
(() => {
  'use strict';


    // ★ 战斗状态（battleSceneDebugState / …CoreState / …CatLinkState / …RainFlowerBondState）
    //   已于 2026-09-12 由 P2b 全部搬入 assets/js/app/battle/scene.js（唯一声明处）。
    //   该文件把 4 个绑定以 window 访问器重新暴露，裸标识符读写照旧可用；
    //   需要整体快照时用 window.__battleScene.getState()。
    // escapeHtml 单一实现：core/format.js（模块内已挂载到 window.escapeHtml，本文件不再重复定义）

        /**
     * ★ 单源：角色搭载（装备/铭文/觉醒）被动文本构建器
     * A1 旧引擎退役时从 simulateBattleLive 闭包中提升为脚本顶层唯一实现。
     * 此前正式引擎被迫用一份劣化副本：铭文套装效果按件数重复 push、且不校验
     * 套装件数阈值（1 件就触发 4 件套效果）——本单源化顺带修复该缺陷。
     */
    function getLoadoutPassiveText(char) {
      const parts = [];
      if (char && char.passive) parts.push(String(char.passive));
      if (char && char.awakened) {
        const p = getAwakenProfile(char);
        if (p && p.passiveEffect) parts.push('觉醒：' + String(p.passiveEffect));
      }

      const equipments = (char && char.equipments) || {};
      Object.values(equipments).forEach(item => {
        if (item && item.passiveEffect) parts.push(String(item.passiveEffect));
      });

      const inscriptions = Array.isArray(char && char.inscriptions) ? char.inscriptions : [];
      const setCounts = {};
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

    function battleSceneDebugGetLoadoutPassiveText(char) {
      return getLoadoutPassiveText(char);
    }

  // ── 对外暴露（内联 / 其它模块 / HTML onclick 都靠裸标识符或 window 取用）──
  window.getLoadoutPassiveText = getLoadoutPassiveText;
  window.battleSceneDebugGetLoadoutPassiveText = battleSceneDebugGetLoadoutPassiveText;

  const api = { getLoadoutPassiveText, battleSceneDebugGetLoadoutPassiveText };
  const segs = 'Game.battle.loadoutText'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__loadoutText = api;
})();
