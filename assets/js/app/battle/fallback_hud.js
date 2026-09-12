/**
 * fallback_hud.js —— 传统战斗兜底 HUD（速度 / 折叠 / 战报 / 结果结算 / 兼容入口 startBattle）
 *
 * 由 index.html 内联主脚本**整段原样搬入**（P5，2026-09-12）。刻意不做任何重排 /
 * 重命名 / 重缩进 —— 保证"搬代码不改变行为"，证据是 `npm run check:numbers` 的
 * 6 场战斗快照逐位一致。因此本文件保留内联的 4 空格缩进，**不要全局格式化**。
 *
 * 承载：setBattleSpeed · closeBattleModal · updateLastBattleReportButton · openLastBattleReport · skipBattle · toggleBattleFold · battleDelayMs · appendBattleLog · renderBattleHud · startBattle · showBattleResult
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


    function setBattleSpeed(multiplier) {
      battleRuntime.speed = multiplier;
      const b1 = document.getElementById('battleSpeed1');
      const b2 = document.getElementById('battleSpeed2');
      const b4 = document.getElementById('battleSpeed4');
      if (b1) b1.classList.toggle('text-primary', multiplier === 1);
      if (b2) b2.classList.toggle('text-primary', multiplier === 2);
      if (b4) b4.classList.toggle('text-primary', multiplier === 4);
    }

    function closeBattleModal() {
      document.getElementById('battleResultModal').classList.add('hidden');
      battleRuntime.skip = false;
      battleRuntime.running = false;
      battleRuntime.historyMode = false;
    }

    function updateLastBattleReportButton() {
      const btn = document.getElementById('lastBattleReportBtn');
      if (!btn) return;
      btn.classList.toggle('hidden', !lastBattleRecord);
    }

    function openLastBattleReport() {
      if (!lastBattleRecord) return;
      battleRuntime.historyMode = true;
      const record = lastBattleRecord;
      document.getElementById('battleResultTitle').textContent = record.isWin ? '战斗胜利!' : '战斗失败!';
      document.getElementById('battleResultTitle').className = record.isWin ? 'text-2xl font-bold text-green-400' : 'text-2xl font-bold text-red-400';
      document.getElementById('battleResultStage').textContent = record.stageName;
      document.getElementById('battleResultRounds').textContent = record.rounds;
      document.getElementById('battleResultMaxDamage').textContent = record.maxDamage;
      document.getElementById('battleResultHealing').textContent = record.healing;
      document.getElementById('battleResultExp').textContent = record.rewardsExp;
      document.getElementById('battleResultGold').textContent = record.rewardsGold;
      const logsContainer = document.getElementById('battleLogs');
      logsContainer.innerHTML = record.logsHtml || '';
      const itemsContainer = document.getElementById('battleResultItems');
      itemsContainer.innerHTML = record.itemsHtml || '';
      document.getElementById('battleResultModal').classList.remove('hidden');
      updateLastBattleReportButton();
      setTimeout(() => {
        logsContainer.scrollTop = logsContainer.scrollHeight;
      }, 50);
    }

    function skipBattle() {
      if (!battleRuntime.running) {
        closeBattleModal();
        return;
      }
      battleRuntime.skip = true;
    }

    function toggleBattleFold() {
      battleRuntime.foldLogs = !battleRuntime.foldLogs;
      const btn = document.getElementById('battleFoldBtn');
      if (btn) btn.classList.toggle('text-primary', battleRuntime.foldLogs);
    }

    function battleDelayMs() {
      if (battleRuntime.skip) return 0;
      const base = 180;
      return Math.max(0, Math.floor(base / Math.max(1, battleRuntime.speed)));
    }

    function appendBattleLog(logs, container, html) {
      const vfx = window.__battleVfx;
      const decorated = vfx && typeof vfx.decorateLogHtml === 'function' ? vfx.decorateLogHtml(html) : html;
      logs.push(decorated);
      if (container) {
        container.insertAdjacentHTML('beforeend', decorated);
        while (container.childNodes.length > 420) container.removeChild(container.firstChild);
        container.scrollTop = container.scrollHeight;
      }
      if (vfx && typeof vfx.triggerFromLogHtml === 'function') vfx.triggerFromLogHtml(decorated);
    }

    function renderBattleHud(team, enemies, turnOrder, round, stage) {
      const teamEl = document.getElementById('battleTeamPanel');
      const enemyEl = document.getElementById('battleEnemyPanel');
      const barEl = document.getElementById('battleTurnBar');
      if (!teamEl || !enemyEl || !barEl) return;

      const statusLabel = (type) => {
        const labels = {
          burn: { t: '灼', c: 'bg-red-900 text-red-200' },
          bleed: { t: '血', c: 'bg-red-900 text-red-200' },
          poison: { t: '毒', c: 'bg-green-900 text-green-200' },
          shock: { t: '电', c: 'bg-indigo-900 text-indigo-200' },
          stun: { t: '晕', c: 'bg-yellow-900 text-yellow-200' },
          charm: { t: '魅', c: 'bg-pink-900 text-pink-200' },
          taunt: { t: '嘲', c: 'bg-blue-900 text-blue-200' },
          immune: { t: '免', c: 'bg-purple-900 text-purple-200' },
          silence: { t: '封', c: 'bg-gray-800 text-gray-200' },
          ccImmune: { t: '控', c: 'bg-gray-800 text-gray-200' },
          limitField: { t: '场', c: 'bg-amber-900 text-amber-200' }
        };
        return labels[type] || null;
      };

      const renderUnit = (u) => {
        const hpPct = u.maxHp > 0 ? Math.max(0, Math.min(1, u.currentHp / u.maxHp)) : 0;
        const enhancedPct = u.enhancedHpMax > 0 ? Math.max(0, Math.min(1, (u.enhancedHp || 0) / u.enhancedHpMax)) : 0;
        const shieldPct = u.maxHp > 0 ? Math.max(0, Math.min(1, (u.shield || 0) / u.maxHp)) : 0;
        const statuses = (u.statuses || []).filter(s => s.turns > 0).slice(0, 6);
        const energy = Math.max(0, Math.min(u.maxEnergy || 4, u.energy || 0));
        const energyStr = energy > 0 ? '●'.repeat(energy) : '';
        const pills = statuses.map(s => {
          const m = statusLabel(s.type);
          if (!m) return '';
          return `<span class="inline-flex items-center justify-center w-4 h-4 rounded ${m.c} text-[9px] font-black">${m.t}</span>`;
        }).join('');

        const nameColor = u.isPlayer ? 'text-blue-300' : (u.isBoss ? 'text-purple-300' : 'text-red-300');
        return `
          <div class="flex items-center gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex justify-between items-center">
                <div class="truncate text-[11px] font-black ${nameColor}">${u.name}</div>
                <div class="text-[10px] text-gray-400 flex items-center gap-2">
                  <span>${Math.max(0, Math.floor(u.currentHp))}/${Math.max(0, Math.floor(u.maxHp))}</span>
                  <span class="text-blue-200 font-black">${energyStr}</span>
                </div>
              </div>
              <div class="relative h-2 bg-gray-800 rounded overflow-hidden mt-1">
                <div class="absolute left-0 top-0 bottom-0 bg-amber-500 opacity-70" style="width:${Math.floor(enhancedPct * 100)}%"></div>
                <div class="absolute left-0 top-0 bottom-0 bg-green-600" style="width:${Math.floor(hpPct * 100)}%"></div>
                <div class="absolute left-0 top-0 bottom-0 bg-purple-600 opacity-80" style="width:${Math.floor(shieldPct * 100)}%"></div>
              </div>
            </div>
            <div class="flex gap-1">${pills}</div>
          </div>
        `;
      };

      teamEl.innerHTML = team.map(renderUnit).join('');
      enemyEl.innerHTML = enemies.map(renderUnit).join('');

      const next = (turnOrder || []).slice(0, 10);
      const chip = (u) => {
        const color = u.isPlayer ? 'bg-blue-900 text-blue-200' : (u.isBoss ? 'bg-purple-900 text-purple-200' : 'bg-red-900 text-red-200');
        return `<div class="px-2 py-1 rounded-full text-[10px] font-black ${color} whitespace-nowrap">${u.name}</div>`;
      };
      barEl.innerHTML = `
        <div class="px-2 py-1 rounded-full bg-gray-800 text-[10px] font-black text-gray-200 whitespace-nowrap">回合 ${round}</div>
        ${stage && stage.modifiers && Array.isArray(stage.modifiers.affixes) ? stage.modifiers.affixes.map(a => `<div class="px-2 py-1 rounded-full bg-gray-700 text-[10px] font-bold text-gray-200 whitespace-nowrap">${a.name}</div>`).join('') : ''}
        ${next.map(chip).join('')}
      `;
    }

        /**
     * ★ 兼容壳（A1 旧引擎已退役）
     * 原 startBattle + simulateBattleLive（约 1600 行传统战斗循环）已删除，
     * 所有战斗统一走可视化引擎（battle/scene.js → openBattleSceneDebug）。
     * 保留本函数名只为兼容历史调用点（scene.js / stages.js 的兜底分支）。
     */

    function startBattle(stageId) {
      if (typeof openBattleSceneDebug === 'function') {
        openBattleSceneDebug(stageId);
        return true;
      }
      console.warn('[battle] 可视化引擎不可用，战斗未启动：', stageId);
      return false;
    }


    // 显示战斗结果

    function showBattleResult(stage, result, keepLogs = false) {
      // 更新战斗结果UI
      document.getElementById('battleResultTitle').textContent = result.isWin ? '战斗胜利!' : '战斗失败!';
      document.getElementById('battleResultTitle').className = result.isWin ? 'text-2xl font-bold text-green-400' : 'text-2xl font-bold text-red-400';
      document.getElementById('battleResultStage').textContent = stage.name;
      document.getElementById('battleResultRounds').textContent = result.rounds;
      document.getElementById('battleResultMaxDamage').textContent = result.maxDamage;
      document.getElementById('battleResultHealing').textContent = result.healing;
      
      // 渲染日志
      const logsContainer = document.getElementById('battleLogs');
      if (!keepLogs) logsContainer.innerHTML = result.logs.join('');
      // 自动滚动到底部
      setTimeout(() => {
        logsContainer.scrollTop = logsContainer.scrollHeight;
      }, 100);
      
      // 显示奖励
      document.getElementById('battleResultExp').textContent = result.rewards.exp;
      document.getElementById('battleResultGold').textContent = result.rewards.gold;
      
      // 显示获得的物品
      const itemsContainer = document.getElementById('battleResultItems');
      itemsContainer.innerHTML = '';
      const isTowerStage = stage && (stage.isTower || (typeof stage.id === 'string' && stage.id.startsWith('tower_')));
      
      if (result.isWin) {
        // 获得经验和金币
        gameData.player.exp += result.rewards.exp;
        gameData.player.gold += result.rewards.gold;
        if (window.__progression && typeof window.__progression.applyMaterialsDelta === 'function') {
          window.__progression.applyMaterialsDelta(result.rewards.materials || {}, gameData);
        }
        
        // 检查玩家升级
        checkPlayerLevelUp();
        
        // 角色获得经验
        gameData.characters.forEach(char => {
          char.exp += result.rewards.exp / Math.max(1, gameData.characters.length);
          checkCharacterLevelUp(char);
        });
        
        const renderMaterialRow = (name, iconUrl, count) => {
          const el = document.createElement('div');
          el.className = 'flex items-center mt-2';
          const img = iconUrl ? `<img src="${iconUrl}" alt="${name}" class="w-6 h-6 mr-2">` : `<i class="fa fa-cube mr-2 text-gray-400"></i>`;
          el.innerHTML = `${img}<span>${name}</span><span class="ml-2 text-primary text-xs">x${count}</span>`;
          el.querySelectorAll('img').forEach(im => { im.onerror = () => { im.replaceWith(Object.assign(document.createElement('i'), { className: 'fa fa-cube mr-2 text-gray-400' })); }; });
          return el;
        };

        // 添加获得的物品
        if (result.rewards.items.length > 0) {
          result.rewards.items.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'flex items-center mt-2';
            
            if (equipmentData.some(e => e.id === item.id)) {
              // 是装备
              gameData.equipment.push(item);
              itemElement.innerHTML = `
                <img src="${item.imageUrl}" alt="${item.name}" class="w-6 h-6 mr-2">
                <span>${item.name}</span>
                <span class="ml-2 text-rarity-${item.rarity.toLowerCase()} text-xs">${item.rarity}</span>
              `;
            } else if (inscriptionsData.some(i => i.id === item.id)) {
              // 是铭文
              gameData.inscriptions.push(item);
              itemElement.innerHTML = `
                <img src="${item.imageUrl}" alt="${item.name}" class="w-6 h-6 mr-2">
                <span>${item.name}</span>
                <span class="ml-2 text-rarity-${item.rarity.toLowerCase()} text-xs">${item.rarity}</span>
              `;
            }
            
            itemsContainer.appendChild(itemElement);
          });
        }

        const mats = result.rewards.materials || {};
        const matEntries = Object.entries(mats).filter(([, v]) => typeof v === 'number' && v > 0);
        if (matEntries.length > 0) {
          const list = (typeof materialsData !== 'undefined' && Array.isArray(materialsData)) ? materialsData : [];
          matEntries.forEach(([k, v]) => {
            const m = list.find(x => x && x.key === k);
            itemsContainer.appendChild(renderMaterialRow(m ? m.name : k, m ? m.iconUrl : '', v));
          });
        }

        if (result.rewards.items.length === 0 && matEntries.length === 0) {
          itemsContainer.innerHTML = '<div class="text-gray-400">未获得物品</div>';
        }
        
        if (isTowerStage) {
          if (!gameData.tower || typeof gameData.tower !== 'object') gameData.tower = { floor: 1, bestFloor: 0 };
          const floorNo = typeof stage.towerFloor === 'number'
            ? stage.towerFloor
            : (typeof stage.id === 'string' ? parseInt(stage.id.replace('tower_', ''), 10) : 1);
          const f = Number.isFinite(floorNo) ? floorNo : 1;
          gameData.tower.bestFloor = Math.max(gameData.tower.bestFloor || 0, f);
          gameData.tower.floor = Math.max(gameData.tower.floor || 1, f + 1);
          if (gameData.tower.floor > 200) gameData.tower.floor = 200;
          window.__battleModifiers = null;
        } else {
          const unlockedIndex = Math.max(0, stagesData.findIndex(s => s.id === gameData.currentStage));
          const clearedIndex = stagesData.findIndex(s => s.id === stage.id);
          if (clearedIndex >= 0) {
            const nextIndex = Math.max(unlockedIndex, Math.min(stagesData.length - 1, clearedIndex + 1));
            gameData.currentStage = stagesData[nextIndex].id;
          }
        }
      } else {
        itemsContainer.innerHTML = '<div class="text-gray-400">失败无奖励</div>';
        if (isTowerStage) window.__battleModifiers = null;
      }

      lastBattleRecord = {
        isWin: result.isWin,
        stageName: stage.name,
        rounds: result.rounds,
        maxDamage: result.maxDamage,
        healing: result.healing,
        rewardsExp: result.rewards.exp,
        rewardsGold: result.rewards.gold,
        logsHtml: document.getElementById('battleLogs').innerHTML,
        itemsHtml: itemsContainer.innerHTML
      };
      updateLastBattleReportButton();
      
      // 显示战斗结果弹窗
      document.getElementById('battleResultModal').classList.remove('hidden');
      
      // 更新UI
      updateUI();
      updateStagesList();
      
      // 保存游戏进度
      saveGameProgress();
    }

  // ── 对外暴露（内联 / 其它模块 / HTML onclick 都靠裸标识符或 window 取用）──
  window.setBattleSpeed = setBattleSpeed;
  window.closeBattleModal = closeBattleModal;
  window.updateLastBattleReportButton = updateLastBattleReportButton;
  window.openLastBattleReport = openLastBattleReport;
  window.skipBattle = skipBattle;
  window.toggleBattleFold = toggleBattleFold;
  window.battleDelayMs = battleDelayMs;
  window.appendBattleLog = appendBattleLog;
  window.renderBattleHud = renderBattleHud;
  window.startBattle = startBattle;
  window.showBattleResult = showBattleResult;

  const api = { setBattleSpeed, closeBattleModal, updateLastBattleReportButton, openLastBattleReport, skipBattle, toggleBattleFold, battleDelayMs, appendBattleLog, renderBattleHud, startBattle, showBattleResult };
  const segs = 'Game.battle.fallbackHud'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__fallbackHud = api;
})();
