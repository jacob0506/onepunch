(() => {
  function updateStagesList() {
    const stagesList = document.getElementById('stagesList');
    if (!stagesList) return;
    stagesList.innerHTML = '';

    const unlockedIndex = Math.max(0, stagesData.findIndex(s => s.id === gameData.currentStage));
    let lastChapter = null;

    stagesData.forEach((stage, idx) => {
      const isUnlocked = idx <= unlockedIndex;
      const isLatest = idx === unlockedIndex;
      const isCleared = idx < unlockedIndex;
      const chapterName = stage.chapter || null;

      if (chapterName && chapterName !== lastChapter) {
        lastChapter = chapterName;
        const header = document.createElement('div');
        header.className = 'sticky top-0 z-10 py-2';
        header.innerHTML = `
          <div class="glass-panel rounded-xl px-4 py-3 border border-gray-800">
            <div class="flex items-center justify-between">
              <div class="text-lg font-black text-shadow-hero">${chapterName}</div>
              <div class="text-[10px] text-gray-400">${idx + 1}-${Math.min(stagesData.length, idx + 10)}关</div>
            </div>
          </div>
        `;
        stagesList.appendChild(header);
      }

      const cardElement = document.createElement('div');
      const totalPower = calculateTotalPower();
      const isRecommended = totalPower >= stage.recommendedPower;

      cardElement.id = `stageCard_${stage.id}`;
      cardElement.className = `glass-panel rounded-xl p-4 md:p-6 border border-gray-800 ${isUnlocked ? 'card-hover' : 'opacity-60'}`;
      cardElement.innerHTML = `
        <div class="flex justify-between items-center mb-3">
          <div>
            <h3 class="text-lg md:text-xl font-black">${stage.name}</h3>
            <div class="flex items-center mt-1">
              <span class="px-2 py-1 rounded text-xs ${getDifficultyClass(stage.difficulty)}">${getDifficultyName(stage.difficulty)}</span>
              <span class="ml-2 text-[10px] md:text-sm text-gray-400">推荐: ${stage.recommendedPower.toLocaleString()}</span>
            </div>
          </div>
          <div class="text-right">
            <div class="text-[10px] md:text-sm text-gray-400">${isCleared ? '已通关' : (isLatest ? '当前进度' : (isUnlocked ? '已解锁' : '未解锁'))}</div>
            <div class="text-lg md:text-xl font-black ${isRecommended ? 'text-green-400' : 'text-yellow-400'}">${totalPower.toLocaleString()}</div>
          </div>
        </div>
        
        <div class="mb-3">
          <div class="text-xs font-bold text-gray-400 mb-2">敌方阵容</div>
          <div class="flex flex-wrap gap-2">
            ${(stage.enemies || []).map(enemy => `
              <div class="px-3 py-1 bg-gray-800 rounded-full text-xs">
                ${enemy.name}
              </div>
            `).join('')}
          </div>
        </div>
        
        <div class="mb-3">
          <div class="text-xs font-bold text-gray-400 mb-2">奖励</div>
          <div class="flex flex-wrap gap-2">
            <div class="px-3 py-1 bg-gray-800 rounded-full text-xs flex items-center">
              <i class="fa fa-star text-yellow-400 mr-1"></i>
              经验: ${stage.rewards.exp}
            </div>
            <div class="px-3 py-1 bg-gray-800 rounded-full text-xs flex items-center">
              <i class="fa fa-coins text-yellow-500 mr-1"></i>
              金币: ${stage.rewards.gold}
            </div>
            ${((stage.rewards && stage.rewards.items) || []).map(item => {
              const itemData = equipmentData.find(i => i.id === item.id) || inscriptionsData.find(i => i.id === item.id);
              return `
                <div class="px-3 py-1 bg-gray-800 rounded-full text-xs">
                  ${itemData ? itemData.name : item.id} (${Math.floor(item.dropRate * 100)}%)
                </div>
              `;
            }).join('')}
          </div>
        </div>
        
        <div class="text-center">
          <div class="flex justify-center gap-2">
            <button class="btn-primary ${!isUnlocked ? 'opacity-50 cursor-not-allowed' : ''}" ${!isUnlocked ? 'disabled' : ''} data-stage="${stage.id}">
              ${isUnlocked ? (isCleared ? '再次挑战' : '挑战') : '通关上一关解锁'}
            </button>
            <button class="px-4 py-2 rounded-lg text-xs font-black bg-gray-900 border border-gray-700 hover:bg-gray-800 ${!isUnlocked ? 'opacity-50 cursor-not-allowed' : ''}" ${!isUnlocked ? 'disabled' : ''} data-stage-debug="${stage.id}">
              场景调试
            </button>
          </div>
        </div>
      `;

      const challengeBtn = cardElement.querySelector('[data-stage]');
      challengeBtn.addEventListener('click', () => {
        if (!isUnlocked) return;
        if (BATTLE_SCENE_CONFIG && BATTLE_SCENE_CONFIG.replaceFormal) {
          openBattleSceneDebug(stage.id);
        } else {
          startBattle(stage.id);
        }
      });

      const debugBtn = cardElement.querySelector('[data-stage-debug]');
      debugBtn.addEventListener('click', () => {
        if (isUnlocked) openBattleSceneDebug(stage.id);
      });

      stagesList.appendChild(cardElement);
    });
  }

  function goToStage(stageId) {
    if (typeof switchPage === 'function') switchPage('stages');
    setTimeout(() => {
      const el = document.getElementById(`stageCard_${stageId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  const api = { updateStagesList, goToStage };
  if (window.Game && window.Game.ui) window.Game.ui.stages = api;
  window.__stagesUI = api;
})();

