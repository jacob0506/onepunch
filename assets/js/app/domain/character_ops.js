/**
 * character_ops.js —— 角色养成运算（升级 / 升星 / 觉醒 / 技能升级 / 战力与成本公式 / 星级 HTML）
 *
 * 由 index.html 内联主脚本**整段原样搬入**（P5，2026-09-12）。刻意不做任何重排 /
 * 重命名 / 重缩进 —— 保证"搬代码不改变行为"，证据是 `npm run check:numbers` 的
 * 6 场战斗快照逐位一致。因此本文件保留内联的 4 空格缩进，**不要全局格式化**。
 *
 * 承载：getAwakenProfile · getAwakenCost · upgradeSelectedSkill · calculateSkillUpgradeCost · levelUpCharacter · ascendCharacter · calculateTotalPower · calculateFormationPower · calculateLevelUpCost · getStarsHtml
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


    function getAwakenProfile(char) {
      if (!char) return null;
      const p = AWAKEN_PROFILES[char.id];
      if (p) return p;
      if (char.rarity === 'SUR') return { name: '终极觉醒', desc: '觉醒提升', bonus: { atkPercent: 14, hpPercent: 14, critRate: 6, tenacity: 10 }, passiveEffect: '每回合开始时，获得自身生命上限6%的护盾' };
      if (char.rarity === 'UR') return { name: '高级觉醒', desc: '觉醒提升', bonus: { atkPercent: 10, hpPercent: 10, critRate: 4, tenacity: 8 }, passiveEffect: '' };
      return null;
    }

    function getAwakenCost(char) {
      if (!char) return null;
      const rarity = char.rarity;
      if (rarity === 'SUR') return { gold: 80000, gems: 800, fragments: 60 };
      if (rarity === 'UR') return { gold: 30000, gems: 400, fragments: 30 };
      return null;
    }

    function upgradeSelectedSkill() {
      if (!selectedCharacter) return;
      const skill = selectedCharacter.skills && selectedCharacter.skills[0];
      if (!skill) return;
      const currentLevel = skill.level || 1;
      const cost = calculateSkillUpgradeCost(currentLevel);
      
      if (gameData.player.gold < cost) {
        alert(`金币不足！升级技能需要 ${cost} 金币`);
        return;
      }
      
      gameData.player.gold -= cost;
      skill.goldSpentOnUpgrades = (skill.goldSpentOnUpgrades || 0) + cost;
      skill.level = currentLevel + 1;
      
      // 更新描述中的数值 (简单正则替换示例)
      // 注意：这只是一个演示逻辑，真实情况应从配置读取
      const match = skill.description.match(/(\d+)%/);
      if (match) {
        const newVal = parseInt(match[1]) + 10;
        skill.description = skill.description.replace(match[0], `${newVal}%`);
      }

      updateUI();
      selectCharacterToCultivate(selectedCharacter);
      saveGameProgress();
      alert(`技能 [${skill.name}] 已升级至 Lv.${skill.level}`);
    }

    function calculateSkillUpgradeCost(level) {
      return level * 1000;
    }

    // 角色升级 (迭代4 兼容重构)

    function levelUpCharacter(toMax = false) {
      if (!selectedCharacter) return;
      
      const MAX_GLOBAL_LEVEL = GAME_CONFIG.maxLevel || 150;
      // 每一星级解锁更高等级上限：30, 45, 60, 75, 90, 105, 120, 150
      let maxLevel = 15 + (selectedCharacter.stars * 15);
      if (selectedCharacter.stars >= 8) maxLevel = MAX_GLOBAL_LEVEL;
      
      if (selectedCharacter.level >= maxLevel) {
        if (selectedCharacter.level >= MAX_GLOBAL_LEVEL) {
          alert('已达到满级 150 级！');
        } else {
          alert(`当前星级最高等级为 ${maxLevel} 级，请先升星！`);
        }
        return;
      }
      
      let leveledCount = 0;
      while (selectedCharacter.level < maxLevel) {
        const cost = calculateLevelUpCost(selectedCharacter.level);
        if (gameData.player.gold < cost) {
          if (leveledCount === 0) alert(`金币不足！升级需要 ${cost.toLocaleString()} 金币`);
          break;
        }
        
        gameData.player.gold -= cost;
        selectedCharacter.goldSpentOnLevelUps = (selectedCharacter.goldSpentOnLevelUps || 0) + cost;
        selectedCharacter.level++;
        selectedCharacter.exp = 0;
        
        leveledCount++;
        if (!toMax) break;
      }
      
      if (leveledCount > 0) {
        updateUI();
        selectCharacterToCultivate(selectedCharacter);
        saveGameProgress();
      }
    }

    // 角色升星 (迭代4 兼容重构)

    function ascendCharacter(toMax = false) {
      if (!selectedCharacter) return;
      
      const MAX_STARS = GAME_CONFIG.maxStars || 8;
      if (selectedCharacter.stars >= MAX_STARS) {
        alert('已达到最高星级！');
        return;
      }
      
      let ascendedCount = 0;
      while (selectedCharacter.stars < MAX_STARS) {
        // 升星消耗公式：当前星级 * 20 (星级越高消耗越高)
        const requiredFragments = selectedCharacter.stars * 20;
        const ownedFragments = gameData.fragments[selectedCharacter.id] || 0;
        
        if (ownedFragments < requiredFragments) {
          if (ascendedCount === 0) {
            alert(`碎片不足！需要 ${requiredFragments} 碎片，当前拥有 ${ownedFragments}`);
          }
          break;
        }
        
        gameData.fragments[selectedCharacter.id] -= requiredFragments;
        selectedCharacter.stars++;
        
        ascendedCount++;
        if (!toMax) break;
      }
      
      if (ascendedCount > 0) {
        updateUI();
        selectCharacterToCultivate(selectedCharacter);
        saveGameProgress();
      }
    }

    function calculateTotalPower() {
      return calculateFormationPower();
    }

    function calculateFormationPower() {
      ensureFormation();
      const ids = (gameData.formation || []).filter(Boolean);
      return ids.reduce((sum, id) => {
        const c = gameData.characters.find(ch => ch && ch.id === id);
        return sum + (c ? calculateCharacterPower(c) : 0);
      }, 0);
    }

    function calculateLevelUpCost(level) {
      // 适配 150 级：采用 1.5 次幂增长并增加后期系数
      // 1级 -> 100
      // 50级 -> 约 5.3万
      // 100级 -> 约 20万
      // 150级 -> 约 45万
      return Math.floor(100 * Math.pow(level, 1.5) * (1 + level / 100));
    }

    // 获取职业名称
    // 名称映射（职业 / 阵营 / 装备类型 / 铭文类型 / 属性 / 难度）单一实现：core/names.js
    // 以 window.getClassName / getFactionName / getEquipmentTypeName / getInscriptionTypeName
    //   / getAttributeName / getAttributeUnit / getDifficultyName / getDifficultyClass 形式提供。
    // 新增阵营（FACTION_NAMES）或类型时，只改那个文件。
    // 注意：getStarsHtml 仍在下方内联（依赖 GAME_CONFIG，未纳入本轮抽离）。

    // 获取星级HTML

    function getStarsHtml(stars) {
      let html = '<div class="flex flex-wrap justify-center gap-1 max-w-[200px]">';
      const MAX_STARS = GAME_CONFIG.maxStars || 8;
      for (let i = 0; i < MAX_STARS; i++) {
        const color = i < stars ? 'text-yellow-400' : 'text-gray-600';
        // 超过5星使用红星表示高级感
        const iconColor = (i >= 5 && i < stars) ? 'text-red-500' : color;
        html += `<i class="fa fa-star ${iconColor} drop-shadow-[0_0_5px_rgba(250,200,0,0.3)] text-base md:text-xl"></i>`;
      }
      html += '</div>';
      return html;
    }

  // ── 对外暴露（内联 / 其它模块 / HTML onclick 都靠裸标识符或 window 取用）──
  window.getAwakenProfile = getAwakenProfile;
  window.getAwakenCost = getAwakenCost;
  window.upgradeSelectedSkill = upgradeSelectedSkill;
  window.calculateSkillUpgradeCost = calculateSkillUpgradeCost;
  window.levelUpCharacter = levelUpCharacter;
  window.ascendCharacter = ascendCharacter;
  window.calculateTotalPower = calculateTotalPower;
  window.calculateFormationPower = calculateFormationPower;
  window.calculateLevelUpCost = calculateLevelUpCost;
  window.getStarsHtml = getStarsHtml;

  const api = { getAwakenProfile, getAwakenCost, upgradeSelectedSkill, calculateSkillUpgradeCost, levelUpCharacter, ascendCharacter, calculateTotalPower, calculateFormationPower, calculateLevelUpCost, getStarsHtml };
  const segs = 'Game.domain.characterOps'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__characterOps = api;
})();
