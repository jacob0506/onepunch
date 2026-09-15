/**
 * bootstrap.js —— 存档引导（加载 / 迁移 / 新建 / 保存 / 启动）
 *
 * 由 index.html 内联主脚本**整段原样搬入**（P5，2026-09-12）。刻意不做任何重排 /
 * 重命名 / 重缩进 —— 保证"搬代码不改变行为"，证据是 `npm run check:numbers` 的
 * 6 场战斗快照逐位一致。因此本文件保留内联的 4 空格缩进，**不要全局格式化**。
 *
 * 承载：initGame · syncCharacterData · loadGameData · loadGameDataFallback · loadGameProgress · ensureFormation · fixMissingInstanceIds · initializeNewGame · saveGameProgress
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


    // 初始化游戏
    async function initGame() {
      try {
        if (window.__loader && typeof window.__loader.loadAll === 'function') {
          const loaded = await window.__loader.loadAll();
          charactersData = loaded.charactersData;
          equipmentData = loaded.equipmentData;
          inscriptionsData = loaded.inscriptionsData;
          stagesData = loaded.stagesData;
          materialsData = loaded.materialsData || [];
          bondsData = loaded.bondsData || null;
          dailiesData = loaded.dailiesData || null;
          achievementsData = loaded.achievementsData || null;
          countersData = loaded.countersData || null;
          tutorialData = loaded.tutorialData || null;
          expeditionData = loaded.expeditionData || null;
          challengeData = loaded.challengeData || null;
          squadsData = loaded.squadsData || null;
          dispatchData = loaded.dispatchData || null;
          arenaData = loaded.arenaData || null;
          seasonData = loaded.seasonData || null;
          // E5：好感数值 + 角色档案剧情（拿不到则 domain/favor.js 用内置兜底曲线 + 空白档案）
          favorData = loaded.favorData || null;
          storiesData = loaded.storiesData || null;
          // A4：json 配置覆盖内置兜底（GAME_CONFIG / BATTLE_SCENE_CONFIG / AWAKEN_PROFILES）
          // —— 必须在任何读配置的逻辑之前；powered by core/config.js（幂等，缺字段保留兜底）
          if (window.__config && typeof window.__config.apply === 'function') window.__config.apply(loaded);
          normalizeCharacterSkills(charactersData);
          if (!Array.isArray(stagesData)) stagesData = [];
          if (stagesData.length < 50) {
            stagesData = expandStagesTo50(stagesData);
            console.log(`关卡数据不足，已自动扩展到 ${stagesData.length} 关`);
          }
        } else {
          await loadGameData();
        }
      } catch (error) {
        loadGameDataFallback();
      }
      loadGameProgress();
      // 更新已有角色的基础数据以匹配新版本
      syncCharacterData();
      updateUI();
      bindEvents();
      checkOfflineRewards();
      // 放置闭环（C1/C3）：挂机面板 + 定时刷新 + 红点
      if (typeof initIdle === 'function') initIdle();
      // E7：派驻探险面板（主页挂机面板下方；数值单源 domain/dispatch.js）
      if (typeof initDispatch === 'function') initDispatch();
      // E6：赛季活动循环（数值单源 domain/season.js）—— 必须晚于 initDispatch/目标统计，
      //      因为赛季经验读的是 stats 增量（sync 会在此刻建立本季基线）。
      if (typeof initSeason === 'function') initSeason();
      // 一键操作集（C4）：穿戴 / 上阵 / 全员配装 / 升级
      if (typeof initQuickOps === 'function') initQuickOps();
      // 今日目标（C5）：跨日重置 + 面板渲染（必须在 renderIdlePanel 之后，红点才拿得到最新挂机态）
      if (typeof ensureDailyGoals === 'function') ensureDailyGoals();
      if (typeof initDailyGoals === 'function') initDailyGoals();
      // 日常副本（C7）：次数状态 + 副本 stage 注入 stagesData（战斗入口按 id 查找）
      if (window.__daily) {
        window.__daily.ensureDailyState();
        window.__daily.ensureDailyStages();
      }
      // 红点框架（C5）：统一广播，5s 轮询
      if (typeof initRedDot === 'function') initRedDot();
      // 图鉴与成就（C8）：同步收录记录（只增不减）+ 渲染 + 注册「有成就可领」红点。
      // ⚠️ 必须在 initRedDot 之后：initCodex 里注册的 achievements 规则要靠它开轮询。
      if (typeof initCodex === 'function') initCodex();
      // E5：角色档案 / 好感（数值单源 domain/favor.js）。必须在 initCodex 之后：
      //      档案面板挂的是图鉴页第三个 tab，且要复用它绑好的 #codexRoot。
      if (typeof initFavor === 'function') initFavor();
      saveGameProgress();
      populateDebugCharSelect();
    }

    // 同步角色基础数据

    function syncCharacterData() {
      if (!gameData.characters || !charactersData) return;
      gameData.characters.forEach(char => {
        const masterData = charactersData.find(m => m.id === char.id);
        if (masterData) {
          char.name = masterData.name;
          char.rarity = masterData.rarity;
          char.class = masterData.class;
          char.baseAttributes = { ...masterData.baseAttributes };
          
          // 确保技能数据完整
          if (masterData.skills && Array.isArray(masterData.skills)) {
            char.skills = masterData.skills.map((s, idx) => {
              const existingSkill = char.skills ? char.skills[idx] : null;
              return {
                ...s,
                level: existingSkill ? (existingSkill.level || 1) : 1
              };
            });
          } else {
            char.skills = char.skills || [];
          }
          
          char.imageUrl = masterData.imageUrl;
          
          // 初始化装备和铭文槽位
          if (!char.equipments || Array.isArray(char.equipments)) {
            char.equipments = {
              weapon: null,
              armor: null,
              helmet: null,
              shoes: null,
              accessory: null
            };
          }
          if (!char.inscriptions) {
            char.inscriptions = [null, null];
          }
          if (typeof char.awakened !== 'boolean') char.awakened = false;
          if (typeof char.goldSpentOnLevelUps !== 'number') char.goldSpentOnLevelUps = 0;
          (char.skills || []).forEach(s => {
            if (typeof s.goldSpentOnUpgrades !== 'number') s.goldSpentOnUpgrades = 0;
          });
        }
      });
      ensureFormation();
      saveGameProgress();
    }

    // 加载游戏数据

    async function loadGameData() {
      console.log("开始加载远程游戏数据...");
      try {
        // 加载角色数据
        const charactersResponse = await fetch('assets/data/characters.json');
        if (!charactersResponse.ok) throw new Error(`无法加载角色数据: ${charactersResponse.status}`);
        const charactersJson = await charactersResponse.json();
        charactersData = charactersJson.characters;
        console.log(`成功加载 ${charactersData.length} 个角色数据`);
        normalizeCharacterSkills(charactersData);
        
        // 加载装备数据
        const equipmentResponse = await fetch('assets/data/items.json');
        if (!equipmentResponse.ok) throw new Error(`无法加载装备数据: ${equipmentResponse.status}`);
        const equipmentJson = await equipmentResponse.json();
        equipmentData = equipmentJson.items;
        
        // 加载铭文数据
        const inscriptionsResponse = await fetch('assets/data/inscriptions.json');
        if (!inscriptionsResponse.ok) throw new Error(`无法加载铭文数据: ${inscriptionsResponse.status}`);
        const inscriptionsJson = await inscriptionsResponse.json();
        inscriptionsData = inscriptionsJson.inscriptions;
        
        // 加载关卡数据
        const stagesResponse = await fetch('assets/data/stages.json');
        if (!stagesResponse.ok) throw new Error(`无法加载关卡数据: ${stagesResponse.status}`);
        const stagesJson = await stagesResponse.json();
        stagesData = stagesJson.stages;
        if (!Array.isArray(stagesData)) stagesData = [];
        if (stagesData.length < 50) {
          stagesData = expandStagesTo50(stagesData);
          console.log(`关卡数据不足，已自动扩展到 ${stagesData.length} 关`);
        }

        // 加载羁绊数据（C6）—— 失败不致命，只是本次无羁绊
        try {
          const bondsResponse = await fetch('assets/data/bonds.json');
          if (bondsResponse.ok) bondsData = await bondsResponse.json();
        } catch (e) {
          console.warn('羁绊数据加载失败，本次运行无羁绊');
        }

        // 加载职业克制环（C9）—— 失败不致命，domain/counters.js 走内置同值兜底
        try {
          const countersResponse = await fetch('assets/data/counters.json');
          if (countersResponse.ok) countersData = await countersResponse.json();
        } catch (e) {
          console.warn('克制数据加载失败，本次运行用内置克制环');
        }

        console.log("所有游戏数据加载成功");
      } catch (error) {
        console.error("加载游戏数据失败:", error.message);
        throw error;
      }
    }

    function loadGameDataFallback() {
      charactersData = [
        {
          id: "char_001",
          name: "剑心",
          rarity: "R",
          class: "warrior",
          baseAttributes: { attack: 100, defense: 50, health: 1000, speed: 80 },
          skills: [{ id: "skill_001", name: "剑刃风暴", description: "对敌方全体造成120%攻击力的伤害", cooldown: 3 }],
          position: "front",
          faction: "knight",
          imageUrl: ""
        },
        {
          id: "char_002",
          name: "紫晶法师",
          rarity: "SR",
          class: "mage",
          baseAttributes: { attack: 180, defense: 60, health: 1200, speed: 85 },
          skills: [{ id: "skill_002", name: "紫晶爆破", description: "对敌方单体造成250%攻击力的伤害，并附加灼烧效果", cooldown: 4 }],
          position: "back",
          faction: "mage",
          imageUrl: ""
        },
        {
          id: "char_003",
          name: "黄金暗影",
          rarity: "SSR",
          class: "assassin",
          baseAttributes: { attack: 280, defense: 80, health: 1500, speed: 130 },
          skills: [{ id: "skill_003", name: "暗影突袭", description: "对敌方后排单体造成350%攻击力的伤害，并有50%几率暴击", cooldown: 3 }],
          position: "front",
          faction: "rogue",
          imageUrl: ""
        },
        {
          id: "char_004",
          name: "彩虹射手",
          rarity: "UR",
          class: "archer",
          baseAttributes: { attack: 450, defense: 100, health: 2000, speed: 110 },
          skills: [{ id: "skill_004", name: "彩虹箭雨", description: "对敌方全体造成250%攻击力的伤害，并降低目标20%防御", cooldown: 5 }],
          position: "back",
          faction: "ranger",
          imageUrl: ""
        },
        {
          id: "char_005",
          name: "圣光祭司",
          rarity: "SUR",
          class: "healer",
          baseAttributes: { attack: 300, defense: 150, health: 4000, speed: 100 },
          skills: [{ id: "skill_005", name: "神圣治愈", description: "恢复己方全体300%攻击力的生命值，并提供20%减伤效果", cooldown: 4 }],
          position: "back",
          faction: "priest",
          imageUrl: ""
        }
      ];
      equipmentData = [
        {
          id: "eq_001",
          name: "蓝光剑",
          type: "weapon",
          rarity: "R",
          attributes: { attack: 30, critRate: 2 },
          imageUrl: ""
        },
        {
          id: "eq_005",
          name: "疾风靴",
          type: "shoes",
          rarity: "R",
          attributes: { speed: 30 },
          imageUrl: ""
        }
      ];
      inscriptionsData = [
        {
          id: "ins_001",
          name: "力量铭文",
          type: "attack",
          rarity: "R",
          attributes: { attack: 10 },
          setEffect: { pieces: 3, effect: "攻击+5%" },
          imageUrl: ""
        },
        {
          id: "ins_002",
          name: "守护铭文",
          type: "defense",
          rarity: "R",
          attributes: { defense: 10 },
          setEffect: { pieces: 3, effect: "防御+5%" },
          imageUrl: ""
        }
      ];
      stagesData = [
        {
          id: "stage_001",
          name: "新手村外围",
          difficulty: "normal",
          recommendedPower: 1000,
          enemies: [
            { id: "enemy_001", name: "史莱姆", health: 500, attack: 50, defense: 20 },
            { id: "enemy_002", name: "哥布林", health: 600, attack: 60, defense: 15 }
          ],
          rewards: {
            exp: 100,
            gold: 500,
            items: [{ id: "eq_001", quantity: 1, dropRate: 0.8 }]
          }
        },
        {
          id: "stage_002",
          name: "黑暗森林",
          difficulty: "normal",
          recommendedPower: 2000,
          enemies: [
            { id: "enemy_003", name: "森林狼", health: 800, attack: 80, defense: 25 },
            { id: "enemy_004", name: "黑暗精灵", health: 700, attack: 90, defense: 20 }
          ],
          rewards: {
            exp: 200,
            gold: 1000,
            items: [{ id: "ins_001", quantity: 1, dropRate: 0.5 }]
          }
        }
      ];
    }

    // 加载游戏进度

    function loadGameProgress() {
      const loaded = (window.__storage && typeof window.__storage.load === 'function') ? window.__storage.load() : null;
      if (!loaded) {
        initializeNewGame();
        return;
      }
      gameData = { ...gameData, ...loaded };
      if (!gameData.fragments) gameData.fragments = {};
      ensureFormation();
      migrateCharactersToFragments();
      fixMissingInstanceIds();
      console.log("游戏进度加载成功");
    }

    function ensureFormation() {
      const size = 6;
      if (!Array.isArray(gameData.formation)) gameData.formation = [];
      gameData.formation = gameData.formation.map(v => {
        if (!v) return null;
        if (typeof v === 'string') return v;
        if (typeof v === 'object' && v.id) return v.id;
        return null;
      });
      while (gameData.formation.length < size) gameData.formation.push(null);
      if (gameData.formation.length > size) gameData.formation = gameData.formation.slice(0, size);
    }

    // 迭代1: 为没有 instanceId 的物品生成唯一 ID

    function fixMissingInstanceIds() {
      if (gameData.equipment) {
        gameData.equipment.forEach(item => {
          if (!item.instanceId) item.instanceId = 'eq_' + Date.now() + Math.random().toString(36).substr(2, 9);
        });
      }
      if (gameData.inscriptions) {
        gameData.inscriptions.forEach(item => {
          if (!item.instanceId) item.instanceId = 'ins_' + Date.now() + Math.random().toString(36).substr(2, 9);
        });
      }
    }

    // 初始化新游戏

    function initializeNewGame() {
      const pickChar = (predicate, fallbackIndex) => {
        const found = charactersData.find(c => c && predicate(c));
        if (found) return found;
        return charactersData[fallbackIndex] || charactersData[0] || null;
      };

      const starterCharacters = [
        pickChar(c => c.id === 'char_001' || c.rarity === 'R', 0),
        pickChar(c => c.id === 'char_002' || c.rarity === 'SR', 1)
      ].filter(Boolean);

      gameData.characters = starterCharacters.map(char => {
        const cloned = JSON.parse(JSON.stringify(char));
        return {
          ...cloned,
          level: 1,
          exp: 0,
          stars: 1,
          skills: (cloned.skills || []).map(skill => ({
            ...skill,
            level: 1
          })),
          equipments: {
            weapon: null,
            armor: null,
            helmet: null,
            shoes: null,
            accessory: null
          },
          inscriptions: [null, null]
        };
      });

      const pickItem = (predicate, fallbackIndex) => {
        const found = equipmentData.find(i => i && predicate(i));
        if (found) return found;
        return equipmentData[fallbackIndex] || equipmentData[0] || null;
      };

      const starterEquipment = [
        pickItem(i => i.id === 'eq_001', 0),
        pickItem(i => i.id === 'eq_005', 1)
      ].filter(Boolean);

      gameData.equipment = starterEquipment.map(item => ({
        ...JSON.parse(JSON.stringify(item)),
        level: 1,
        refine: 0
      }));

      const pickIns = (predicate, fallbackIndex) => {
        const found = inscriptionsData.find(i => i && predicate(i));
        if (found) return found;
        return inscriptionsData[fallbackIndex] || inscriptionsData[0] || null;
      };

      const starterInscriptions = [
        pickIns(i => i.id === 'ins_001', 0),
        pickIns(i => i.id === 'ins_002', 1)
      ].filter(Boolean);

      gameData.inscriptions = starterInscriptions.map(ins => ({
        ...JSON.parse(JSON.stringify(ins)),
        level: 1,
        exp: 0
      }));

      gameData.formation = [
        gameData.characters[0] ? gameData.characters[0].id : null,
        gameData.characters[1] ? gameData.characters[1].id : null,
        null, null, null, null
      ];
      ensureFormation();

      // C11：新档启用新手引导（fresh=true：连出师奖标记一起清，新玩家才领得到）
      //      老档走 domain/tutorial.js 的 ensure() 自动判定为已完成，不打扰。
      const tw = window.__tutorial;
      if (tw && typeof tw.restart === 'function') tw.restart({ fresh: true });
      else gameData.tutorial = { v: 1, active: true, skipped: false, finished: false, claimed: false, done: [] };

      fixMissingInstanceIds();
      
      // 保存游戏进度
      saveGameProgress();
      
      console.log("新游戏初始化成功");
    }

    // 保存游戏进度

    function saveGameProgress() {
      if (window.__storage && typeof window.__storage.save === 'function') {
        window.__storage.save(gameData);
      } else {
        if (!gameData.player) gameData.player = {};
        gameData.player.lastLogin = new Date().getTime();
        localStorage.setItem('cardGameData', JSON.stringify(gameData));
      }
      console.log("游戏进度保存成功");
    }

  // ── 对外暴露（内联 / 其它模块 / HTML onclick 都靠裸标识符或 window 取用）──
  window.initGame = initGame;
  window.syncCharacterData = syncCharacterData;
  window.loadGameData = loadGameData;
  window.loadGameDataFallback = loadGameDataFallback;
  window.loadGameProgress = loadGameProgress;
  window.ensureFormation = ensureFormation;
  window.fixMissingInstanceIds = fixMissingInstanceIds;
  window.initializeNewGame = initializeNewGame;
  window.saveGameProgress = saveGameProgress;

  const api = { initGame, syncCharacterData, loadGameData, loadGameDataFallback, loadGameProgress, ensureFormation, fixMissingInstanceIds, initializeNewGame, saveGameProgress };
  const segs = 'Game.data.bootstrap'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__bootstrap = api;
})();
