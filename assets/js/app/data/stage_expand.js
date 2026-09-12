/**
 * stage_expand.js —— 关卡扩展到 50 章（含难度/章节/掉落/敌人模板/立绘解析）
 *
 * 由 index.html 内联主脚本**整段原样搬入**（P5，2026-09-12）。刻意不做任何重排 /
 * 重命名 / 重缩进 —— 保证"搬代码不改变行为"，证据是 `npm run check:numbers` 的
 * 6 场战斗快照逐位一致。因此本文件保留内联的 4 空格缩进，**不要全局格式化**。
 *
 * 承载：expandStagesTo50
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

    // ⓘ 本段（原 1050 行起，3 个函数 / 635 行）已于 2026-09-12 由 P5 抽离
    //    → assets/js/app/data/characters.js（Game.data.characters）
    //    该模块加载早于本内联脚本，并已把函数名逐个挂到 window，故下面的调用点零改动。

    function expandStagesTo50(existingStages) {
      const stageCount = 120;
      const map = new Map((existingStages || []).map(s => [s.id, s]));
      const difficultyFor = (i) => {
        if (i <= 10) return 'normal';
        if (i <= 30) return 'hard';
        if (i <= 60) return 'nightmare';
        return 'abyss';
      };
      const chapterFor = (i) =>
        i <= 10 ? '第一章：元素试炼' :
        i <= 20 ? '第二章：深渊入侵' :
        i <= 30 ? '第三章：远古龙庭' :
        i <= 40 ? '第四章：机械纪元' :
        i <= 50 ? '第五章：虚空终章' :
        i <= 60 ? '第六章：天穹裂隙' :
        i <= 70 ? '第七章：星界回廊' :
        i <= 80 ? '第八章：深海遗迹' :
        i <= 90 ? '第九章：熔火战境' :
        i <= 100 ? '第十章：虚空裂谷' :
        i <= 110 ? '第十一章：终焉圣域' :
        '第十二章：神域回响';

      const enemyPools = {
        normal: [
          { key: 'slime', name: '史莱姆', class: 'tank', hp: 1.1, atk: 0.8, def: 0.9, spd: 0.9 },
          { key: 'goblin', name: '哥布林', class: 'warrior', hp: 0.9, atk: 0.95, def: 0.8, spd: 1.0 },
          { key: 'wolf', name: '森林狼', class: 'assassin', hp: 0.85, atk: 1.0, def: 0.75, spd: 1.15 },
          { key: 'archer', name: '盗贼弓手', class: 'archer', hp: 0.8, atk: 0.95, def: 0.75, spd: 1.1 }
        ],
        hard: [
          { key: 'elf', name: '黑暗精灵', class: 'archer', hp: 0.95, atk: 1.05, def: 0.85, spd: 1.15 },
          { key: 'golem', name: '岩石傀儡', class: 'tank', hp: 1.3, atk: 0.9, def: 1.25, spd: 0.85 },
          { key: 'mage', name: '黑暗法师', class: 'mage', hp: 0.9, atk: 1.2, def: 0.8, spd: 1.0 },
          { key: 'guard', name: '重甲守卫', class: 'warrior', hp: 1.15, atk: 1.05, def: 1.05, spd: 0.95 }
        ],
        nightmare: [
          { key: 'warlord', name: '深渊战将', class: 'warrior', hp: 1.25, atk: 1.2, def: 1.1, spd: 1.0 },
          { key: 'reaper', name: '灵魂收割者', class: 'assassin', hp: 1.0, atk: 1.35, def: 0.9, spd: 1.2 },
          { key: 'oracle', name: '禁术先知', class: 'mage', hp: 1.05, atk: 1.3, def: 0.95, spd: 1.05 },
          { key: 'bastion', name: '钢铁壁垒', class: 'tank', hp: 1.6, atk: 1.0, def: 1.5, spd: 0.85 }
        ],
        abyss: [
          { key: 'dragon', name: '远古龙裔', class: 'tank', hp: 2.0, atk: 1.15, def: 1.7, spd: 0.9 },
          { key: 'void', name: '虚空裂隙者', class: 'mage', hp: 1.3, atk: 1.6, def: 1.1, spd: 1.1 },
          { key: 'phantom', name: '幻影刺客', class: 'assassin', hp: 1.1, atk: 1.65, def: 1.0, spd: 1.3 },
          { key: 'seraph', name: '堕落圣使', class: 'archer', hp: 1.25, atk: 1.45, def: 1.05, spd: 1.2 }
        ]
      };

      const dropTable = (i) => {
        const drops = [];
        const stoneQty = 1 + Math.floor(i / 4);
        const dustQty = 1 + Math.floor(i / 6);
        drops.push({ id: 'item_001', quantity: stoneQty, dropRate: 1 });
        drops.push({ id: 'item_002', quantity: dustQty, dropRate: 1 });
        if (i >= 18 && i % 3 === 0) drops.push({ id: 'item_003', quantity: 1 + Math.floor(i / 20), dropRate: 0.55 });
        if (i % 10 === 0) drops.push({ id: 'item_004', quantity: 1, dropRate: 0.65 });
        if (i <= 10) {
          drops.push({ id: 'eq_001', quantity: 1, dropRate: 0.55 });
          drops.push({ id: 'eq_002', quantity: 1, dropRate: 0.35 });
          drops.push({ id: 'ins_001', quantity: 1, dropRate: 0.25 });
          drops.push({ id: 'eq_007', quantity: 1, dropRate: 0.18 });
          drops.push({ id: 'eq_010', quantity: 1, dropRate: 0.15 });
          drops.push({ id: 'ins_004', quantity: 1, dropRate: 0.12 });
        } else if (i <= 30) {
          drops.push({ id: 'eq_005', quantity: 1, dropRate: 0.30 });
          drops.push({ id: 'ins_002', quantity: 1, dropRate: 0.22 });
          drops.push({ id: 'ins_001', quantity: 1, dropRate: 0.18 });
          drops.push({ id: 'eq_012', quantity: 1, dropRate: 0.14 });
          drops.push({ id: 'eq_015', quantity: 1, dropRate: 0.10 });
          drops.push({ id: 'eq_019', quantity: 1, dropRate: 0.10 });
          drops.push({ id: 'ins_007', quantity: 1, dropRate: 0.10 });
          drops.push({ id: 'ins_008', quantity: 1, dropRate: 0.10 });
          drops.push({ id: 'ins_012', quantity: 1, dropRate: 0.09 });
          drops.push({ id: 'ins_014', quantity: 1, dropRate: 0.09 });
        } else if (i <= 60) {
          drops.push({ id: 'eq_003', quantity: 1, dropRate: 0.16 });
          drops.push({ id: 'ins_003', quantity: 1, dropRate: 0.14 });
          drops.push({ id: 'eq_005', quantity: 1, dropRate: 0.12 });
          drops.push({ id: 'eq_016', quantity: 1, dropRate: 0.10 });
          drops.push({ id: 'eq_018', quantity: 1, dropRate: 0.08 });
          drops.push({ id: 'eq_021', quantity: 1, dropRate: 0.10 });
          drops.push({ id: 'eq_023', quantity: 1, dropRate: 0.10 });
          drops.push({ id: 'eq_028', quantity: 1, dropRate: 0.08 });
          drops.push({ id: 'eq_029', quantity: 1, dropRate: 0.08 });
          drops.push({ id: 'ins_005', quantity: 1, dropRate: 0.09 });
          drops.push({ id: 'ins_006', quantity: 1, dropRate: 0.09 });
          drops.push({ id: 'ins_009', quantity: 1, dropRate: 0.08 });
          drops.push({ id: 'ins_010', quantity: 1, dropRate: 0.08 });
        } else {
          drops.push({ id: 'eq_004', quantity: 1, dropRate: 0.10 });
          drops.push({ id: 'eq_006', quantity: 1, dropRate: 0.06 });
          drops.push({ id: 'ins_003', quantity: 1, dropRate: 0.10 });
          drops.push({ id: 'eq_013', quantity: 1, dropRate: 0.08 });
          drops.push({ id: 'eq_014', quantity: 1, dropRate: 0.05 });
          drops.push({ id: 'eq_017', quantity: 1, dropRate: 0.07 });
          drops.push({ id: 'eq_020', quantity: 1, dropRate: 0.05 });
          drops.push({ id: 'eq_022', quantity: 1, dropRate: 0.06 });
          drops.push({ id: 'eq_024', quantity: 1, dropRate: 0.06 });
          drops.push({ id: 'eq_025', quantity: 1, dropRate: 0.05 });
          drops.push({ id: 'eq_032', quantity: 1, dropRate: 0.04 });
          drops.push({ id: 'ins_011', quantity: 1, dropRate: 0.04 });
          drops.push({ id: 'ins_013', quantity: 1, dropRate: 0.05 });
          drops.push({ id: 'ins_015', quantity: 1, dropRate: 0.06 });
        }
        if (i % 10 === 0) {
          drops.push({ id: 'eq_006', quantity: 1, dropRate: 0.08 });
        }
        return drops;
      };

      const buildEnemies = (i, difficulty) => {
        const isBoss = i % 5 === 0;
        const pool = enemyPools[difficulty] || enemyPools.normal;
        const baseAtk = Math.floor(45 * Math.pow(1.065, i - 1));
        const baseDef = Math.floor(18 * Math.pow(1.06, i - 1));
        const baseHp = Math.floor(620 * Math.pow(1.075, i - 1));
        const baseSpd = 78 + Math.floor(i * 0.65);
        const count = i <= 10 ? 3 : (i <= 25 ? 4 : 5);
        const resolveImg = (name) => (window.__sprites && typeof window.__sprites.resolveSpriteUrlByName === 'function')
          ? (window.__sprites.resolveSpriteUrlByName(name) || '')
          : '';

        const enemies = [];
        for (let idx = 0; idx < count; idx++) {
          const t = pool[(i + idx) % pool.length];
          const eliteBoost = (i % 7 === 0 && idx === 0) ? 1.25 : 1.0;
          const nm = `${t.name}${eliteBoost > 1 ? '·精英' : ''}`;
          enemies.push({
            id: `enemy_${String(i).padStart(3, '0')}_${idx + 1}`,
            name: nm,
            class: t.class,
            imageUrl: resolveImg(nm) || resolveImg(t.name),
            health: Math.floor(baseHp * t.hp * eliteBoost),
            attack: Math.floor(baseAtk * t.atk * eliteBoost),
            defense: Math.floor(baseDef * t.def * eliteBoost),
            speed: Math.floor(baseSpd * t.spd),
            critRate: Math.min(28, 4 + Math.floor(i * 0.28)),
            critDmg: 150 + Math.min(55, Math.floor(i * 0.5)),
            dodgeRate: Math.min(18, 2 + Math.floor(i * 0.18)),
            blockRate: Math.min(18, 2 + Math.floor(i * 0.18)),
            dmgReduc: Math.min(25, Math.floor(i * 0.22)),
            lifesteal: Math.min(12, Math.floor(i * 0.12)),
            effectHit: Math.min(20, Math.floor(i * 0.22)),
            penetration: Math.min(24, Math.floor(i * 0.2)),
            tenacity: Math.min(24, Math.floor(i * 0.2)),
            isBoss: false
          });
        }

        if (isBoss) {
          const bossTemplate = pool[(i + 2) % pool.length];
          const bossName = `${bossTemplate.name}·首领`;
          enemies.push({
            id: `boss_${String(i).padStart(3, '0')}`,
            name: bossName,
            class: bossTemplate.class,
            imageUrl: resolveImg(bossName) || resolveImg(bossTemplate.name),
            health: Math.floor(baseHp * bossTemplate.hp * (3.9 + Math.min(1.0, i / 120))),
            attack: Math.floor(baseAtk * bossTemplate.atk * 1.95),
            defense: Math.floor(baseDef * bossTemplate.def * 2.05),
            speed: Math.floor(baseSpd * 0.9),
            critRate: Math.min(38, 8 + Math.floor(i * 0.35)),
            critDmg: 165 + Math.min(85, Math.floor(i * 0.75)),
            dodgeRate: Math.min(16, 2 + Math.floor(i * 0.12)),
            blockRate: Math.min(26, 4 + Math.floor(i * 0.22)),
            dmgReduc: Math.min(38, 6 + Math.floor(i * 0.32)),
            lifesteal: Math.min(18, 2 + Math.floor(i * 0.16)),
            effectHit: Math.min(28, 6 + Math.floor(i * 0.24)),
            penetration: Math.min(32, 6 + Math.floor(i * 0.24)),
            tenacity: Math.min(32, 6 + Math.floor(i * 0.24)),
            isBoss: true
          });
        }

        return enemies;
      };

      const stages = [];
      for (let i = 1; i <= stageCount; i++) {
        const id = `stage_${String(i).padStart(3, '0')}`;
        const difficulty = difficultyFor(i);
        const rec1 = 900 * Math.pow(1.14, Math.min(29, i - 1));
        const rec2 = i > 30 ? Math.pow(1.08, Math.min(30, i - 30)) : 1;
        const rec3 = i > 60 ? Math.pow(1.06, Math.min(30, i - 60)) : 1;
        const rec4 = i > 90 ? Math.pow(1.05, i - 90) : 1;
        const rec = Math.floor(rec1 * rec2 * rec3 * rec4 * (i % 5 === 0 ? 1.10 : 1));
        const existing = map.get(id);
        const chapter = chapterFor(i);
        const isBoss = i % 5 === 0;

        const affixes = [];
        if (i >= 6 && i <= 50 && i % 3 === 0) affixes.push({ id: 'healDown', name: '治疗削弱', value: Math.min(35, 8 + Math.floor(i * 0.45)) });
        if (i >= 11 && i % 4 === 0) affixes.push({ id: 'critResist', name: '暴击抵抗', value: Math.min(28, 6 + Math.floor(i * 0.22)) });
        if (chapter === '第一章：元素试炼') affixes.push({ id: 'burnAmp', name: '灼烧增幅', value: Math.min(60, 15 + Math.floor(i * 0.8)) });
        if (chapter === '第二章：深渊入侵' && i % 2 === 0) affixes.push({ id: 'dotUp', name: '流血/中毒增幅', value: Math.min(60, 12 + Math.floor(i * 0.6)) });
        if (chapter === '第二章：深渊入侵' && i % 3 === 1) affixes.push({ id: 'energyDrain', name: '能量干扰', value: Math.min(55, 20 + Math.floor(i * 0.6)) });
        if (chapter === '第三章：远古龙庭') affixes.push({ id: 'ccResist', name: '控制抵抗', value: Math.min(60, 15 + Math.floor(i * 0.6)) });
        if (chapter === '第四章：机械纪元') affixes.push({ id: 'shieldBreak', name: '破盾协议', value: Math.min(55, 18 + Math.floor(i * 0.6)) });
        if (chapter === '第四章：机械纪元' && i % 2 === 0) affixes.push({ id: 'trueResist', name: '真实抗性', value: Math.min(55, 15 + Math.floor(i * 0.55)) });
        if (chapter === '第五章：虚空终章') affixes.push({ id: 'dmgTakenUp', name: '虚空压制', value: Math.min(35, 10 + Math.floor(i * 0.4)) });
        if (chapter === '第五章：虚空终章') affixes.push({ id: 'antiHeal', name: '反治疗', value: Math.min(55, 18 + Math.floor(i * 0.45)) });
        if (chapter === '第五章：虚空终章' && i % 2 === 1) affixes.push({ id: 'summonBoost', name: '召唤强化', value: Math.min(60, 20 + Math.floor(i * 0.5)) });
        if (i >= 55 && i % 4 === 1) affixes.push({ id: 'nonCritReduc', name: '非暴击减伤', value: Math.min(55, 18 + Math.floor(i * 0.35)) });
        if (i >= 70 && i % 3 === 0) affixes.push({ id: 'bossShield', name: '首领护盾', value: Math.min(45, 18 + Math.floor(i * 0.25)) });

        const bossMechanics = isBoss ? {
          scriptId:
            chapter === '第一章：元素试炼' ? 'element_trial' :
            chapter === '第二章：深渊入侵' ? 'abyss_sacrifice' :
            chapter === '第三章：远古龙庭' ? 'dragon_roar' :
            chapter === '第四章：机械纪元' ? 'machine_protocol' :
            chapter === '第五章：虚空终章' ? 'void_phase' :
            chapter === '第六章：天穹裂隙' ? 'sky_rift' :
            chapter === '第七章：星界回廊' ? 'astral_prism' :
            chapter === '第八章：深海遗迹' ? 'tide_titan' :
            chapter === '第九章：熔火战境' ? 'magma_overload' :
            chapter === '第十章：虚空裂谷' ? 'void_phase' :
            chapter === '第十一章：终焉圣域' ? 'sanctuary_judgement' :
            'divine_echo',
          phaseThresholds: [0.7, 0.4],
          immuneTurns: 1,
          summonCount: chapter === '第五章：虚空终章' ? 3 : 2,
          retaliateChance: Math.min(35, 12 + Math.floor(i * 0.4)),
          phaseAtkUp: Math.min(60, 18 + Math.floor(i * 0.8)),
          phaseDefUp: Math.min(60, 18 + Math.floor(i * 0.7)),
          phaseSpeedUp: Math.min(35, 8 + Math.floor(i * 0.35)),
          elementResist: Math.min(70, 30 + Math.floor(i * 0.6)),
          sacrificeHealPct: Math.min(8, 3 + Math.floor(i * 0.06)),
          roarEvery: 3,
          roarStunChance: Math.min(60, 25 + Math.floor(i * 0.6)),
          protocolShieldPct: Math.min(28, 12 + Math.floor(i * 0.35))
        } : null;

        const generated = {
          id,
          name: `第${i}关 · ${chapter.replace(/^.+：/, '')}`,
          chapter,
          difficulty,
          recommendedPower: rec,
          enemies: buildEnemies(i, difficulty),
          modifiers: {
            enrageRound: Math.max(6, 12 - Math.floor(i / 6)),
            boss: isBoss,
            affixes,
            bossMechanics
          },
          rewards: {
            exp: Math.floor(90 * Math.pow(1.12, Math.min(29, i - 1)) * (i > 30 ? Math.pow(1.07, Math.min(30, i - 30)) : 1) * (i > 60 ? Math.pow(1.05, Math.min(30, i - 60)) : 1) * (i > 90 ? Math.pow(1.04, i - 90) : 1) * (i % 5 === 0 ? 1.45 : 1)),
            gold: Math.floor(420 * Math.pow(1.13, Math.min(29, i - 1)) * (i > 30 ? Math.pow(1.08, Math.min(30, i - 30)) : 1) * (i > 60 ? Math.pow(1.05, Math.min(30, i - 60)) : 1) * (i > 90 ? Math.pow(1.04, i - 90) : 1) * (i % 5 === 0 ? 1.30 : 1)),
            items: dropTable(i)
          }
        };
        if (existing && existing.name) generated.name = existing.name;
        if (existing && existing.difficulty) generated.difficulty = existing.difficulty;
        stages.push(generated);
      }
      return stages;
    }

  // ── 对外暴露（内联 / 其它模块 / HTML onclick 都靠裸标识符或 window 取用）──
  window.expandStagesTo50 = expandStagesTo50;

  const api = { expandStagesTo50 };
  const segs = 'Game.data.stageExpand'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__stageExpand = api;
})();
