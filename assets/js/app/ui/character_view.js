/**
 * character_view.js —— 角色列表 / 详情 / 编队视图
 *
 * 由 index.html 内联主脚本**整段原样搬入**（P5，2026-09-12）。刻意不做任何重排 /
 * 重命名 / 重缩进 —— 保证"搬代码不改变行为"，证据是 `npm run check:numbers` 的
 * 6 场战斗快照逐位一致。因此本文件保留内联的 4 空格缩进，**不要全局格式化**。
 *
 * 承载：getCharacterPassivePreviewText · updateCharactersList · showCharacterDetail · updateFormation · editFormation
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

    // 存量数据迁移：将多出的同名角色转化为碎片

    // 更新角色列表

    function updateCharactersList() {
      const charactersList = document.getElementById('charactersList');
      charactersList.innerHTML = '';
      
      // 获取筛选和排序条件
      const filterRarity = document.getElementById('characterFilter').value;
      const sortBy = document.getElementById('characterSort').value;
      
      // 筛选角色
      let filteredCharacters = [...gameData.characters];
      if (filterRarity !== 'all') {
        filteredCharacters = filteredCharacters.filter(char => char.rarity === filterRarity);
      }
      
      // 排序角色
      filteredCharacters.sort((a, b) => {
        if (sortBy === 'power') {
          return calculateCharacterPower(b) - calculateCharacterPower(a);
        } else if (sortBy === 'level') {
          return b.level - a.level;
        } else if (sortBy === 'rarity') {
          const rarityOrder = { 'R': 1, 'SR': 2, 'SSR': 3, 'UR': 4, 'SUR': 5 };
          return rarityOrder[b.rarity] - rarityOrder[a.rarity];
        }
        return 0;
      });
      
      // 生成角色卡片
      filteredCharacters.forEach(char => {
        const cardElement = document.createElement('div');
        cardElement.className = `glass-effect rounded-lg overflow-hidden card-hover cursor-pointer rarity-border-${char.rarity.toLowerCase()}`;
        
        cardElement.innerHTML = `
          <div class="relative">
            <img src="${char.imageUrl}" alt="${char.name}" class="w-full aspect-square object-cover">
            <div class="absolute top-2 left-2 bg-black bg-opacity-70 rounded-full px-2 py-1 text-xs">
              <span class="text-rarity-${char.rarity.toLowerCase()} font-bold">${char.rarity}</span>
            </div>
            <div class="absolute top-2 right-2 bg-black bg-opacity-70 rounded-full px-2 py-1 text-xs">
              Lv.${char.level}
            </div>
            <div class="absolute bottom-2 right-2 flex">
              ${getStarsHtml(char.stars)}
            </div>
          </div>
          <div class="p-3">
            <div class="flex justify-between items-center mb-2">
              <h4 class="font-bold">${char.name}</h4>
              <span class="px-2 py-0.5 bg-class-${char.class} rounded text-xs">${getClassName(char.class)}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span>攻击: ${calculateCharacterAttack(char)}</span>
              <span>生命: ${calculateCharacterHealth(char)}</span>
            </div>
            <div class="mt-1 text-right">
              <span class="text-primary font-bold">战斗力: ${calculateCharacterPower(char)}</span>
            </div>
          </div>
        `;
        
        // 点击查看详情
        cardElement.addEventListener('click', () => showCharacterDetail(char));
        
        charactersList.appendChild(cardElement);
      });
    }

    // 显示角色详情

    function showCharacterDetail(char) {
      selectedCharacter = char;
      const stats = calculateTotalStats(char);
      
      // 更新详情UI
      document.getElementById('detailCharacterName').textContent = char.name;
      document.getElementById('detailCharacterImage').innerHTML = `<img src="${char.imageUrl}" alt="${char.name}" class="w-full h-full object-cover rounded-lg">`;
      document.getElementById('detailCharacterRarity').textContent = char.rarity;
      document.getElementById('detailCharacterRarity').className = `text-rarity-${char.rarity.toLowerCase()} font-bold`;
      document.getElementById('detailCharacterClass').textContent = getClassName(char.class);
      document.getElementById('detailCharacterClass').className = `ml-2 px-2 py-1 bg-class-${char.class} rounded text-xs`;
      
      // 星级
      document.querySelector('#detailCharacterImage + div + div + div .text-yellow-400').innerHTML = getStarsHtml(char.stars);
      
      // 等级和经验条
      const maxLevel = 10 + (char.stars * 5);
      document.getElementById('detailCharacterLevel').textContent = `${char.level}/${maxLevel}`;
      document.getElementById('detailCharacterExpBar').style.width = `${(char.exp / calculateExpToNextLevel(char.level)) * 100}%`;
      
      // 核心属性
      document.getElementById('detailCharacterAttack').textContent = stats.attack;
      document.getElementById('detailCharacterDefense').textContent = stats.defense;
      document.getElementById('detailCharacterHealth').textContent = stats.health;
      document.getElementById('detailCharacterSpeed').textContent = stats.speed;
      
      // 更新二级属性 (迭代2)
      const secondaryStats = [
        { id: 'critRate', name: '暴击率' },
        { id: 'dodgeRate', name: '闪避率' },
        { id: 'blockRate', name: '格挡率' },
        { id: 'dmgReduc', name: '免伤率' },
        { id: 'lifesteal', name: '吸血率' },
        { id: 'effectHit', name: '命中率' }
      ];
      secondaryStats.forEach(stat => {
        document.getElementById(`stat-${stat.id}`).textContent = `${stats[stat.id]}%`;
      });
      
      // 渲染装备槽位 (迭代2)
      const slots = ['weapon', 'armor', 'helmet', 'shoes', 'accessory'];
      slots.forEach(slot => {
        const item = char.equipments[slot];
        const slotEl = document.getElementById(`slot-${slot}`);
        if (item) {
          slotEl.innerHTML = `<img src="${item.imageUrl}" class="w-full h-full object-contain rounded border border-${item.rarity.toLowerCase()} p-1">`;
          slotEl.classList.remove('bg-gray-800');
          slotEl.classList.add('bg-black');
        } else {
          const icons = { weapon: 'gavel', armor: 'shield', helmet: 'user-secret', shoes: 'paw', accessory: 'sun-o' };
          slotEl.innerHTML = `<i class="fa fa-${icons[slot]} text-gray-600"></i>`;
          slotEl.classList.remove('bg-black');
          slotEl.classList.add('bg-gray-800');
        }
      });

      // 渲染铭文槽位
      for (let i = 0; i < 2; i++) {
        const ins = char.inscriptions[i];
        const slotEl = document.getElementById(`slot-ins-${i}`);
        if (ins) {
          slotEl.innerHTML = `<img src="${ins.imageUrl}" class="w-full h-full object-contain rounded-full border border-purple-500 p-1">`;
        } else {
          slotEl.innerHTML = `<i class="fa fa-diamond text-purple-900"></i>`;
        }
      }

      // 碎片数量
      document.getElementById('detailCharacterFragments').textContent = gameData.fragments[char.id] || 0;
      
      // 技能
      const skill = char.skills[0];
      const skillLevel = skill.level || 1;
      document.getElementById('detailCharacterSkill').innerHTML = `
        <div class="flex justify-between items-center">
          <h5 class="font-bold">${skill.name} <span class="text-primary text-xs ml-1">Lv.${skillLevel}</span></h5>
          <span class="text-xs bg-gray-700 px-2 py-1 rounded">能量: ${(/速度/.test(skill.description || '') && /(增加|提升)/.test(skill.description || '') && !/降低/.test(skill.description || '')) ? 0 : 2}</span>
        </div>
        <p class="text-sm text-gray-400 mt-1">${skill.description}</p>
      `;
      
      // 显示弹窗
      document.getElementById('characterDetailModal').classList.remove('hidden');
    }

    function updateFormation() {
      for (let i = 0; i < 5; i++) {
        const slotElement = document.getElementById(`formationSlot${i + 1}`);
        if (!slotElement) continue;
        
        const character = gameData.formation[i];
        
        if (character) {
          slotElement.innerHTML = `
            <img src="${character.imageUrl}" alt="${character.name}" class="w-10 h-10 rounded-full object-cover mr-3">
            <div>
              <h3 class="font-medium">${character.name}</h3>
              <p class="text-xs text-gray-400">Lv.${character.level} ${character.rarity}</p>
            </div>
          `;
        } else {
          slotElement.innerHTML = `
            <div class="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center mr-3">
              <i class="fa fa-plus text-gray-500"></i>
            </div>
            <div>
              <h3 class="font-medium">空位</h3>
              <p class="text-xs text-gray-400">点击添加角色</p>
            </div>
          `;
        }
        
        // 点击添加/更换角色 (使用 onclick 覆盖，防止多次绑定)
        slotElement.onclick = () => {
          switchPage('characters');
          alert('请在养成界面右侧【上阵设置（最多6人）】中调整上阵阵容。');
        };
      }
    }

    // 编辑阵容

    function editFormation() {
      switchPage('characters');
      alert('请在养成界面右侧【上阵设置（最多6人）】中调整上阵阵容。');
    }

  // ── 对外暴露（内联 / 其它模块 / HTML onclick 都靠裸标识符或 window 取用）──
  window.getCharacterPassivePreviewText = getCharacterPassivePreviewText;
  window.updateCharactersList = updateCharactersList;
  window.showCharacterDetail = showCharacterDetail;
  window.updateFormation = updateFormation;
  window.editFormation = editFormation;

  const api = { getCharacterPassivePreviewText, updateCharactersList, showCharacterDetail, updateFormation, editFormation };
  const segs = 'Game.ui.characterView'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__characterView = api;
})();
