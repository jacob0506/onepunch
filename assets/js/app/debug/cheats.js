/**
 * cheats.js —— 调试面板（管理员的禁忌之书：作弊按钮 + 碎片/资源/清档）
 *
 * 由 index.html 内联主脚本**整段原样搬入**（P5，2026-09-12）。刻意不做任何
 * 重排 / 重命名 / 重缩进 —— 保证"搬代码不改变行为"，证据是 `npm run check:numbers`
 * 的 6 场战斗快照逐位一致。因此本文件保留内联的 4 空格缩进，**不要全局格式化**。
 *
 * 承载：updateDebugUI · cheatResources · cheatFragments · cheatLevel · cheatSpecificFragments · cheatSpecificCharacter · populateDebugCharSelect · clearSave
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

    function updateDebugUI() {
      document.getElementById('debugGems').textContent = gameData.player.gems.toLocaleString();
      document.getElementById('debugGold').textContent = gameData.player.gold.toLocaleString();
      document.getElementById('debugLevel').textContent = gameData.player.level;
      document.getElementById('debugExp').textContent = gameData.player.exp.toLocaleString();
      
      const debugFragList = document.getElementById('debugFragments');
      debugFragList.innerHTML = '';
      
      // 显示所有角色的碎片 (包含 0 个的也显示，方便调试)
      charactersData.forEach(char => {
        const count = gameData.fragments[char.id] || 0;
        const item = document.createElement('div');
        item.className = 'flex justify-between border-b border-gray-800 py-1';
        item.innerHTML = `<span>${char.name}:</span><span class="${count > 0 ? 'text-primary' : 'text-gray-600'}">${count}</span>`;
        debugFragList.appendChild(item);
      });
    }

    window.cheatResources = function(type, amount) {
      gameData.player[type] += amount;
      updateUI();
      updateDebugUI();
      saveGameProgress();
    };

    window.cheatFragments = function(amount) {
      charactersData.forEach(char => {
        gameData.fragments[char.id] = (gameData.fragments[char.id] || 0) + amount;
      });
      updateUI();
      updateDebugUI();
      saveGameProgress();
    };

    window.cheatLevel = function(amount) {
      gameData.player.level += amount;
      updateUI();
      updateDebugUI();
      saveGameProgress();
    };

    window.cheatSpecificFragments = function() {
      const select = document.getElementById('debugCharSelect');
      const input = document.getElementById('debugFragAmount');
      const charId = select.value;
      const amount = parseInt(input.value) || 0;
      
      if (!charId) {
        uiToast('请先选择一个英雄！', 'danger');
        return;
      }
      
      if (amount <= 0) {
        uiToast('请输入有效的碎片数量！');
        return;
      }
      
      const char = charactersData.find(c => c.id === charId);
      if (!char) return;
      
      gameData.fragments[charId] = (gameData.fragments[charId] || 0) + amount;
      
      // 提示
      const tip = document.createElement('div');
      tip.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white px-4 py-2 rounded shadow-2xl z-[200] animate-bounce';
      tip.textContent = `成功获取 ${char.name} 碎片 x${amount}`;
      document.body.appendChild(tip);
      setTimeout(() => tip.remove(), 2000);
      
      updateUI();
      updateDebugUI();
      saveGameProgress();
    };

    window.cheatSpecificCharacter = function() {
      const select = document.getElementById('debugCharSelect');
      const charId = select.value;
      
      if (!charId) {
        uiToast('请先选择一个英雄！', 'danger');
        return;
      }
      
      const charData = charactersData.find(c => c.id === charId);
      if (!charData) return;

      const isOwned = gameData.characters.some(owned => owned.id === charId);
      
      if (isOwned) {
        // 已拥有，转化为碎片
        // ⚠️ P5 搬入时把 `yield` 改名为 `fragYield`：`yield` 是严格模式保留字，
        //    原内联是 sloppy mode 才能跑。纯局部变量改名，语义不变。
        const fragYield = GAME_CONFIG.fragmentYield[charData.rarity] || 50;
        gameData.fragments[charId] = (gameData.fragments[charId] || 0) + fragYield;
        uiToast(`已拥有该英雄，自动转化为 ${charData.name} 碎片 x${fragYield}`);
      } else {
        // 首次获取
        const charInstance = {
          ...JSON.parse(JSON.stringify(charData)),
          level: 1,
          exp: 0,
          stars: 1,
          equipment: { weapon: null, armor: null, helmet: null, shoes: null, accessory: null },
          inscriptions: [null, null]
        };
        if (charInstance.skills) charInstance.skills.forEach(s => s.level = 1);
        
        gameData.characters.push(charInstance);
        uiToast(`成功直接获取英雄：${charData.name}！`, 'success');
      }
      
      updateUI();
      updateDebugUI();
      saveGameProgress();
    };

    function populateDebugCharSelect() {
      const select = document.getElementById('debugCharSelect');
      if (!select) return;
      
      // 按稀有度排序
      const rarityOrder = { 'SUR': 5, 'UR': 4, 'SSR': 3, 'SR': 2, 'R': 1 };
      const sortedChars = [...charactersData].sort((a, b) => {
        if (rarityOrder[b.rarity] !== rarityOrder[a.rarity]) {
          return rarityOrder[b.rarity] - rarityOrder[a.rarity];
        }
        return a.name.localeCompare(b.name);
      });
      
      sortedChars.forEach(char => {
        const option = document.createElement('option');
        option.value = char.id;
        option.textContent = `[${char.rarity}] ${char.name}`;
        select.appendChild(option);
      });
    }

    window.clearSave = function() {
      if (confirm('真的要毁灭一切吗？数据将无法恢复！')) {
        if (window.__storage && typeof window.__storage.clear === 'function') window.__storage.clear();
        else localStorage.removeItem('cardGameData');
        location.reload();
      }
    };

  // ── 对外暴露（内联 / 其它模块 / HTML onclick 都靠裸标识符或 window 取用）──
  window.updateDebugUI = updateDebugUI;
  window.populateDebugCharSelect = populateDebugCharSelect;

  const api = { updateDebugUI, cheatResources, cheatFragments, cheatLevel, cheatSpecificFragments, cheatSpecificCharacter, populateDebugCharSelect, clearSave };
  const segs = 'Game.debug.cheats'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__debugCheats = api;
})();
