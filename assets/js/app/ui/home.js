/**
 * home.js —— 首页与全局 UI（顶栏刷新 / 推荐关卡 / 事件绑定 / 移动端导航）
 *
 * 由 index.html 内联主脚本**整段原样搬入**（P5，2026-09-12）。刻意不做任何重排 /
 * 重命名 / 重缩进 —— 保证"搬代码不改变行为"，证据是 `npm run check:numbers` 的
 * 6 场战斗快照逐位一致。因此本文件保留内联的 4 空格缩进，**不要全局格式化**。
 *
 * 承载：updateUI · updateHomeRecommendedStage · bindEvents · initMobileNav
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

    // ⓘ 本段（原 1050 行起，1 个函数 / 264 行）已于 2026-09-12 由 P5 抽离
    //    → assets/js/app/data/stage_expand.js（Game.data.stageExpand）
    //    该模块加载早于本内联脚本，并已把函数名逐个挂到 window，故下面的调用点零改动。

    // 加载失败时的本地兜底数据

    // 更新UI
    function updateUI() {
      // 更新玩家信息
      const playerLevel = document.getElementById('playerLevel');
      if (playerLevel) playerLevel.textContent = `Lv.${gameData.player.level}`;
      
      const playerGems = document.getElementById('playerGems');
      if (playerGems) playerGems.textContent = gameData.player.gems.toLocaleString();
      
      const playerGold = document.getElementById('playerGold');
      if (playerGold) playerGold.textContent = gameData.player.gold.toLocaleString();
      
      // 更新首页信息
      const currentStageData = stagesData.find(stage => stage.id === gameData.currentStage);
      const currentStageEl = document.getElementById('currentStage');
      if (currentStageEl) currentStageEl.textContent = currentStageData ? currentStageData.name : '未开始';
      
      const totalPowerEl = document.getElementById('totalPower');
      if (totalPowerEl) totalPowerEl.textContent = calculateTotalPower().toLocaleString();
      
      const characterCountEl = document.getElementById('characterCount');
      if (characterCountEl) characterCountEl.textContent = `${gameData.characters.length}/${(charactersData && charactersData.length) ? charactersData.length : gameData.characters.length}`;

      updateHomeRecommendedStage();
      
      // 更新当前选中的角色 (如果是养成页面)
      if (selectedCharacter) {
        selectCharacterToCultivate(selectedCharacter);
      }
      renderCultivateFormationUI();
    }

    function updateHomeRecommendedStage() {
      const nameEl = document.getElementById('recommendedStageName');
      const powerEl = document.getElementById('recommendedStagePower');
      const btn = document.getElementById('recommendedStageBtn');
      if (!nameEl || !powerEl || !btn) return;
      const stage = stagesData.find(s => s && s.id === gameData.currentStage) || stagesData[0] || null;
      if (!stage) {
        nameEl.textContent = '-';
        powerEl.textContent = '推荐战斗力: -';
        btn.onclick = () => switchPage('stages');
        return;
      }
      nameEl.textContent = stage.name || '-';
      powerEl.textContent = `推荐战斗力: ${(stage.recommendedPower || 0).toLocaleString()}`;
      btn.onclick = () => goToStage(stage.id);
    }

    // 绑定事件

    function bindEvents() {
      // 导航按钮
      document.querySelectorAll('.nav-btn, .footer-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const target = btn.getAttribute('data-target');
          switchPage(target);
        });
      });
      
      // 抽卡按钮
      const singleGachaBtn = document.getElementById('singleGacha');
      if (singleGachaBtn) singleGachaBtn.addEventListener('click', () => performGacha(1));
      
      const tenGachaBtn = document.getElementById('tenGacha');
      if (tenGachaBtn) tenGachaBtn.addEventListener('click', () => performGacha(10));
      
      const continueGachaBtn = document.getElementById('continueGacha');
      if (continueGachaBtn) continueGachaBtn.addEventListener('click', () => {
        document.getElementById('gachaResult').classList.add('hidden');
        document.getElementById('gachaCards').innerHTML = '';
      });
      
      // 迭代4: 养成中心槽位点击 (使用 class 绑定)
      document.querySelectorAll('.cultivate-slot').forEach(slotEl => {
        slotEl.addEventListener('click', () => {
          const slot = slotEl.getAttribute('data-slot');
          if (slot.startsWith('ins-')) {
            const idx = parseInt(slot.split('-')[1]);
            openItemPicker(idx, true);
          } else {
            openItemPicker(slot, false);
          }
        });
      });

      // 物品选择弹窗
      const closeItemPickerBtn = document.getElementById('closeItemPicker');
      if (closeItemPickerBtn) closeItemPickerBtn.addEventListener('click', () => {
        document.getElementById('itemPickerModal').classList.add('hidden');
      });
      
      const unequipItemBtn = document.getElementById('unequipItemBtn');
      if (unequipItemBtn) unequipItemBtn.addEventListener('click', unequipItem);

      // 迭代4: 养成按钮事件
      const quickLevelUpBtn = document.getElementById('quickLevelUp');
      if (quickLevelUpBtn) quickLevelUpBtn.addEventListener('click', () => levelUpCharacter(true)); 
      
      const quickStarUpBtn = document.getElementById('quickStarUp');
      if (quickStarUpBtn) quickStarUpBtn.addEventListener('click', () => ascendCharacter(true));
      
      const quickSkillUpBtn = document.getElementById('quickSkillUp');
      if (quickSkillUpBtn) quickSkillUpBtn.addEventListener('click', upgradeSelectedSkill);

      const toggleFormationBtn = document.getElementById('toggleFormationBtn');
      if (toggleFormationBtn) toggleFormationBtn.addEventListener('click', toggleSelectedCharacterFormation);

      const resetCharacterBtn = document.getElementById('resetCharacterBtn');
      if (resetCharacterBtn) resetCharacterBtn.addEventListener('click', resetSelectedCharacter);

      // 进阶功能按钮
      const showAttributesBtn = document.getElementById('showAttributesBtn');
      if (showAttributesBtn) showAttributesBtn.addEventListener('click', showDetailedAttributes);
      
      const costumeBtn = document.getElementById('costumeBtn');
      if (costumeBtn) costumeBtn.addEventListener('click', () => alert('时装系统暂未开放，敬请期待！'));
      
      const awakenBtn = document.getElementById('awakenBtn');
      if (awakenBtn) awakenBtn.addEventListener('click', () => openAwakenModal(true));
      const awakenConfirmBtn = document.getElementById('awakenConfirmBtn');
      if (awakenConfirmBtn) awakenConfirmBtn.addEventListener('click', () => confirmAwaken());

      // 筛选
      const charFilter = document.getElementById('characterFilter');
      if (charFilter) charFilter.addEventListener('change', updateCharacterSelectionBar);

      // 战斗结果
      const continueBattleBtn = document.getElementById('continueBattle');
      if (continueBattleBtn) continueBattleBtn.addEventListener('click', () => {
        closeBattleModal();
      });

      const battleSpeed1 = document.getElementById('battleSpeed1');
      if (battleSpeed1) battleSpeed1.addEventListener('click', () => setBattleSpeed(1));
      const battleSpeed2 = document.getElementById('battleSpeed2');
      if (battleSpeed2) battleSpeed2.addEventListener('click', () => setBattleSpeed(2));
      const battleSpeed4 = document.getElementById('battleSpeed4');
      if (battleSpeed4) battleSpeed4.addEventListener('click', () => setBattleSpeed(4));
      const battleSkipBtn = document.getElementById('battleSkipBtn');
      if (battleSkipBtn) battleSkipBtn.addEventListener('click', () => skipBattle());
      const battleFoldBtn = document.getElementById('battleFoldBtn');
      if (battleFoldBtn) battleFoldBtn.addEventListener('click', () => toggleBattleFold());

      const lastBattleReportBtn = document.getElementById('lastBattleReportBtn');
      if (lastBattleReportBtn) lastBattleReportBtn.addEventListener('click', () => openLastBattleReport());
      
      // 领取离线收益
      const claimRewardsBtn = document.getElementById('claimOfflineRewards');
      if (claimRewardsBtn) claimRewardsBtn.addEventListener('click', claimOfflineRewards);
      
      // 挑战关卡 (动态绑定改为事件代理或重新绑定)
      updateStagesList(); // 确保关卡列表更新并绑定事件
      
      // 调试菜单事件
      const debugToggleBtn = document.getElementById('debugToggle');
      if (debugToggleBtn) {
        let lastClick = 0;
        debugToggleBtn.addEventListener('click', () => {
          const panel = document.getElementById('debugPanel');
          panel.classList.toggle('hidden');
          if (!panel.classList.contains('hidden')) updateDebugUI();

          const now = Date.now();
          const logger = document.getElementById('mobile-logger');
          if (logger && now - lastClick < 500) {
            logger.style.display = logger.style.display === 'none' ? 'block' : 'none';
          }
          lastClick = now;
        });
      }
      
      const closeDebugBtn = document.getElementById('closeDebug');
      if (closeDebugBtn) closeDebugBtn.addEventListener('click', () => {
        document.getElementById('debugPanel').classList.add('hidden');
      });
    }

    function initMobileNav() {}

  // ── 对外暴露（内联 / 其它模块 / HTML onclick 都靠裸标识符或 window 取用）──
  window.updateUI = updateUI;
  window.updateHomeRecommendedStage = updateHomeRecommendedStage;
  window.bindEvents = bindEvents;
  window.initMobileNav = initMobileNav;

  const api = { updateUI, updateHomeRecommendedStage, bindEvents, initMobileNav };
  const segs = 'Game.ui.home'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__home = api;
})();
