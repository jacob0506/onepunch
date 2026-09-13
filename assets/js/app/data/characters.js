/**
 * characters.js —— 角色数据规范化（技能补全 / 被动文本反解成效果 / 碎片迁移）
 *
 * 由 index.html 内联主脚本**整段原样搬入**（P5，2026-09-12）。刻意不做任何重排 /
 * 重命名 / 重缩进 —— 保证"搬代码不改变行为"，证据是 `npm run check:numbers` 的
 * 6 场战斗快照逐位一致。因此本文件保留内联的 4 空格缩进，**不要全局格式化**。
 *
 * 承载：normalizeCharacterSkills · inferSkillEffects · migrateCharactersToFragments
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

    // ⓘ 本段（原 1050 行起，9 个函数 / 390 行）已于 2026-09-12 由 P5 抽离
    //    → assets/js/app/data/bootstrap.js（Game.data.bootstrap）
    //    该模块加载早于本内联脚本，并已把函数名逐个挂到 window，故下面的调用点零改动。

    function normalizeCharacterSkills(characters) {
      if (!Array.isArray(characters)) return;
      characters.forEach(char => {
        if (!char || !Array.isArray(char.skills)) return;
        char.skills.forEach(skill => {
          if (!skill) return;
          if (typeof skill.cost !== 'number') skill.cost = 2;
          if (!Array.isArray(skill.effects) || skill.effects.length === 0) {
            skill.effects = inferSkillEffects(skill);
          }
        });

        if (char.id === 'char_sur_002' && char.skills[0]) {
          const s = char.skills[0];
          s.name = '瞬破连击';
          s.cooldown = 4;
          s.cost = 2;
          s.description = '对敌方全体进行4连击：每段先解除目标“免疫”，再造成130%生命上限+10的伤害，并附加100%生命上限的真实伤害。释放后提升自身20%真实伤害增伤，持续2回合。';
          const seq = [{ type: 'buff', target: 'ally', stat: 'trueDmgUp', value: 20, turns: 2 }];
          for (let i = 0; i < 4; i++) {
            seq.push({ type: 'dispel', target: 'allEnemies', statuses: ['immune'] });
            seq.push({ type: 'damage', target: 'allEnemies', scaleFrom: 'maxHp', scale: 1.3, addFlat: 10, hits: 1 });
            seq.push({ type: 'trueDamage', target: 'allEnemies', scaleFrom: 'maxHp', scale: 1.0, hits: 1 });
          }
          s.effects = seq;
        }

        if (char.id === 'char_sur_001' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 4;
          s.effects = [
            { type: 'dispel', target: 'allEnemies', statuses: ['immune'] },
            { type: 'damage', target: 'allEnemies', scale: 3.8, hits: 1 },
            { type: 'trueDamage', target: 'allEnemies', scaleFrom: 'targetMaxHp', scale: 0.12, hits: 1 },
            { type: 'debuff', target: 'allEnemies', stat: 'defDown', value: 15, turns: 2 }
          ];
        }

        if (char.id === 'char_sur_003' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 4;
          s.effects = [
            { type: 'damage', target: 'randomEnemies', scale: 3.5, hits: 4 },
            { type: 'cc', target: 'randomEnemies', cc: 'stun', turns: 1, chance: 40 }
          ];
        }

        if (char.id === 'char_sur_004' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 5;
          s.effects = [
            { type: 'taunt', turns: 2 },
            { type: 'buff', target: 'ally', stat: 'dmgReducUp', value: 50, turns: 2 },
            { type: 'shield', target: 'ally', scale: 0.9, turns: 2 }
          ];
        }

        if (char.id === 'char_sur_006' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 4;
          s.effects = [
            { type: 'damage', target: 'enemyLowest', scale: 7.0, hits: 1 },
            { type: 'buff', target: 'ally', stat: 'spdUp', value: 25, turns: 1 }
          ];
        }

        if (char.id === 'char_sur_009' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 1;
          s.cooldown = 3;
          s.effects = [
            { type: 'selfCost', costType: 'currentHpPct', value: 10 },
            { type: 'damage', target: 'enemy', scale: 8.0, hits: 1 },
            { type: 'buff', target: 'ally', stat: 'nonCritReduc', value: 25, turns: 1 }
          ];
        }

        if (char.id === 'char_sur_011' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 5;
          s.effects = [
            { type: 'damage', target: 'allEnemies', scale: 3.8, hits: 1 },
            { type: 'damage', target: 'allEnemies', scale: 3.8, hits: 1, requireStatus: 'shock' }
          ];
        }

        if (char.id === 'char_sur_012' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 4;
          s.effects = [
            { type: 'damage', target: 'randomEnemies', scale: 5.0, hits: 2 },
            { type: 'buff', target: 'ally', stat: 'immune', value: 1, turns: 1 }
          ];
        }

        if (char.id === 'char_sur_013' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 4;
          s.effects = [
            { type: 'dispel', target: 'allEnemies', statuses: ['immune'] },
            { type: 'debuff', target: 'allEnemies', stat: 'shock', value: 1, turns: 2 },
            { type: 'debuff', target: 'allEnemies', stat: 'defDown', value: 25, turns: 2 },
            { type: 'debuff', target: 'allEnemies', stat: 'dodgeUp', value: -25, turns: 2 },
            { type: 'damage', target: 'allEnemies', scale: 3.2, hits: 1 },
            { type: 'damage', target: 'allEnemies', scale: 2.4, hits: 1, requireStatus: 'shock' },
            { type: 'trueDamage', target: 'allEnemies', scaleFrom: 'targetMaxHp', scale: 0.12, hits: 1, requireStatus: 'shock' }
          ];
        }

        if (char.id === 'char_sur_014' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 5;
          s.effects = [
            { type: 'heal', target: 'allAllies', scale: 3.0, hits: 1 },
            { type: 'dispel', target: 'allAllies', statuses: ['burn', 'bleed', 'poison', 'stun', 'silence', 'charm', 'spdDown', 'spdFlatDown', 'defDown', 'healDownDebuff'] },
            { type: 'shield', target: 'allAllies', scale: 0.45, turns: 2 },
            { type: 'buff', target: 'allAllies', stat: 'ccImmune', value: 1, turns: 1 },
            { type: 'buff', target: 'allAllies', stat: 'atkUp', value: 18, turns: 2 }
          ];
        }

        if (char.id === 'char_ur_001' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 4;
          s.effects = [
            { type: 'debuff', target: 'allEnemies', stat: 'spdFlatDown', value: 40, turns: 2 },
            { type: 'damage', target: 'randomEnemies', scale: 1.2, hits: 8 },
            { type: 'cc', target: 'randomEnemies', cc: 'silence', turns: 1, chance: 35 },
            { type: 'cc', target: 'randomEnemies', cc: 'silence', turns: 1, chance: 35 },
            { type: 'cc', target: 'randomEnemies', cc: 'silence', turns: 1, chance: 35 },
            { type: 'trueDamage', target: 'randomEnemies', scaleFrom: 'targetMaxHp', scale: 0.06, hits: 2, requireStatus: 'silence' }
          ];
        }

        if (char.id === 'char_ur_002' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 4;
          s.effects = [
            { type: 'damage', target: 'allEnemies', scale: 1.8, hits: 1 },
            { type: 'dot', target: 'allEnemies', dot: 'burn', scale: 0.12, turns: 3, chance: 100 }
          ];
        }

        if (char.id === 'char_ur_003' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 3;
          s.effects = [
            { type: 'damage', target: 'enemy', scale: 3.0, hits: 1 },
            { type: 'shield', target: 'ally', scale: 1.0, turns: 2 }
          ];
        }

        if (char.id === 'char_ur_004' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 3;
          s.effects = [
            { type: 'damage', target: 'enemy', scale: 4.5, hits: 1 },
            { type: 'dot', target: 'enemy', dot: 'bleed', scale: 0.14, turns: 3, chance: 100 }
          ];
        }

        if (char.id === 'char_ur_005' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 4;
          s.effects = [
            { type: 'damage', target: 'randomEnemies', scale: 2.0, hits: 2 },
            { type: 'cc', target: 'randomEnemies', cc: 'stun', turns: 1, chance: 30 }
          ];
        }

        if (char.id === 'char_ur_006' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 4;
          s.effects = [
            { type: 'damage', target: 'enemy', scale: 5.0, hits: 1 },
            { type: 'damage', target: 'enemy', scale: 5.0, hits: 1, requireStatus: 'stun' }
          ];
        }

        if (char.id === 'char_ur_007' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 4;
          s.effects = [
            { type: 'damage', target: 'randomEnemies', scale: 2.2, hits: 3 },
            { type: 'debuff', target: 'randomEnemies', stat: 'atkUp', value: -20, turns: 2 }
          ];
        }

        if (char.id === 'char_ur_008' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 4;
          s.effects = [
            { type: 'heal', target: 'allAllies', scale: 1.5, hits: 1 },
            { type: 'shield', target: 'allAllies', scale: 0.35, turns: 2 }
          ];
        }

        if (char.id === 'char_ur_009' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 3;
          s.effects = [
            { type: 'buff', target: 'ally', stat: 'lifestealUp', value: 50, turns: 2 },
            { type: 'damage', target: 'enemy', scale: 4.0, hits: 1 }
          ];
        }

        if (char.id === 'char_ur_010' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 4;
          s.effects = [
            { type: 'damage', target: 'allEnemies', scale: 1.5, hits: 1 },
            { type: 'dot', target: 'allEnemies', dot: 'poison', scale: 0.12, turns: 3, chance: 100 }
          ];
        }

        if (char.id === 'char_ur_011' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 4;
          s.effects = [
            { type: 'damage', target: 'allEnemies', scale: 1.6, hits: 1 },
            { type: 'buff', target: 'ally', stat: 'dmgReducUp', value: 20, turns: 2 }
          ];
        }

        if (char.id === 'char_ur_012' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 4;
          s.effects = [
            { type: 'damage', target: 'enemy', scale: 4.0, hits: 1 },
            { type: 'cc', target: 'enemy', cc: 'silence', turns: 2, chance: 100 }
          ];
        }

        if (char.id === 'char_ur_013' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 3;
          s.effects = [
            { type: 'heal', target: 'allyLowest', scale: 3.0, hits: 1 },
            { type: 'dispel', target: 'allyLowest', statuses: ['burn', 'bleed', 'poison', 'stun', 'silence', 'charm', 'spdDown', 'spdFlatDown', 'defDown', 'healDownDebuff'] }
          ];
        }

        if (char.id === 'char_ur_014' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 5;
          s.effects = [
            { type: 'damage', target: 'allEnemies', scale: 1.6, hits: 1 },
            { type: 'cc', target: 'randomEnemies', cc: 'stun', turns: 1, chance: 20 }
          ];
        }

        if (char.id === 'char_ur_015' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 3;
          s.effects = [
            { type: 'damage', target: 'randomEnemies', scale: 0.8, hits: 6 },
            { type: 'buff', target: 'ally', stat: 'atkUp', value: 15, turns: 2 }
          ];
        }

        if (char.id === 'char_ur_016' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 5;
          s.effects = [
            { type: 'taunt', turns: 2 },
            { type: 'buff', target: 'ally', stat: 'dmgReducUp', value: 35, turns: 2 },
            { type: 'shield', target: 'ally', scale: 1.0, turns: 2 },
            { type: 'damage', target: 'enemy', scale: 2.0, hits: 1 }
          ];
        }

        if (char.id === 'char_ur_017' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 3;
          s.effects = [
            { type: 'damage', target: 'enemy', scale: 4.0, hits: 1 },
            { type: 'energySteal', target: 'enemy', amount: 2 }
          ];
        }

        if (char.id === 'char_ur_018' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 6;
          s.effects = [
            { type: 'buff', target: 'ally', stat: 'atkUp', value: 30, turns: 3 },
            { type: 'shield', target: 'ally', scale: 1.2, turns: 3 },
            { type: 'buff', target: 'ally', stat: 'nonCritUndying', value: 1, turns: 3 }
          ];
        }

        if (char.id === 'char_ur_019' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 4;
          s.effects = [
            { type: 'damage', target: 'randomEnemies', scale: 0.8, hits: 6 }
          ];
        }

        if (char.id === 'char_ur_020' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 5;
          s.effects = [
            { type: 'execute', target: 'enemy', threshold: 0.2 },
            { type: 'damage', target: 'enemy', scale: 3.0, hits: 1 }
          ];
        }

        if (char.id === 'char_ur_021' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 3;
          s.effects = [
            { type: 'damage', target: 'enemy', scale: 3.5, hits: 1 },
            { type: 'debuff', target: 'enemy', stat: 'defDown', value: 40, turns: 2 }
          ];
        }

        if (char.id === 'char_ur_022' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 4;
          s.effects = [
            { type: 'damage', target: 'allEnemies', scale: 1.8, hits: 1 },
            { type: 'cc', target: 'randomEnemies', cc: 'charm', turns: 1, chance: 35 }
          ];
        }

        if (char.id === 'char_ur_023' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 3;
          s.effects = [
            { type: 'damage', target: 'enemy', scale: 1.2, hits: 3 },
            { type: 'buff', target: 'ally', stat: 'dodgeUp', value: 20, turns: 2 }
          ];
        }

        if (char.id === 'char_ur_024' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 4;
          s.effects = [
            { type: 'damage', target: 'randomEnemies', scale: 3.5, hits: 2 }
          ];
        }

        // C12 数值再平衡（2026-09-14）：机巧炮姬·零 —— 文本反解无法表达
        // "8枚导弹随机攻击"（infer 只认 X次/X名，曾解析成 0.85×1 单体废技），
        // 这里按设计意图显式给 effects：每段 hit 都会重抽随机目标。
        if (char.id === 'char_ssr_015' && char.skills[0]) {
          const s = char.skills[0];
          s.effects = [
            { type: 'damage', target: 'randomEnemies', scale: 0.85, hits: 8 }
          ];
        }

        // C12 数值再平衡（2026-09-14）：万物之母·盖亚 —— "分摊50%伤害"引擎无
        // 对应 effect 类型，此前反解为空、上场只有普攻（SUR 最贵废卡）。
        // 用既有类型等价表达：全体护盾（×自身攻击）+ 自回复 + 自身减伤。
        if (char.id === 'char_sur_008' && char.skills[0]) {
          const s = char.skills[0];
          s.cost = 2;
          s.cooldown = 4;
          s.effects = [
            { type: 'shield', target: 'allAllies', scale: 1.5, turns: 2 },
            { type: 'heal', target: 'ally', scale: 1.0 },
            { type: 'buff', target: 'ally', stat: 'dmgReducUp', value: 15, turns: 2 }
          ];
        }
      });
    }

    function inferSkillEffects(skill) {
      const desc = (skill.description || '').trim();
      const effects = [];

      // C12：优先取"造成X%"的伤害倍率 —— 修复"生命低于20%…造成320%"这类
      // 前置百分比把倍率劫持成 0.2 的废卡 bug（赤月裁决·鸦）。
      const percent = (() => {
        const m = desc.match(/造成(\d+(?:\.\d+)?)\s*%/);
        if (m) return (parseFloat(m[1]) / 100);
        const m2 = desc.match(/(\d+)\s*%/);
        return m2 ? (parseFloat(m2[1]) / 100) : null;
      })();

      const turns = (() => {
        const m = desc.match(/持续(\d+)回合/);
        return m ? parseInt(m[1], 10) : 2;
      })();

      const targetAllEnemies = /敌方全体/.test(desc);
      const targetEnemy = /敌方单体|单体/.test(desc) && !targetAllEnemies;
      const targetAllAllies = /全体队友|全队/.test(desc);
      const targetLowest = /生命(最低|百分比最低)/.test(desc);
      const randomCount = (() => {
        const m = desc.match(/随机(\d+)名/);
        return m ? parseInt(m[1], 10) : null;
      })();
      const hits = (() => {
        const m = desc.match(/(\d+)次/);
        return m ? parseInt(m[1], 10) : null;
      })();
      const stunChance = (() => {
        const m = desc.match(/(\d+)\s*%[^。\n]*眩晕/);
        return m ? parseInt(m[1], 10) : null;
      })();
      const stunTurns = /(\d+)回合/.test(desc) ? parseInt(desc.match(/(\d+)回合/)[1], 10) : 1;
      const silenceTurns = /沉默(\d+)回合/.test(desc) ? parseInt(desc.match(/沉默(\d+)回合/)[1], 10) : 0;
      const ignoreDef = (() => {
        const m = desc.match(/无视目标(\d+)\s*%防御/);
        return m ? parseInt(m[1], 10) : null;
      })();
      const spdDownPct = (() => {
        const m = desc.match(/降低其(\d+)\s*%速度/);
        return m ? parseInt(m[1], 10) : null;
      })();
      const spdDownFlat = (() => {
        const m = desc.match(/减少目标(\d+)点速度/);
        return m ? parseInt(m[1], 10) : null;
      })();
      const atkDownPct = (() => {
        const m = desc.match(/降低其(\d+)\s*%攻击力/);
        return m ? parseInt(m[1], 10) : null;
      })();
      const energySteal = (() => {
        const m = desc.match(/偷取目标(\d+)点能量/);
        return m ? parseInt(m[1], 10) : null;
      })();
      const selfCostCurrentHpPct = (() => {
        const m = desc.match(/消耗自身(\d+)\s*%当前生命/);
        return m ? parseInt(m[1], 10) : null;
      })();
      const executePct = (() => {
        // C12：兼容"血量低于/生命低于"两种措辞（赤月裁决·鸦用"生命低于"）
        const m = desc.match(/(?:血量|生命)低于(\d+)\s*%[^，。]*直接斩杀/);
        return m ? parseInt(m[1], 10) : null;
      })();

      if (/恢复/.test(desc)) {
        const scale = percent || 1.0;
        const healTarget = targetAllAllies ? 'allAllies' : (targetLowest ? 'allyLowest' : 'ally');
        effects.push({
          type: 'heal',
          target: healTarget,
          scale
        });
        const atkBuff = desc.match(/增加其(\d+)\s*%攻击力/);
        if (atkBuff) {
          effects.push({
            type: 'buff',
            target: healTarget === 'allAllies' ? 'allAllies' : 'ally',
            stat: 'atkUp',
            value: parseInt(atkBuff[1], 10),
            turns
          });
        }
        const spdBuff = desc.match(/增加其(\d+)\s*%速度/);
        if (spdBuff) {
          effects.push({
            type: 'buff',
            target: healTarget === 'allAllies' ? 'allAllies' : 'ally',
            stat: 'spdUp',
            value: parseInt(spdBuff[1], 10),
            turns
          });
        }
        if (/清除负面状态|解除负面状态|净化/.test(desc)) {
          effects.push({
            type: 'dispel',
            target: healTarget === 'allAllies' ? 'allAllies' : 'allyLowest',
            statuses: ['burn', 'bleed', 'poison', 'shock', 'stun', 'silence', 'charm', 'spdDown', 'spdFlatDown', 'defDown', 'healDownDebuff']
          });
        }
        const shield = desc.match(/护盾[^0-9]*(\d+)\s*%攻击力/);
        if (shield) {
          effects.push({
            type: 'shield',
            target: healTarget === 'allAllies' ? 'allAllies' : (healTarget === 'allyLowest' ? 'allyLowest' : 'ally'),
            scale: parseInt(shield[1], 10) / 100,
            turns
          });
        }
        const ccImmuneTurns = desc.match(/免疫控制(\d+)回合/);
        if (ccImmuneTurns) {
          effects.push({
            type: 'buff',
            target: healTarget === 'allAllies' ? 'allAllies' : 'ally',
            stat: 'ccImmune',
            value: 1,
            turns: parseInt(ccImmuneTurns[1], 10)
          });
        }
        return effects;
      }

      if (selfCostCurrentHpPct) {
        effects.push({ type: 'selfCost', costType: 'currentHpPct', value: selfCostCurrentHpPct });
      }

      if (/造成/.test(desc) && percent) {
        const target =
          targetAllEnemies ? 'allEnemies' :
          randomCount ? 'randomEnemies' :
          targetEnemy ? (targetLowest ? 'enemyLowest' : 'enemy') :
          'enemy';

        effects.push({
          type: 'damage',
          target,
          scale: percent,
          hits: hits || (randomCount ? Math.min(4, randomCount) : 1),
          ignoreDef
        });

        if (/灼烧|燃烧/.test(desc)) {
          effects.push({ type: 'dot', target, dot: 'burn', scale: 0.18, turns: 2, chance: 100 });
        }
        if (/流血/.test(desc)) {
          effects.push({ type: 'dot', target, dot: 'bleed', scale: 0.14, turns: 3, chance: 100 });
        }
        if (/中毒/.test(desc)) {
          effects.push({ type: 'dot', target, dot: 'poison', scale: 0.10, turns: 3, chance: 100 });
        }
        if (stunChance) {
          effects.push({ type: 'cc', target, cc: 'stun', turns: stunTurns, chance: stunChance });
        }
        if (silenceTurns) {
          const m = desc.match(/(\d+)\s*%[^。\n]*沉默/);
          const chance = m ? parseInt(m[1], 10) : 100;
          effects.push({ type: 'cc', target, cc: 'silence', turns: silenceTurns, chance });
        }
        if (spdDownPct !== null) {
          effects.push({ type: 'debuff', target, stat: 'spdDown', value: spdDownPct, turns });
        }
        if (spdDownFlat !== null) {
          effects.push({ type: 'debuff', target, stat: 'spdFlatDown', value: spdDownFlat, turns });
        }
        if (atkDownPct !== null) {
          effects.push({ type: 'debuff', target, stat: 'atkUp', value: -atkDownPct, turns });
        }
        const defDownPct = (() => {
          const m = desc.match(/降低其(\d+)\s*%防御/);
          return m ? parseInt(m[1], 10) : null;
        })();
        if (defDownPct !== null) {
          effects.push({ type: 'debuff', target, stat: 'defDown', value: defDownPct, turns });
        }
        const dodgeDownPct = (() => {
          const m = desc.match(/降低其(\d+)\s*%闪避/);
          return m ? parseInt(m[1], 10) : null;
        })();
        if (dodgeDownPct !== null) {
          effects.push({ type: 'debuff', target, stat: 'dodgeUp', value: -dodgeDownPct, turns });
        }
        const healDownPct = (() => {
          const m = desc.match(/治疗效果降低(\d+)\s*%/);
          return m ? parseInt(m[1], 10) : null;
        })();
        if (healDownPct !== null) {
          effects.push({ type: 'debuff', target, stat: 'healDownDebuff', value: healDownPct, turns });
        }
        const selfDodgeUp = (() => {
          const m = desc.match(/增加自身(\d+)\s*%闪避/);
          return m ? parseInt(m[1], 10) : null;
        })();
        if (selfDodgeUp !== null) {
          effects.push({ type: 'buff', target: 'ally', stat: 'dodgeUp', value: selfDodgeUp, turns });
        }
        if (energySteal !== null) {
          effects.push({ type: 'energySteal', target, amount: Math.max(1, Math.floor(energySteal / 10) || 1) });
        }
        if (executePct !== null) {
          effects.push({ type: 'execute', target, threshold: Math.min(25, Math.max(5, executePct)) / 100 });
        }
        if (/嘲讽/.test(desc)) {
          effects.push({ type: 'taunt', turns });
        }
        const dmgReduc = desc.match(/获得(\d+)\s*%减伤/);
        if (dmgReduc) {
          effects.push({ type: 'buff', target: 'ally', stat: 'dmgReducUp', value: parseInt(dmgReduc[1], 10), turns });
        }
        const shield = desc.match(/护盾[^0-9]*(\d+)\s*%攻击力/);
        if (shield) {
          effects.push({
            type: 'shield',
            target: targetAllAllies ? 'allAllies' : 'ally',
            scale: parseInt(shield[1], 10) / 100,
            turns
          });
        }
        const ccImmuneTurns = desc.match(/免疫控制(\d+)回合/);
        if (ccImmuneTurns) {
          effects.push({ type: 'buff', target: targetAllAllies ? 'allAllies' : 'ally', stat: 'ccImmune', value: 1, turns: parseInt(ccImmuneTurns[1], 10) });
        }
        if (/解除敌方全体免疫|清除敌方全体免疫|解除敌方免疫/.test(desc)) {
          effects.push({ type: 'dispel', target: 'allEnemies', statuses: ['immune'] });
        }
        return effects;
      }

      if (/嘲讽/.test(desc)) {
        effects.push({ type: 'taunt', turns });
      }
      const dmgReduc = desc.match(/获得(\d+)\s*%减伤/);
      if (dmgReduc) {
        effects.push({ type: 'buff', target: 'ally', stat: 'dmgReducUp', value: parseInt(dmgReduc[1], 10), turns });
      }
      const immuneTurns = desc.match(/进入(\d+)回合[^，。]*免疫/);
      if (immuneTurns) {
        effects.push({ type: 'buff', target: 'ally', stat: 'immune', value: 1, turns: parseInt(immuneTurns[1], 10) });
      }

      return effects;
    }

    function migrateCharactersToFragments() {
      const uniqueCharacters = [];
      const seenIds = new Set();
      
      gameData.characters.forEach(char => {
        if (seenIds.has(char.id)) {
          // 重复角色，转化为碎片
          // ⚠️ P5 搬入时把 `yield` 改名为 `fragYield`：`yield` 是严格模式保留字，
          //    原内联是 sloppy mode 才能跑。纯局部变量改名，语义不变。
          const fragYield = GAME_CONFIG.fragmentYield[char.rarity] || 5;
          gameData.fragments[char.id] = (gameData.fragments[char.id] || 0) + fragYield;
        } else {
          uniqueCharacters.push(char);
          seenIds.add(char.id);
        }
      });
      
      gameData.characters = uniqueCharacters;
      saveGameProgress();
    }

  // ── 对外暴露（内联 / 其它模块 / HTML onclick 都靠裸标识符或 window 取用）──
  window.normalizeCharacterSkills = normalizeCharacterSkills;
  window.inferSkillEffects = inferSkillEffects;
  window.migrateCharactersToFragments = migrateCharactersToFragments;

  const api = { normalizeCharacterSkills, inferSkillEffects, migrateCharactersToFragments };
  const segs = 'Game.data.characters'.split('.');
  let host = window;
  for (const s of segs) { host[s] = host[s] || {}; host = host[s]; }
  Object.assign(host, api);
  window.__charactersData = api;
})();
