(() => {
  let mode = 'main';
  let towerInitialized = false;

  /**
   * 是否处于开发者模式（见 assets/js/app/dev.js）。
   * 「场景调试」按钮只在开发者模式下渲染，正式玩家看不到内部调试入口。
   */
  function isDevMode() {
    return !!(window.Game && window.Game.dev &&
      typeof window.Game.dev.isOn === 'function' && window.Game.dev.isOn());
  }

  /**
   * ★ 统一战斗入口（A1）：主线与无尽塔都走同一个引擎。
   * 入口实现在 assets/js/app/battle/scene.js → window.Game.battle.enterBattle。
   * 这里保留两级兜底，避免模块加载顺序变化时"点不动"。
   */
  function enterBattleUnified(stageId) {
    const entry = window.__battleEntry;
    if (entry && typeof entry.enterBattle === 'function') return entry.enterBattle(stageId);
    if (typeof openBattleSceneDebug === 'function') return openBattleSceneDebug(stageId);
    if (typeof startBattle === 'function') return startBattle(stageId);
    return false;
  }

  function ensureTowerData() {
    if (!gameData) return;
    // C10：赛季化迁移（seasonNo / history / startedAt）由 domain/tower.js 单源负责
    if (window.Game && window.Game.domain && window.Game.domain.tower) {
      window.Game.domain.tower.ensure();
      return;
    }
    if (!gameData.tower || typeof gameData.tower !== 'object') gameData.tower = {};
    if (typeof gameData.tower.floor !== 'number') gameData.tower.floor = 1;
    if (typeof gameData.tower.bestFloor !== 'number') gameData.tower.bestFloor = 0;
  }

  function mulberry32(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6D2B79F5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(arr, rand) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr[Math.floor(rand() * arr.length)];
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function getEnemyPool() {
    const poolMap = new Map();
    (stagesData || []).forEach(s => {
      if (!s || typeof s.id !== 'string') return;
      if (!s.id.startsWith('stage_')) return;
      (s.enemies || []).forEach(e => {
        if (!e || !e.id) return;
        if (!poolMap.has(e.id)) poolMap.set(e.id, e);
      });
    });
    const list = [...poolMap.values()];
    if (list.length > 0) return list;
    return [
      { id: 'enemy_fallback_1', name: '史莱姆', health: 500, attack: 50, defense: 20, speed: 95 },
      { id: 'enemy_fallback_2', name: '哥布林', health: 650, attack: 65, defense: 18, speed: 105 },
      { id: 'enemy_fallback_3', name: '森林狼', health: 800, attack: 80, defense: 25, speed: 120 }
    ];
  }

  function rarityByFloor(floor, rand) {
    const r = rand();
    if (floor >= 80) {
      if (r < 0.06) return 'SUR';
      if (r < 0.18) return 'UR';
      if (r < 0.55) return 'SSR';
      return 'SR';
    }
    if (floor >= 40) {
      if (r < 0.02) return 'SUR';
      if (r < 0.10) return 'UR';
      if (r < 0.40) return 'SSR';
      return 'SR';
    }
    if (floor >= 15) {
      if (r < 0.05) return 'UR';
      if (r < 0.25) return 'SSR';
      return 'SR';
    }
    return r < 0.20 ? 'SR' : 'R';
  }

  function pickRewardItemId(floor, rand) {
    const fromEquip = rand() < 0.7;
    const list = fromEquip ? (equipmentData || []) : (inscriptionsData || []);
    const rarity = rarityByFloor(floor, rand);
    const candidates = list.filter(it => it && it.rarity === rarity);
    const picked = pick(candidates.length > 0 ? candidates : list, rand);
    return picked ? picked.id : null;
  }

  function buildTowerStage(floor) {
    const isBoss = floor % 10 === 0;
    const rand = mulberry32(7777 + floor * 9973);
    const pool = getEnemyPool();

    const basePow = 900;
    const pow = Math.floor(basePow * Math.pow(1.14, Math.max(0, floor - 1)));

    const mult = Math.pow(1.12, Math.max(0, floor - 1));
    const healthMult = Math.pow(mult, 1.12);
    const atkMult = Math.pow(mult, 1.02);
    const defMult = Math.pow(mult, 0.95);
    const spdAdd = Math.floor(clamp(floor * 0.6, 0, 60));

    const pickEnemy = () => {
      const base = pick(pool, rand) || pool[0];
      return {
        id: base.id,
        name: base.name,
        health: Math.floor((base.health || 600) * healthMult),
        attack: Math.floor((base.attack || 60) * atkMult),
        defense: Math.floor((base.defense || 20) * defMult),
        speed: Math.floor((base.speed || 100) + spdAdd)
      };
    };

    const enemies = isBoss
      ? [
        { ...pickEnemy(), name: `塔主·${pickEnemy().name}`, health: Math.floor(pickEnemy().health * 1.55), attack: Math.floor(pickEnemy().attack * 1.25), defense: Math.floor(pickEnemy().defense * 1.15), speed: Math.floor(pickEnemy().speed - 10) },
        pickEnemy(),
        pickEnemy()
      ]
      : (floor % 3 === 0 ? [pickEnemy(), pickEnemy(), pickEnemy()] : [pickEnemy(), pickEnemy()]);

    const baseExp = 90;
    const baseGold = 240;
    const exp = Math.floor(baseExp * Math.pow(1.10, Math.max(0, floor - 1)));
    const gold = Math.floor(baseGold * Math.pow(1.12, Math.max(0, floor - 1)));
    const enhanceStoneQty = (1 + Math.floor(floor / 3)) * (isBoss ? 2 : 1);
    const dustQty = (1 + Math.floor(floor / 5)) * (isBoss ? 2 : 1);
    const bonusDrop = isBoss ? 0.55 : 0.22;
    const rewardId = pickRewardItemId(floor, rand);

    const items = [
      { id: 'item_001', quantity: enhanceStoneQty, dropRate: 1 },
      { id: 'item_002', quantity: dustQty, dropRate: 1 }
    ];
    if (rewardId) items.push({ id: rewardId, quantity: 1, dropRate: bonusDrop });

    const id = `tower_${String(floor).padStart(4, '0')}`;
    return {
      id,
      name: `无尽之塔 · 第 ${floor} 层`,
      chapter: '无尽之塔',
      difficulty: isBoss ? 'boss' : (floor % 5 === 0 ? 'elite' : 'normal'),
      recommendedPower: pow,
      enemies,
      rewards: { exp, gold, items },
      isTower: true,
      towerFloor: floor
    };
  }

  function ensureTowerStages() {
    if (towerInitialized) return;
    if (!Array.isArray(stagesData)) return;
    const hasAny = stagesData.some(s => s && typeof s.id === 'string' && s.id.startsWith('tower_'));
    if (hasAny) {
      towerInitialized = true;
      return;
    }
    const maxFloors = 200;
    for (let f = 1; f <= maxFloors; f++) {
      stagesData.push(buildTowerStage(f));
    }
    towerInitialized = true;
  }

  function getMaterialNameById(id) {
    const m = (typeof materialsData !== 'undefined' && Array.isArray(materialsData)) ? materialsData.find(x => x && x.id === id) : null;
    return m ? m.name : id;
  }

  /** B6：塔祝福三选一 —— 弹窗与卡片全走组件库（openModal + .ui-opt） */
  function openBlessingModal(stage) {
    const comp = window.__uiComponents;
    if (!comp || typeof comp.openModal !== 'function') return;

    const blessings = [
      { id: 'atk10', name: '锋刃祝福', desc: '攻击 +10%', mods: { atkMul: 1.10 } },
      { id: 'hp15', name: '磐石祝福', desc: '生命 +15%', mods: { hpMul: 1.15 } },
      { id: 'spd20', name: '疾风祝福', desc: '速度 +20', mods: { speedAdd: 20 } },
      { id: 'crit8', name: '猎杀祝福', desc: '暴击率 +8%', mods: { critRateAdd: 8 } },
      { id: 'cdmg20', name: '破军祝福', desc: '暴击伤害 +20%', mods: { critDmgAdd: 20 } },
      { id: 'dr10', name: '壁垒祝福', desc: '免伤 +10%', mods: { dmgReducAdd: 10 } },
      { id: 'ls5', name: '血契祝福', desc: '吸血 +5%', mods: { lifestealAdd: 5 } },
      { id: 'hit10', name: '洞察祝福', desc: '效果命中 +10%', mods: { effectHitAdd: 10 } },
      { id: 'ten10', name: '坚韧祝福', desc: '效果抵抗 +10%', mods: { tenacityAdd: 10 } }
    ];
    const rand = mulberry32((Date.now() >>> 0) ^ ((stage && stage.towerFloor) || 1));
    const pool = [...blessings];
    const pick3 = [];
    for (let i = 0; i < 3; i++) {
      const idx = Math.floor(rand() * pool.length);
      pick3.push(pool[idx]);
      pool.splice(idx, 1);
    }

    const body =
      '<div class="text-xs text-gray-400 mb-3">本次祝福仅在当前战斗生效。</div>' +
      '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">' +
      pick3.map((b, i) =>
        '<button type="button" class="ui-opt" data-bless="' + i + '">' +
        '<span class="ui-opt__name">' + b.name + '</span>' +
        '<span class="ui-opt__desc">' + b.desc + '</span>' +
        '<span class="ui-opt__hint">点击开始挑战</span>' +
        '</button>').join('') +
      '</div>';

    comp.openModal({
      title: '无尽之塔 · 选择祝福',
      body,
      actions: [{ label: '暂不挑战', tone: 'ghost' }],
      onMount: (wrap, close) => {
        wrap.querySelectorAll('[data-bless]').forEach(el => {
          el.addEventListener('click', () => {
            const b = pick3[Number(el.getAttribute('data-bless'))];
            if (!b) return;
            window.__battleModifiers = { ...(b.mods || {}), source: 'tower', blessingId: b.id };
            if (stage) {
              stage.modifiers = { affixes: [{ name: `祝福：${b.name}` }] };
              stage.towerBlessing = b.id;
            }
            close();
            enterBattleUnified(stage.id);
          });
        });
      }
    });
  }

  function renderModeBar(container) {
    const bar = document.createElement('div');
    bar.className = 'sticky top-0 z-20 py-2';
    ensureTowerData();
    const mainActive = mode === 'main';
    const towerActive = mode === 'tower';
    const dailyActive = mode === 'daily';
    const expActive = mode === 'expedition';
    const chActive = mode === 'challenge';
    const sqActive = mode === 'squads';
    const arActive = mode === 'arena';
    const expSum = (window.__expedition && typeof window.__expedition.summary === 'function')
      ? window.__expedition.summary() : null;
    const chSum = (window.__challenge && typeof window.__challenge.summary === 'function')
      ? window.__challenge.summary() : null;
    const sqSum = (window.__squads && typeof window.__squads.summary === 'function')
      ? window.__squads.summary() : null;
    const towerFloor = gameData.tower.floor || 1;
    const towerBest = gameData.tower.bestFloor || 0;
    const towerSeason = gameData.tower.seasonNo || 1;
    const dailySum = (window.__daily && typeof window.__daily.summary === 'function')
      ? window.__daily.summary() : null;
    // 大数字简写（12.3万 / 4.5M）—— 周期挑战的伤害数字会很大
    const fmtNum = (n) => {
      const v = Number(n) || 0;
      if (v >= 100000000) return (v / 100000000).toFixed(2) + '亿';
      if (v >= 10000) return (v / 10000).toFixed(v >= 1000000 ? 0 : 1) + '万';
      return String(Math.floor(v));
    };
    const rightInfo = chActive
      ? `<div class="text-[10px] text-gray-400 whitespace-nowrap">剩余 <span class="text-primary font-black">${chSum ? chSum.triesLeft : 0}</span> 次 · 本周最佳 <span class="text-gray-200 font-black">${chSum ? fmtNum(chSum.best) : 0}</span></div>`
      : (sqActive
        ? `<div class="text-[10px] text-gray-400 whitespace-nowrap">第 <span class="text-primary font-black">${sqSum ? sqSum.layer : 0}</span>/${sqSum ? sqSum.layers : 12} 层 · 最远 <span class="text-gray-200 font-black">${sqSum ? sqSum.bestLayer : 0}</span></div>`
        : (expActive
      ? `<div class="text-[10px] text-gray-400 whitespace-nowrap">远征币 <span class="text-primary font-black">${expSum ? expSum.coins : 0}</span>${expSum && expSum.run ? ` · 第 <span class="text-primary font-black">${expSum.run.layer + 1}</span>/${expSum.run.layers} 层` : ''}</div>`
      : (dailyActive
        ? `<div class="text-[10px] text-gray-400 whitespace-nowrap">今日剩余 <span class="text-primary font-black">${dailySum ? dailySum.left : 0}</span>/${dailySum ? dailySum.max : 0}</div>`
      : (towerActive
        ? `<div class="text-[10px] text-gray-400 whitespace-nowrap">第<span class="text-primary font-black">${towerSeason}</span>季 · 当前层：<span class="text-primary font-black">${towerFloor}</span> · 最远：<span class="text-gray-200 font-black">${towerBest}</span></div>`
        : `<div class="text-[10px] text-gray-400 whitespace-nowrap">第 <span class="text-gray-200 font-black">${String(gameData.currentStage || '-').replace(/^stage_0*/, '')}</span> 关</div>`))));
    const modeBtn = (key, label, active) =>
      `<button type="button" class="ui-btn ui-btn--sm ${active ? 'ui-btn--primary' : 'ui-btn--ghost'}" data-mode="${key}">${label}</button>`;
    bar.innerHTML = `
      <div class="glass-panel rounded-xl px-4 py-3 border border-gray-800">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            ${modeBtn('main', '主线', mainActive)}
            ${modeBtn('tower', '无尽塔', towerActive)}
            ${modeBtn('daily', '日常', dailyActive)}
            ${modeBtn('expedition', '远征', expActive)}
            ${modeBtn('challenge', '挑战', chActive)}
            ${modeBtn('squads', '远征队', sqActive)}
            ${modeBtn('arena', '竞技场', arActive)}
          </div>
          <div class="text-right truncate min-w-0">${rightInfo}</div>
        </div>
      </div>
    `;
    bar.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = btn.getAttribute('data-mode');
        if (m === mode) return;
        mode = m;
        updateStagesList();
      });
    });
    container.appendChild(bar);
  }

  function renderMainStages(stagesList) {
    const unlockedIndex = Math.max(0, stagesData.findIndex(s => s && typeof s.id === 'string' && s.id === gameData.currentStage));
    let lastChapter = null;

    stagesData.filter(s => s && typeof s.id === 'string' && s.id.startsWith('stage_')).forEach((stage, idx) => {
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
      cardElement.className = `glass-panel rounded-xl p-4 md:p-6 border border-gray-800 ${isUnlocked ? 'ui-hover' : 'opacity-60'}`;
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
              <i class="fa fa-money text-yellow-500 mr-1"></i>
              金币: ${stage.rewards.gold}
            </div>
            ${((stage.rewards && stage.rewards.items) || []).map(item => {
              const itemData = equipmentData.find(i => i && i.id === item.id) || inscriptionsData.find(i => i && i.id === item.id);
              const name = itemData ? itemData.name : getMaterialNameById(item.id);
              return `
                <div class="px-3 py-1 bg-gray-800 rounded-full text-xs">
                  ${name} (${Math.floor(item.dropRate * 100)}%)
                </div>
              `;
            }).join('')}
          </div>
        </div>
        
        <div class="text-center">
          <div class="flex justify-center gap-2">
            <button class="ui-btn ui-btn--primary ${!isUnlocked ? 'opacity-50 cursor-not-allowed' : ''}" ${!isUnlocked ? 'disabled' : ''} data-stage="${stage.id}">
              ${isUnlocked ? (isCleared ? '再次挑战' : '挑战') : '通关上一关解锁'}
            </button>
            ${isCleared ? `<button class="ui-btn ui-btn--gold" data-sweep="${stage.id}"><i class="fa fa-forward mr-1"></i>扫荡</button>` : ''}
            ${isDevMode() ? `
            <button class="ui-btn ui-btn--ghost ui-btn--sm" ${!isUnlocked ? 'disabled' : ''} data-stage-debug="${stage.id}">
              场景调试
            </button>` : ''}
          </div>
        </div>
      `;

      const challengeBtn = cardElement.querySelector('[data-stage]');
      challengeBtn.addEventListener('click', () => {
        if (!isUnlocked) return;
        enterBattleUnified(stage.id);
      });

      // 扫荡（C2）：已通关关卡一键结算，走 ui/idle.js 的组件弹窗
      const sweepBtn = cardElement.querySelector('[data-sweep]');
      if (sweepBtn) {
        sweepBtn.addEventListener('click', () => {
          if (typeof openSweepModal === 'function') openSweepModal(stage, 5);
        });
      }

      const debugBtn = cardElement.querySelector('[data-stage-debug]');
      if (debugBtn) {
        debugBtn.addEventListener('click', () => {
          if (isUnlocked) openBattleSceneDebug(stage.id);
        });
      }

      stagesList.appendChild(cardElement);
    });
  }

  /** C10：赛季档案弹窗（当前赛季进度 + 重置 + 历史排位） */
  function openSeasonModal() {
    const comp = window.__uiComponents;
    if (!comp || typeof comp.openModal !== 'function') return;
    const towerApi = window.Game && window.Game.domain && window.Game.domain.tower;
    if (!towerApi) return;
    const s = towerApi.summary();
    if (!s) return;

    const fmtDate = (ts) => {
      const d = new Date(ts || Date.now());
      return `${d.getMonth() + 1}/${d.getDate()}`;
    };
    const rows = s.history.length
      ? s.history.map(h => `
          <div class="flex items-center justify-between px-3 py-2 rounded-lg bg-black/25 border border-gray-800">
            <div>
              <span class="text-xs font-black text-white">第 ${h.seasonNo} 赛季</span>
              <span class="ml-2 text-[10px] text-gray-500">${fmtDate(h.startedAt)} - ${fmtDate(h.endedAt)}</span>
            </div>
            <div class="text-right">
              <span class="text-sm font-black text-primary">最远 ${h.bestFloor} 层</span>
              <div class="text-[10px] text-gray-500">结算 钻石 +${h.rewardGems || 0}</div>
            </div>
          </div>`).join('')
      : '<div class="text-xs text-gray-500 px-1 py-3 text-center">暂无历史赛季 —— 第一次重置后会在这里留下记录</div>';

    const body = `
      <div class="space-y-3">
        <div class="px-3 py-3 rounded-lg bg-black/25 border border-gray-800">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-[10px] text-gray-400">当前赛季</div>
              <div class="text-lg font-black text-white">第 <span class="text-primary">${s.seasonNo}</span> 赛季</div>
            </div>
            <div class="text-right">
              <div class="text-[10px] text-gray-400">本季最远 / 当前层</div>
              <div class="text-lg font-black text-yellow-400">${s.bestFloor} <span class="text-gray-500 text-xs">/ ${s.floor}</span></div>
            </div>
          </div>
        </div>
        <div class="px-3 py-3 rounded-lg bg-black/25 border border-gray-800">
          <div class="text-xs text-gray-300 leading-5">
            重置后：本季最远层数 <b class="text-white">${s.bestFloor}</b> 归档进历史排位，进度回到第 1 层开新赛季，并结算
            <b class="text-primary">钻石 +${s.reward.gems}</b>。
            <span class="text-gray-500">（需本季最远 ≥ ${s.resetMin} 层；历史最高 ${towerApi.historyBest()} 层不受重置影响）</span>
          </div>
        </div>
        <div class="space-y-2">
          <div class="text-xs font-bold text-gray-400">历史排位</div>
          ${rows}
        </div>
      </div>
    `;

    const actions = [{ label: '关闭', tone: 'ghost' }];
    if (s.canReset) {
      actions.push({
        label: `重置开新赛季（领钻石 +${s.reward.gems}）`,
        tone: 'gold',
        onClick: (close) => {
          close();
          comp.confirmModal({
            title: '重置赛季',
            body: `本季最远 ${s.bestFloor} 层将归档，进度清零回第 1 层，结算钻石 +${s.reward.gems}。确定重置？`,
            okText: '重置',
            okTone: 'gold',
            onOk: () => {
              const r = towerApi.resetSeason();
              if (r.ok) {
                comp.toast(`第 ${r.archived.seasonNo} 赛季结算：${(r.granted || []).join(' · ') || '已入账'}`, 'success');
                if (typeof updateUI === 'function') updateUI();
              } else {
                comp.toast(r.reason === 'min_floor' ? `本季最远未达 ${s.resetMin} 层` : '重置失败', 'danger');
              }
            }
          });
        }
      });
    } else {
      actions.push({ label: `最远 ${s.resetMin} 层可重置`, tone: 'ghost' });
    }
    comp.openModal({ title: '无尽之塔 · 赛季档案', body, actions });
  }

  function renderTower(stagesList) {
    ensureTowerData();
    ensureTowerStages();
    const floor = Math.max(1, gameData.tower.floor || 1);
    const best = Math.max(0, gameData.tower.bestFloor || 0);
    const maxFloor = 200;

    const top = document.createElement('div');
    top.className = 'glass-panel rounded-xl p-4 border border-gray-800 mb-3';
    const seasonNo = (gameData.tower.seasonNo) || 1;
    top.innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="text-xs text-gray-400">第 <span class="text-primary font-black">${seasonNo}</span> 赛季 · 进度</div>
          <div class="text-lg font-black text-white">第 <span class="text-primary">${floor}</span> 层</div>
          <div class="text-[10px] text-gray-500 mt-1">本季最远：${best}</div>
        </div>
        <div class="text-right">
          <div class="text-xs text-gray-400">建议战斗力</div>
          <div class="text-lg font-black text-yellow-400">${buildTowerStage(floor).recommendedPower.toLocaleString()}</div>
        </div>
      </div>
      <div class="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
        <button class="ui-btn ui-btn--primary" data-tower-challenge="1">挑战下一层</button>
        <button class="ui-btn ui-btn--ghost ui-btn--sm" data-tower-prev="1">查看上一页</button>
        <button class="ui-btn ui-btn--ghost ui-btn--sm" data-tower-next="1">查看下一页</button>
        <button class="ui-btn ui-btn--ghost ui-btn--sm" data-tower-season="1"><i class="fa fa-trophy mr-1 text-yellow-400"></i>赛季档案</button>
      </div>
    `;
    stagesList.appendChild(top);

    const listWrap = document.createElement('div');
    listWrap.className = 'space-y-3';
    stagesList.appendChild(listWrap);

    let pageBase = Math.max(1, floor - 3);
    const pageSize = 12;
    if (typeof gameData.tower.pageBase === 'number') pageBase = Math.max(1, gameData.tower.pageBase);
    pageBase = Math.min(pageBase, Math.max(1, maxFloor - pageSize + 1));
    gameData.tower.pageBase = pageBase;

    const floors = [];
    for (let f = pageBase; f < pageBase + pageSize && f <= maxFloor; f++) floors.push(f);

    floors.forEach(f => {
      const stageId = `tower_${String(f).padStart(4, '0')}`;
      const stage = stagesData.find(s => s && s.id === stageId) || buildTowerStage(f);
      const totalPower = calculateTotalPower();
      const isRecommended = totalPower >= stage.recommendedPower;
      const isUnlocked = f <= floor;
      const isCleared = f < floor;
      const status = isCleared ? '已通关' : (f === floor ? '当前挑战' : (isUnlocked ? '已解锁' : '未解锁'));

      const card = document.createElement('div');
      card.className = `glass-panel rounded-xl p-4 border border-gray-800 ${isUnlocked ? 'ui-hover' : 'opacity-60'}`;
      card.innerHTML = `
        <div class="flex justify-between items-center mb-3">
          <div>
            <h3 class="text-lg font-black">第 ${f} 层 ${f % 10 === 0 ? '<span class="ml-2 text-[10px] px-2 py-1 rounded-full bg-purple-900/60 border border-purple-700 text-purple-200 font-black">BOSS</span>' : ''}</h3>
            <div class="flex items-center mt-1">
              <span class="px-2 py-1 rounded text-xs ${getDifficultyClass(stage.difficulty)}">${getDifficultyName(stage.difficulty)}</span>
              <span class="ml-2 text-[10px] text-gray-400">推荐: ${stage.recommendedPower.toLocaleString()}</span>
            </div>
          </div>
          <div class="text-right">
            <div class="text-[10px] text-gray-400">${status}</div>
            <div class="text-lg font-black ${isRecommended ? 'text-green-400' : 'text-yellow-400'}">${totalPower.toLocaleString()}</div>
          </div>
        </div>
        <div class="mb-3">
          <div class="text-xs font-bold text-gray-400 mb-2">敌方</div>
          <div class="flex flex-wrap gap-2">
            ${(stage.enemies || []).map(enemy => `<div class="px-3 py-1 bg-gray-800 rounded-full text-xs">${enemy.name}</div>`).join('')}
          </div>
        </div>
        <div class="mb-3">
          <div class="text-xs font-bold text-gray-400 mb-2">奖励预览</div>
          <div class="flex flex-wrap gap-2">
            <div class="px-3 py-1 bg-gray-800 rounded-full text-xs flex items-center"><i class="fa fa-star text-yellow-400 mr-1"></i>经验: ${stage.rewards.exp}</div>
            <div class="px-3 py-1 bg-gray-800 rounded-full text-xs flex items-center"><i class="fa fa-money text-yellow-500 mr-1"></i>金币: ${stage.rewards.gold}</div>
            ${(stage.rewards.items || []).slice(0, 4).map(it => {
              const itemData = equipmentData.find(i => i && i.id === it.id) || inscriptionsData.find(i => i && i.id === it.id);
              const name = itemData ? itemData.name : getMaterialNameById(it.id);
              const qty = typeof it.quantity === 'number' ? ` x${it.quantity}` : '';
              return `<div class="px-3 py-1 bg-gray-800 rounded-full text-xs">${name}${qty}</div>`;
            }).join('')}
          </div>
        </div>
        <div class="text-center">
          <button class="ui-btn ui-btn--primary ${!isUnlocked ? 'opacity-50 cursor-not-allowed' : ''}" ${!isUnlocked ? 'disabled' : ''} data-tower-floor="${f}">
            ${!isUnlocked ? '通关前置层解锁' : (isCleared ? '再次挑战' : '挑战')}
          </button>
        </div>
      `;
      const btn = card.querySelector('[data-tower-floor]');
      btn.addEventListener('click', () => {
        if (!isUnlocked) return;
        openBlessingModal(stage);
      });
      listWrap.appendChild(card);
    });

    top.querySelector('[data-tower-challenge]').addEventListener('click', () => {
      const stageId = `tower_${String(floor).padStart(4, '0')}`;
      const stage = stagesData.find(s => s && s.id === stageId) || buildTowerStage(floor);
      openBlessingModal(stage);
    });
    top.querySelector('[data-tower-prev]').addEventListener('click', () => {
      gameData.tower.pageBase = Math.max(1, (gameData.tower.pageBase || 1) - pageSize);
      updateStagesList();
    });
    top.querySelector('[data-tower-next]').addEventListener('click', () => {
      gameData.tower.pageBase = Math.min(maxFloor - pageSize + 1, (gameData.tower.pageBase || 1) + pageSize);
      updateStagesList();
    });
    top.querySelector('[data-tower-season]').addEventListener('click', () => {
      openSeasonModal();
    });
  }

  function updateStagesList() {
    const stagesList = document.getElementById('stagesList');
    if (!stagesList) return;
    stagesList.innerHTML = '';
    renderModeBar(stagesList);
    if (mode === 'tower') renderTower(stagesList);
    else if (mode === 'daily') {
      // C7：界面在 ui/daily.js（数值在 domain/daily.js）
      if (typeof window.renderDailyPanel === 'function') window.renderDailyPanel(stagesList);
    }
    else if (mode === 'expedition') {
      // E1：肉鸽远征（数值在 domain/expedition.js，界面在 ui/expedition.js）
      if (typeof window.renderExpeditionPanel === 'function') window.renderExpeditionPanel(stagesList);
    }
    else if (mode === 'challenge') {
      // E3：周期挑战（数值在 domain/challenge.js，界面在 ui/challenge.js）
      if (typeof window.renderChallengePanel === 'function') window.renderChallengePanel(stagesList);
    }
    else if (mode === 'squads') {
      // E4：多队远征（数值在 domain/squads.js，界面在 ui/squads.js）
      if (typeof window.renderSquadsPanel === 'function') window.renderSquadsPanel(stagesList);
    }
    else if (mode === 'arena') {
      // E8：镜像竞技场（数值在 domain/arena.js，界面在 ui/arena.js）
      if (typeof window.renderArenaPanel === 'function') window.renderArenaPanel(stagesList);
    }
    else renderMainStages(stagesList);
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

  // 开发者模式切换后需要重渲染，才能增删「场景调试」按钮
  window.addEventListener('game:devmodechange', () => {
    const el = document.getElementById('stagesList');
    if (el && el.children.length > 0) updateStagesList();
  });
})();
