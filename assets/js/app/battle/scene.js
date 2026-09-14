/**
 * 战斗场景（可视化战斗）—— 战斗层的唯一引擎实现。
 *
 * 历史：本文件原本只是 4 个函数的再导出壳，实现在 index.html 内联脚本里；
 * A1 先把「入口统一 / BOSS 机制」收敛到这里，P2（2026-09-12）把整套战斗场景
 * 引擎（原 index.html 内联 3019–4755 行，共 49 个函数）整体搬进来。
 *
 * 与 index.html 的边界（务必看清，否则会改错地方）：
 *   · 战斗**状态**（battleSceneDebugState / …CoreState / …CatLinkState /
 *     …RainFlowerBondState）的声明也已在本文件顶部（P2b，2026-09-12 完成）；
 *     index.html 不再声明任何战斗状态，只通过裸标识符 / getState() 读取。
 *   · `battleSceneDebugGetLoadoutPassiveText` 是内联转发壳（单一实现 getLoadoutPassiveText）。
 *
 * ⚠️ 加载顺序：本文件在 index.html 的 <script> 中排在**内联主脚本之前**。
 *    本文件依赖的若干函数（getLoadoutPassiveText 等）仍由内联主脚本提供，
 *    它们只在**调用期**（页面加载完成后）被解析，故无 TDZ 风险；
 *    但本文件顶层（模块初始化阶段）不得调用这些外部函数。
 *
 * ⚠️ 所有抽离出来的函数都会显式挂到 window（见文件末尾），因为：
 *    ① index.html 内联代码用裸标识符调用它们；② HTML 的 onclick="…" 只认 window。
 */
(() => {
  /* ── 战斗状态（P2b：2026-09-12 由 index.html 顶层搬入，此处为唯一声明处） ──
   * 这 4 个 `let` 原先声明在 index.html 顶层。classic script 的顶层 `let` 落在**全局词法
   * 环境**（跨脚本共享），而本文件加载早于内联主脚本 —— 于是当年只要在顶层读它们就会命中
   * TDZ，只能在函数体内使用。搬进本 IIFE 后该限制消失，生命周期完全由本模块掌管。
   *
   * 对外兼容：本文件末尾把这 4 个绑定以 window 访问器（get/set）重新暴露，
   * 因为 tools/*.mjs 与日常 CDP 调试都用**裸标识符**读 `battleSceneDebugState`。
   * 全局对象的访问器属性会被标识符查找命中，故 read/write 手感与当年完全一致。
   */
  let battleSceneDebugState = null;
  let battleSceneDebugCoreState = { active: false, ownerId: 'char_sur_007', spent: 0, threshold: 0, triggers: 0, enhancedPct: 0.2, thresholdPct: 0.7, energyPerTurn: 3, fieldTurns: 2 };
  let battleSceneDebugCatLinkState = { active: false, catId: 'char_sur_010', roundFollowUpUsed: false };
  let battleSceneDebugRainFlowerBondState = 'none';
/** C6：本场战斗生效的羁绊汇总（进战斗时算一次，逐单位套用；不进 calculateTotalStats） */
let battleSceneDebugBondTotal = null;
/** C6：本场生效的羁绊清单（用于开场播报） */
let battleSceneDebugBondActive = [];

  /* ── E2 布阵（2026-09-15）：阵型规则唯一读取点 ──────────────────────────
   * 真相源 = assets/data/config.json 的 battleScene.formation；json 缺字段时
   * 用下面同值兜底（行为永远一致）。改数值只改 json，不要改代码。
   *   · 槽位语义：gameData.formation 前 3 槽 = 前排，后 3 槽 = 后排
   *   · frontTakenPct：前排承伤加成（%）—— 站前排要挨打，所以给后排输出补偿
   *   · backDmgPct  ：后排输出加成（%）
   *   · assassinDiveBack：刺客普攻可越前排直切后排
   */
  const FORMATION_FALLBACK = { frontTakenPct: 18, backDmgPct: 12, assassinDiveBack: true };
  function battleSceneDebugFormationCfg() {
    const bs = (typeof BATTLE_SCENE_CONFIG !== 'undefined' && BATTLE_SCENE_CONFIG) ? BATTLE_SCENE_CONFIG : {};
    const f = (bs && bs.formation) || {};
    return {
      frontTakenPct: Number.isFinite(f.frontTakenPct) ? f.frontTakenPct : FORMATION_FALLBACK.frontTakenPct,
      backDmgPct: Number.isFinite(f.backDmgPct) ? f.backDmgPct : FORMATION_FALLBACK.backDmgPct,
      assassinDiveBack: (f.assassinDiveBack === undefined) ? FORMATION_FALLBACK.assassinDiveBack : !!f.assassinDiveBack
    };
  }

  /** 槽位 → 站位（前 3 槽前排 / 后 3 槽后排） */
  function battleSceneDebugSlotPosition(slotIndex) {
    return (Number(slotIndex) || 0) < 3 ? 'front' : 'back';
  }

  /** 站位修正：目标在前排承伤 ↑，攻击者在后排输出 ↑（只在不为 0 时参与，老数据零影响） */
  function battleSceneDebugPositionDmg(dmg, attacker, target) {
    let v = dmg;
    if (!Number.isFinite(v) || v <= 0) return v;
    const cfg = battleSceneDebugFormationCfg();
    if (target && (target.position || 'front') === 'front' && cfg.frontTakenPct > 0) {
      v = Math.max(1, Math.floor(v * (1 + cfg.frontTakenPct / 100)));
    }
    if (attacker && (attacker.position || 'front') !== 'front' && cfg.backDmgPct > 0) {
      v = Math.max(1, Math.floor(v * (1 + cfg.backDmgPct / 100)));
    }
    return v;
  }

  /* ── E1 肉鸽远征：祝福 hook（2026-09-15）────────────────────────────────
   * 本场战斗生效的祝福由 stage.expeditionBlessings 注入（domain/expedition.js 构造
   * 远征 stage 时写入完整祝福对象）。**非远征战斗该数组为空 ⇒ 下面所有 hook 直接
   * 短路返回，主线 / 塔 / 日常副本的行为逐字节不变**（数值快照不会因此漂移）。
   * 祝福定义见 assets/data/expedition.json，改数值只改 json。
   */
  let battleSceneDebugBlessings = [];

  function battleSceneDebugSetBlessings(list) {
    battleSceneDebugBlessings = Array.isArray(list) ? list.filter(Boolean) : [];
  }
  function battleSceneDebugBlessSum(type) {
    if (!battleSceneDebugBlessings.length) return 0;
    let s = 0;
    battleSceneDebugBlessings.forEach(b => { if (b && b.type === type) s += (Number(b.value) || 0); });
    return s;
  }
  /** 汇总 stat 型祝福的属性 mods（attacker/defender 共用的乘加区） */
  function battleSceneDebugBlessStatMods() {
    const acc = { atkMul: 1, hpMul: 1, defMul: 1, spdAdd: 0, critRateAdd: 0, critDmgAdd: 0, dmgReducAdd: 0, lifestealAdd: 0, penAdd: 0 };
    if (!battleSceneDebugBlessings.length) return acc;
    battleSceneDebugBlessings.forEach(b => {
      if (!b || b.type !== 'stat' || !b.mods) return;
      const m = b.mods;
      if (Number.isFinite(m.atkMul)) acc.atkMul *= m.atkMul;
      if (Number.isFinite(m.hpMul)) acc.hpMul *= m.hpMul;
      if (Number.isFinite(m.defMul)) acc.defMul *= m.defMul;
      if (Number.isFinite(m.spdAdd)) acc.spdAdd += m.spdAdd;
      if (Number.isFinite(m.critRateAdd)) acc.critRateAdd += m.critRateAdd;
      if (Number.isFinite(m.critDmgAdd)) acc.critDmgAdd += m.critDmgAdd;
      if (Number.isFinite(m.dmgReducAdd)) acc.dmgReducAdd += m.dmgReducAdd;
      if (Number.isFinite(m.lifestealAdd)) acc.lifestealAdd += m.lifestealAdd;
      if (Number.isFinite(m.penAdd)) acc.penAdd += m.penAdd;
    });
    return acc;
  }

  /** 我方单位构建完成后套用：属性 mods + 开局护盾 / 能量 / 复活（仅远征有祝福时生效） */
  function battleSceneDebugApplyBlessingStart(units, state) {
    if (!battleSceneDebugBlessings.length || !Array.isArray(units)) return;
    const mods = battleSceneDebugBlessStatMods();
    const shieldPct = battleSceneDebugBlessSum('startShieldPct');
    const startE = battleSceneDebugBlessSum('startEnergy');
    const revivePct = battleSceneDebugBlessSum('reviveOnce');
    units.forEach(u => {
      if (!u || u.isEnemy) return;
      if (mods.atkMul !== 1) u.attack = Math.floor((u.attack || 0) * mods.atkMul);
      if (mods.defMul !== 1) u.defense = Math.floor((u.defense || 0) * mods.defMul);
      if (mods.hpMul !== 1) {
        u.maxHp = Math.floor((u.maxHp || 1) * mods.hpMul);
        if (u.currentHp > 0) u.currentHp = Math.min(u.maxHp, Math.floor(u.currentHp * mods.hpMul));
      }
      if (mods.spdAdd) u.speed = (u.speed || 0) + mods.spdAdd;
      if (mods.critRateAdd) u.critRate = Math.max(0, (u.critRate || 0) + mods.critRateAdd);
      if (mods.critDmgAdd) u.critDmg = Math.max(150, (u.critDmg || 150) + mods.critDmgAdd);
      if (mods.dmgReducAdd) u.dmgReduc = Math.min(80, (u.dmgReduc || 0) + mods.dmgReducAdd);
      if (mods.lifestealAdd) u.lifesteal = (u.lifesteal || 0) + mods.lifestealAdd;
      if (mods.penAdd) u.penetration = (u.penetration || 0) + mods.penAdd;
      if (shieldPct > 0) {
        u.shield = (u.shield || 0) + Math.floor((u.maxHp || 0) * shieldPct / 100);
      }
      if (revivePct > 0) {
        // 复用引擎既有的 revive 状态（charges 机制），不新增死亡结算分支
        battleSceneDebugAddStatus(u, 'revive', 1, 999, { charges: 1, hpPct: Math.max(0.05, Math.min(1, revivePct / 100)) });
      }
    });
    if (startE > 0 && state) state.energy = (state.energy || 0) + startE;
  }

  /** 伤害乘区：狂热 / 背水 / 猎手 / 后排强袭（在站位乘区之后结算） */
  function battleSceneDebugBlessingDmg(dmg, attacker, target) {
    let v = dmg;
    if (!battleSceneDebugBlessings.length || !Number.isFinite(v) || v <= 0 || !attacker || attacker.isEnemy) return v;
    const flat = battleSceneDebugBlessSum('dmgUpPct');
    if (flat) v = v * (1 + flat / 100);
    const back = battleSceneDebugBlessSum('dmgUpBack');
    if (back && (attacker.position || 'front') !== 'front') v = v * (1 + back / 100);
    const low = battleSceneDebugBlessings.find(b => b && b.type === 'dmgUpLowHp');
    if (low && attacker.maxHp > 0 && (attacker.currentHp / attacker.maxHp) * 100 < (Number(low.hpPct) || 40)) {
      v = v * (1 + (Number(low.value) || 0) / 100);
    }
    const vsE = battleSceneDebugBlessings.find(b => b && b.type === 'dmgUpVsElite');
    if (vsE && target && (target.isBoss || target.isElite)) v = v * (1 + (Number(vsE.value) || 0) / 100);
    return Math.max(1, Math.floor(v));
  }

  /** 前排坚守：前排免伤（与 dmgReduc 同口径，上限 80） */
  function battleSceneDebugBlessingReduc(target) {
    if (!battleSceneDebugBlessings.length || !target || target.isEnemy) return 0;
    if ((target.position || 'front') !== 'front') return 0;
    return Math.min(80, battleSceneDebugBlessSum('drFront'));
  }

  /* ── E3 周期挑战：首领机制 hook（2026-09-15）────────────────────────────
   * 与祝福同构：由 stage.challengeMechanics = { id, params, runtime } 注入
   * （domain/challenge.js 构造挑战 stage 时写入）。**非挑战战斗为 null ⇒ 所有
   * hook 短路返回，主线 / 塔 / 日常 / 远征行为逐字节不变。**
   * 机制定义见 assets/data/challenge.json，改数值只改 json。
   */
  let battleSceneDebugMechanic = null;

  function battleSceneDebugSetMechanic(m) {
    battleSceneDebugMechanic = (m && m.id) ? m : null;
  }
  function mechP(key, dflt) {
    const p = battleSceneDebugMechanic && battleSceneDebugMechanic.params;
    const v = p ? Number(p[key]) : NaN;
    return Number.isFinite(v) ? v : dflt;
  }
  function mechRt() {
    if (!battleSceneDebugMechanic) return null;
    if (!battleSceneDebugMechanic.runtime) battleSceneDebugMechanic.runtime = {};
    return battleSceneDebugMechanic.runtime;
  }

  /** 开局：破盾首领上盾 */
  function battleSceneDebugMechanicStart(enemies, state) {
    if (!battleSceneDebugMechanic) return;
    const rt = mechRt();
    rt.shieldBroken = false;
    rt.brokenUntil = 0;
    rt.enraged = false;
    rt.adds = [];
    if (battleSceneDebugMechanic.id !== 'shield_break') return;
    const pct = mechP('shieldPct', 35);
    (enemies || []).forEach(e => {
      if (!e || !e.isBoss) return;
      e.shield = Math.floor((e.maxHp || 1) * pct / 100);
      e.shieldMax = e.shield;
    });
    if (state) pushBattleSceneDebugFeed(`机制·铁壁：首领获得 ${pct}% 最大生命的护盾`);
  }

  /** 回合开始：召唤 / 禁疗流失 / 限时狂暴 */
  function battleSceneDebugMechanicRound(state) {
    if (!battleSceneDebugMechanic || !state) return;
    const id = battleSceneDebugMechanic.id;
    const rt = mechRt();
    const round = state.round || 1;

    if (id === 'summon') {
      const every = Math.max(1, mechP('everyRounds', 3));
      if (round % every === 0) {
        const n = Math.max(1, mechP('count', 2));
        const boss = (state.enemies || []).find(e => e && e.isBoss && e.currentHp > 0);
        if (boss) {
          const ratio = mechP('addPowerRatio', 0.18);
          for (let i = 0; i < n; i++) {
            const add = {
              id: `ch_add_${round}_${i}`,
              name: `随从·${round}-${i + 1}`,
              displayName: `随从·${round}-${i + 1}`,
              isEnemy: true,
              isAdd: true,
              class: boss.class || 'warrior',
              position: 'front',
              level: boss.level || 1,
              stars: 1,
              maxHp: Math.max(1, Math.floor((boss.maxHp || 1) * ratio)),
              currentHp: Math.max(1, Math.floor((boss.maxHp || 1) * ratio)),
              attack: Math.floor((boss.attack || 1) * 0.35),
              defense: Math.floor((boss.defense || 1) * 0.5),
              speed: boss.speed || 100,
              critRate: 0, critDmg: 150, blockRate: 0, dmgReduc: 0,
              shield: 0, imageUrl: boss.imageUrl || '',
              skills: [], passiveText: '', passiveRuntime: null, statuses: []
            };
            state.enemies.push(add);
            rt.adds.push(add.id);
          }
          pushBattleSceneDebugFeed(`机制·群兽：首领召唤 ${n} 名随从`);
        }
      }
    }

    if (id === 'no_heal') {
      const pct = mechP('drainPctPerRound', 3);
      (state.player || []).forEach(u => {
        if (!u || u.currentHp <= 0) return;
        const loss = Math.max(1, Math.floor((u.maxHp || 1) * pct / 100));
        u.currentHp = Math.max(0, u.currentHp - loss);
      });
      pushBattleSceneDebugFeed(`机制·禁疗：我方流失 ${pct}% 最大生命`);
    }

    if (id === 'time_limit' && !rt.enraged) {
      const er = Math.max(1, mechP('enrageRound', 10));
      if (round >= er) {
        rt.enraged = true;
        const mult = mechP('enrageAtkMult', 3);
        (state.enemies || []).forEach(e => {
          if (e && e.currentHp > 0) e.attack = Math.floor((e.attack || 1) * mult);
        });
        pushBattleSceneDebugFeed(`机制·时限：首领狂暴（攻击 ×${mult}，但受到的伤害大幅提升）`);
      }
    }
  }

  /** 伤害乘区：破盾 / 元素弱点 / 随从减伤 / 狂暴易伤 / 背水递增 */
  function battleSceneDebugChallengeDmg(dmg, attacker, target) {
    if (!battleSceneDebugMechanic || !Number.isFinite(dmg) || dmg <= 0) return dmg;
    const id = battleSceneDebugMechanic.id;
    const rt = mechRt();
    let v = dmg;

    // 我方打敌方首领
    if (target && target.isEnemy && attacker && !attacker.isEnemy) {
      if (id === 'shield_break') {
        if (!rt.shieldBroken && (target.shield || 0) > 0) {
          v = v * (1 - Math.min(90, mechP('dmgReducWhileShield', 70)) / 100);
        } else if (rt.shieldBroken && (battleSceneDebugState.round || 1) <= rt.brokenUntil) {
          v = v * (1 + mechP('brokenVuln', 60) / 100);
        }
      }
      if (id === 'element_weak') {
        const weak = battleSceneDebugMechanic.params && battleSceneDebugMechanic.params.weakClass;
        if (weak && (attacker.class || '') !== weak) {
          v = v * (1 - Math.min(90, mechP('offClassDmgCut', 60)) / 100);
        }
      }
      if (id === 'summon') {
        const live = (battleSceneDebugState && battleSceneDebugState.enemies || [])
          .filter(e => e && e.currentHp > 0 && e.isAdd).length;
        if (live > 0) {
          const cut = Math.min(mechP('reducCap', 60), live * mechP('reducPerAdd', 15));
          v = v * (1 - cut / 100);
        }
      }
      if (id === 'time_limit' && rt.enraged) {
        v = v * (1 + mechP('enrageVuln', 100) / 100);
      }
    }

    // 背水：双方伤害随回合递增（我方受伤也递增 ⇒ 拖久了必死）
    if (id === 'backfire') {
      const r = Math.max(1, (battleSceneDebugState && battleSceneDebugState.round || 1) - 1);
      if (target && !target.isEnemy) v = v * (1 + r * mechP('bossDmgUpPerRound', 10) / 100);
      else if (target && target.isEnemy) v = v * (1 + r * mechP('weDmgUpPerRound', 8) / 100);
    }

    return Math.max(1, Math.floor(v));
  }

  /** 护盾被击破的检测（在扣盾之后调用） */
  function battleSceneDebugMechanicAfterDamage(target) {
    if (!battleSceneDebugMechanic || battleSceneDebugMechanic.id !== 'shield_break') return;
    const rt = mechRt();
    if (rt.shieldBroken || !target || !target.isBoss) return;
    if ((target.shield || 0) <= 0) {
      rt.shieldBroken = true;
      rt.brokenUntil = (battleSceneDebugState && battleSceneDebugState.round || 1) + Math.max(1, mechP('brokenTurns', 3));
      pushBattleSceneDebugFeed('机制·铁壁：护盾击碎！首领陷入虚弱');
    }
  }

  /** 治疗修正：禁疗 */
  function battleSceneDebugMechanicHealMul() {
    if (!battleSceneDebugMechanic || battleSceneDebugMechanic.id !== 'no_heal') return 1;
    return 1 - Math.min(100, mechP('healCut', 100)) / 100;
  }

  function battleSceneDebugStep() {
    if (!battleSceneDebugState) return;
    if (battleSceneDebugState.auto) {
      battleSceneDebugStepOnce();
      return;
    }
    let guard = 0;
    while (battleSceneDebugState && !battleSceneDebugState.awaitingTarget && guard < 200) {
      guard += 1;
      battleSceneDebugStepOnce();
      if (!battleSceneDebugState) return;
      if (battleSceneDebugState.awaitingTarget) return;
      if (aliveCount(battleSceneDebugState.player) === 0 || aliveCount(battleSceneDebugState.enemies) === 0) return;
    }
  }

  function resolveBattleSceneDebugPlayerAction(targetSide, targetIndex) {
    if (!battleSceneDebugState || !battleSceneDebugState.awaitingTarget) return;
    const pending = battleSceneDebugState.awaitingTarget;
    const actor = battleSceneDebugState.player[pending.actorIndex];
    const list = targetSide === 'player' ? battleSceneDebugState.player : battleSceneDebugState.enemies;
    const target = list[targetIndex];
    if (!actor || actor.currentHp <= 0 || !target || target.currentHp <= 0) {
      battleSceneDebugState.awaitingTarget = null;
      renderBattleSceneDebug();
      return;
    }
    if (pending.actionType === 'basic') {
      if (targetSide !== 'enemy') return;
      const frontAlive = (battleSceneDebugState.enemies || []).filter(u => u && u.currentHp > 0 && (u.position || 'front') === 'front');
      // E2：刺客可切入（越前排打后排），其余职业仍受前排阻挡
      const canDive = battleSceneDebugFormationCfg().assassinDiveBack && actor && actor.class === 'assassin';
      if (frontAlive.length > 0 && (target.position || 'front') !== 'front' && !canDive) {
        if (typeof pushBattleSceneDebugFeed === 'function') pushBattleSceneDebugFeed('普攻只能攻击敌方前排');
        renderBattleSceneDebug();
        return;
      }
      const mult =
        actor.class === 'assassin' ? 1.1 :
        actor.class === 'warrior' ? 1.0 :
        actor.class === 'archer' ? 1.0 :
        actor.class === 'mage' ? 1.0 :
        1.0;
      const basicR = battleSceneDebugApplyHit(actor, target, mult, '普攻', { ccOnce: { used: false } });
      // B8：暴击走更重的冲击反馈
      setBattleSceneDebugHitFx('enemy', targetIndex, basicR && basicR.crit);
    } else if (pending.actionType === 'skill' && typeof pending.skillIndex === 'number') {
      const ok = battleSceneDebugApplySkill(actor, 'player', pending.skillIndex, targetSide, targetIndex);
      if (ok) setBattleSceneDebugHitFx(targetSide, targetIndex);
    }
    battleSceneDebugTickAfterAction(actor);
    battleSceneDebugState.awaitingTarget = null;
    battleSceneDebugState.turnCursor += 1;
    renderBattleSceneDebug();
    if (aliveCount(battleSceneDebugState.player) === 0 || aliveCount(battleSceneDebugState.enemies) === 0) {
      battleSceneDebugFinish(aliveCount(battleSceneDebugState.player) > 0);
    }
    if (battleSceneDebugState && !battleSceneDebugState.auto && !battleSceneDebugState.awaitingTarget) {
      setTimeout(() => battleSceneDebugStep(), 0);
    }
  }

  function toggleBattleSceneDebugRun() {
    if (!battleSceneDebugState) return;
    battleSceneDebugState.running = !battleSceneDebugState.running;
    battleSceneDebugSyncControls();
    if (!battleSceneDebugState.running) return;
    runBattleSceneDebugLoop();
  }

  function runBattleSceneDebugLoop() {
    if (!battleSceneDebugState || !battleSceneDebugState.running) return;
    if (battleSceneDebugState.awaitingTarget) {
      battleSceneDebugState.running = false;
      battleSceneDebugSyncControls();
      return;
    }
    battleSceneDebugStep();
    const delay = Math.max(80, Math.floor(420 / (battleSceneDebugState.speed || 2)));
    setTimeout(() => runBattleSceneDebugLoop(), delay);
  }

  /**
   * ★ 统一战斗入口（A1 战斗层单源化）
   * 主线关卡与无尽塔**必须**都从这里进战斗。
   * 此前无尽塔的祝福路径直接调 `startBattle()`，走的是传统引擎（纯日志、无阵位），
   * 而主线挑战走的是可视化引擎 —— 同一关卡两种打法，是本项目"双引擎"最直接的
   * 玩家可感知后果。A1 旧引擎（simulateBattleLive）已退役，`startBattle` 现在是
   * 路由到可视化引擎的兼容壳；`replaceFormal` 不再影响战斗引擎选择。
   *
   * ⚠️ `BATTLE_SCENE_CONFIG` 是内联脚本顶层的 `const`，不会挂到 window，
   *    但作为**裸标识符**可以被其他 classic script 读到（顶层 const 属于全局词法环境）。
   */
  function enterBattle(stageId) {
    try {
      if (
        typeof openBattleSceneDebug === 'function' &&
        typeof BATTLE_SCENE_CONFIG !== 'undefined' &&
        BATTLE_SCENE_CONFIG && BATTLE_SCENE_CONFIG.replaceFormal
      ) {
        openBattleSceneDebug(stageId);
        return true;
      }
    } catch (_) {}
    if (typeof startBattle === 'function') {
      startBattle(stageId);
      return true;
    }
    return false;
  }


  // ─────────────────────────────────────────────────────────────────
  //  以下为 P2 抽离的战斗场景引擎实现
  //  （原 index.html 内联 3019–4755 行）
  // ─────────────────────────────────────────────────────────────────
function battleSceneDebugApplyShellUI() {
      const debugMenu = document.getElementById('debugMenu');
      if (debugMenu) {
        document.body.dataset.prevDebugMenuHidden = debugMenu.classList.contains('hidden') ? '1' : '0';
        debugMenu.classList.add('hidden');
      }
      const footer = document.querySelector('footer');
      if (footer) {
        document.body.dataset.prevFooterHidden = footer.classList.contains('hidden') ? '1' : '0';
        footer.classList.add('hidden');
      }
      const mobileNavFab = document.getElementById('mobileNavFab');
      if (mobileNavFab) {
        document.body.dataset.prevMobileNavFabHidden = mobileNavFab.classList.contains('hidden') ? '1' : '0';
        mobileNavFab.classList.add('hidden');
      }
      const mobileNavPanel = document.getElementById('mobileNavPanel');
      if (mobileNavPanel) {
        document.body.dataset.prevMobileNavPanelHidden = mobileNavPanel.classList.contains('hidden') ? '1' : '0';
        mobileNavPanel.classList.add('hidden');
      }
      const logger = document.getElementById('mobile-logger');
      if (logger) {
        document.body.dataset.prevMobileLoggerHidden = logger.classList.contains('hidden') ? '1' : '0';
        logger.classList.add('hidden');
      }
      document.body.dataset.prevHtmlOverflow = document.documentElement.style.overflow || '';
      document.body.dataset.prevBodyOverflow = document.body.style.overflow || '';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    }

    function battleSceneDebugRestoreShellUI() {
      const debugMenu = document.getElementById('debugMenu');
      if (debugMenu && document.body.dataset.prevDebugMenuHidden === '0') debugMenu.classList.remove('hidden');
      const footer = document.querySelector('footer');
      if (footer && document.body.dataset.prevFooterHidden === '0') footer.classList.remove('hidden');
      const mobileNavFab = document.getElementById('mobileNavFab');
      if (mobileNavFab && document.body.dataset.prevMobileNavFabHidden === '0') mobileNavFab.classList.remove('hidden');
      const mobileNavPanel = document.getElementById('mobileNavPanel');
      if (mobileNavPanel && document.body.dataset.prevMobileNavPanelHidden === '0') mobileNavPanel.classList.remove('hidden');
      const logger = document.getElementById('mobile-logger');
      if (logger && document.body.dataset.prevMobileLoggerHidden === '0') logger.classList.remove('hidden');
      document.documentElement.style.overflow = document.body.dataset.prevHtmlOverflow || '';
      document.body.style.overflow = document.body.dataset.prevBodyOverflow || '';
    }

    function openBattleSceneDebug(stageId) {
      const stage = stagesData.find(s => s && s.id === stageId);
      if (!stage) return;
      try {
        ensureFormation();
        const ids = gameData.formation.filter(Boolean);
        // C6：羁绊是"队伍层面"的加成 —— 进战斗时算一次，逐单位套用（不动 calculateTotalStats）
        const bondInfo = (window.__bonds && typeof window.__bonds.formationInfo === 'function')
          ? window.__bonds.formationInfo() : null;
        battleSceneDebugBondTotal = bondInfo ? bondInfo.total : null;
        battleSceneDebugBondActive = (bondInfo && bondInfo.active) ? bondInfo.active : [];
        // E1：本场生效的祝福（仅远征 stage 带 expeditionBlessings；其余战斗为空数组）
        battleSceneDebugSetBlessings(stage.expeditionBlessings);
        // E3：本场生效的周期挑战机制（仅挑战 stage 带 challengeMechanics；其余为 null）
        battleSceneDebugSetMechanic(stage.challengeMechanics || null);
        const picked = ids.map(id => gameData.characters.find(c => c.id === id)).filter(Boolean).slice(0, 6);
        const player = [];
        if (Array.isArray(stage.expeditionTeam) && stage.expeditionTeam.length) {
          // E1 远征：镜像队伍（属性与跨节点 HP 由 domain/expedition.js 构建）
          // 深拷贝 —— 战斗里的 HP 变化绝不能写回远征存档（回写由结算时显式 captureTeam）
          stage.expeditionTeam.slice(0, 6).forEach(u => { player.push(u ? JSON.parse(JSON.stringify(u)) : null); });
          while (player.length < 6) player.push(null);
        } else if (Array.isArray(stage.squadTeam_units) && stage.squadTeam_units.length) {
          // E4 多队远征：指定队伍（真实练度 + 跨层累计 HP 由 domain/squads.js 构建）
          stage.squadTeam_units.slice(0, 6).forEach(u => { player.push(u ? JSON.parse(JSON.stringify(u)) : null); });
          while (player.length < 6) player.push(null);
        } else {
        for (let i = 0; i < 6; i++) {
          const c = picked[i];
          if (!c) {
            player.push(null);
            continue;
          }
          const stats = battleSceneDebugApplyBonds(calculateTotalStats(c));
          const skills = Array.isArray(c.skills) ? JSON.parse(JSON.stringify(c.skills)) : [];
          const passiveText = battleSceneDebugGetLoadoutPassiveText(c);
          const passiveRuntime = battleSceneDebugParsePassiveText(passiveText);
          const isCore = !!c.isCore || (Array.isArray(c.tags) && c.tags.includes('core'));
          const atk = Math.floor((stats.attack || 0) * (1 + (passiveRuntime.atkPercent || 0) / 100));
          const def = Math.floor((stats.defense || 0) * (1 + (passiveRuntime.defPercent || 0) / 100));
          const hp = Math.floor((stats.health || 1) * (1 + (passiveRuntime.hpPercent || 0) / 100));
          const spd = Math.floor((stats.speed || 0) + (passiveRuntime.speed || 0));
          player.push({
            id: c.id,
            name: c.name,
            displayName: c.name,
            imageUrl: c.imageUrl,
            rarity: c.rarity,
            class: c.class,
            position: battleSceneDebugSlotPosition(i),
            isCore,
            maxHp: hp,
            currentHp: hp,
            attack: atk,
            defense: def,
            speed: spd,
            critRate: Math.floor((stats.critRate || 0) + (passiveRuntime.critRate || 0)),
            critDmg: Math.floor((stats.critDmg || 150) + (passiveRuntime.critDmg || 0)),
            dodgeRate: Math.floor(stats.dodgeRate || 0),
            blockRate: Math.floor(stats.blockRate || 0),
            lifesteal: Math.floor(stats.lifesteal || 0),
            penetration: Math.floor((stats.penetration || 0) + (passiveRuntime.penetration || 0)),
            effectHit: Math.floor((stats.effectHit || 0) + (passiveRuntime.effectHit || 0)),
            tenacity: Math.floor((stats.tenacity || 0) + (passiveRuntime.tenacity || 0)),
            dmgReduc: Math.floor((stats.dmgReduc || 0) + (passiveRuntime.dmgReduc || 0)),
            isEnemy: false,
            statuses: [],
            shield: 0,
            skills,
            passiveText,
            passiveRuntime
          });
        }
        }

        const enemies = [];
        const enemyList = Array.isArray(stage.enemies) ? stage.enemies : [];
        for (let i = 0; i < 6; i++) {
          const e = enemyList[i];
          if (!e) {
            enemies.push(null);
            continue;
          }
          const eId = e.id || `enemy_${i + 1}`;
          const eName = e.name || `敌人${i + 1}`;
          const eBoss = !!e.isBoss;
          enemies.push({
            id: eId,
            name: eName,
            displayName: eName,
            imageUrl: (window.__sprites && typeof window.__sprites.resolveSpriteUrlByName === 'function')
              ? (window.__sprites.resolveSpriteUrlByName(eName) || '')
              : '',
            class: e.class || 'warrior',
            maxHp: typeof e.health === 'number' ? e.health : 1000,
            health: typeof e.health === 'number' ? e.health : 1000,
            currentHp: typeof e.health === 'number' ? e.health : 1000,
            attack: typeof e.attack === 'number' ? e.attack : 100,
            defense: typeof e.defense === 'number' ? e.defense : 50,
            speed: typeof e.speed === 'number' ? e.speed : 90,
            critRate: typeof e.critRate === 'number' ? e.critRate : 5,
            critDmg: typeof e.critDmg === 'number' ? e.critDmg : 150,
            dodgeRate: typeof e.dodgeRate === 'number' ? e.dodgeRate : 2,
            blockRate: typeof e.blockRate === 'number' ? e.blockRate : 2,
            dmgReduc: typeof e.dmgReduc === 'number' ? e.dmgReduc : 0,
            lifesteal: typeof e.lifesteal === 'number' ? e.lifesteal : 0,
            effectHit: typeof e.effectHit === 'number' ? e.effectHit : 0,
            penetration: typeof e.penetration === 'number' ? e.penetration : 0,
            tenacity: typeof e.tenacity === 'number' ? e.tenacity : 0,
            enhancedHp: 0,
            enhancedHpMax: 0,
            // E2：敌人与玩家同构（前 3 前排 / 后 3 后排）—— 布阵才有意义
            position: e.position || battleSceneDebugSlotPosition(i),
            isCore: false,
            isEnemy: true,
            isBoss: eBoss,
            bossState: eBoss ? { triggers: {} } : null,
            bossMechanics: (eBoss && stage.modifiers && stage.modifiers.bossMechanics) ? stage.modifiers.bossMechanics : null,
            statuses: [],
            shield: 0,
            energy: 0,
            maxEnergy: 4,
            skills: [{ id: `${eId}_skill`, name: '敌方技能', cooldown: eBoss ? 3 : 4 }],
            skillCd: 0,
            passiveText: '',
            passiveRuntime: { reflectPct: 0, sharePct: 0, berserkPer10: 0 }
          });
        }

        const ensureUniqueNames = (left, right) => {
          const used = new Map();
          const apply = (unit, suffix) => {
            if (!unit) return;
            let base = String(unit.name || '单位');
            if (!used.has(base)) {
              used.set(base, 1);
              unit.displayName = base;
              return;
            }
            const n = used.get(base) + 1;
            used.set(base, n);
            unit.displayName = `${base}${suffix}${n}`;
          };
          left.forEach(u => apply(u, '·我'));
          right.forEach(u => apply(u, '·敌'));
        };

        ensureUniqueNames(player.filter(Boolean), enemies.filter(Boolean));

        battleSceneDebugState = {
          stageId,
          stageName: stage.name,
          round: 1,
          auto: false,
          manualUlt: false,  // C9 切片 3：自动模式下大招时机由玩家手动决策（true 时能量够会暂停等待指挥）
          speed: 2,
          energy: 2,
          player,
          enemies,
          feed: [],
          running: false,
          awaitingTarget: null,
          turnOrder: [],
          turnCursor: 0,
          maxDamage: 0,
          totalHealing: 0,
          // E3：周期挑战累计伤害（非挑战战斗也会累计，但没人读它 —— 零成本）
          totalDamage: 0
        };

        // E1：祝福开场效果（属性 mods / 开局护盾 / 开局能量 / 复活）—— 非远征时为空操作
        battleSceneDebugApplyBlessingStart(player, battleSceneDebugState);
        if (battleSceneDebugBlessings.length) {
          pushBattleSceneDebugFeed(`远征祝福生效：${battleSceneDebugBlessings.map(b => b.name).join(' · ')}`);
        }
        // E3：机制开场效果（破盾上盾）—— 非挑战时为空操作
        battleSceneDebugMechanicStart(enemies, battleSceneDebugState);

        battleSceneDebugApplyShellUI();

        const bg = document.getElementById('battleSceneDebugBg');
        if (bg) {
          bg.style.backgroundImage = BATTLE_SCENE_CONFIG.backgroundImageUrl ? `url('${BATTLE_SCENE_CONFIG.backgroundImageUrl}')` : '';
        }

        document.getElementById('battleSceneDebugStageName').textContent = stage.name;
        document.getElementById('battleSceneDebug').classList.remove('hidden');
        renderBattleSceneDebug();
        pushBattleSceneDebugFeed(`进入战斗场景调试：${stage.name}`);
        // C6：开场播报生效羁绊（加成上面已逐单位套好）
        if (battleSceneDebugBondActive.length) {
          const names = battleSceneDebugBondActive.map(b => `${b.name}·${b.need}`).join(' + ');
          pushBattleSceneDebugFeed(`羁绊生效：${names}`);
        }
        battleSceneDebugSyncControls();
        battleSceneDebugInitRound(true);
        if (battleSceneDebugState && !battleSceneDebugState.auto) setTimeout(() => battleSceneDebugStep(), 0);

        const btn = document.getElementById('battleSceneDebugAutoBtn');
        if (btn) {
          btn.onclick = () => {
            if (!battleSceneDebugState) return;
            battleSceneDebugState.auto = !battleSceneDebugState.auto;
            pushBattleSceneDebugFeed(`切换模式：${battleSceneDebugState.auto ? '自动' : '手动'}`);
            if (battleSceneDebugState.auto) {
              battleSceneDebugState.awaitingTarget = null;
              battleSceneDebugState.running = true;
              battleSceneDebugSyncControls();
              renderBattleSceneDebug();
              runBattleSceneDebugLoop();
              return;
            }
            battleSceneDebugSyncControls();
          };
        }
        const sel = document.getElementById('battleSceneDebugSpeed');
        // C9 切片 3：大招手动开关（混合模式）
        const ultBtn = document.getElementById('battleSceneDebugUltBtn');
        if (ultBtn) {
          ultBtn.onclick = () => {
            if (!battleSceneDebugState) return;
            battleSceneDebugState.manualUlt = !battleSceneDebugState.manualUlt;
            pushBattleSceneDebugFeed(`大招时机：${battleSceneDebugState.manualUlt ? '手动（能量够时暂停等你指挥）' : '自动（AI 代放技能）'}`);
            battleSceneDebugSyncControls();
          };
        }
        if (sel) {
          sel.onchange = () => {
            if (!battleSceneDebugState) return;
            battleSceneDebugState.speed = parseInt(sel.value, 10) || 2;
            pushBattleSceneDebugFeed(`切换速度：x${battleSceneDebugState.speed}`);
            battleSceneDebugSyncControls();
          };
        }
        // B9：进战斗 → 切战斗 BGM
        if (window.Game && Game.audio) Game.audio.setBgm('battle');
      } catch (e) {
        console.error(e);
        try { document.getElementById('battleSceneDebug').classList.add('hidden'); } catch (_) {}
        battleSceneDebugState = null;
        battleSceneDebugRestoreShellUI();
        uiToast(`进入战斗场景失败：${e && e.message ? e.message : e}`, 'danger');
      }
    }

    function closeBattleSceneDebug() {
      // B9：战斗结束/退出 → 回主城 BGM
      if (window.Game && Game.audio) Game.audio.setBgm('city');
      const runBtn = document.getElementById('battleSceneDebugRunBtn');
      if (runBtn) runBtn.textContent = '开始';
      battleSceneDebugRestoreShellUI();
      document.getElementById('battleSceneDebug').classList.add('hidden');
      battleSceneDebugState = null;
    }

    function battleSceneDebugSyncControls() {
      const btn = document.getElementById('battleSceneDebugAutoBtn');
      const sel = document.getElementById('battleSceneDebugSpeed');
      const runBtn = document.getElementById('battleSceneDebugRunBtn');
      // C9 切片 3：大招手动开关（仅自动模式下有意义，手动模式隐藏）
      const ultBtn = document.getElementById('battleSceneDebugUltBtn');
      if (ultBtn && battleSceneDebugState) {
        // ⚠️ hidden 必须写进 className 模板：后面整体赋值 className 会抹掉 toggle 加的类
        ultBtn.className = `ui-btn ui-btn--sm ${battleSceneDebugState.manualUlt ? 'ui-btn--gold' : 'ui-btn--ghost'}${battleSceneDebugState.auto ? '' : ' hidden'}`;
        ultBtn.textContent = battleSceneDebugState.manualUlt ? '大招·手动' : '大招·自动';
      }
      if (btn && battleSceneDebugState) {
        btn.textContent = battleSceneDebugState.auto ? '自动' : '手动';
        btn.className = `px-3 py-1.5 rounded-lg border text-[10px] font-black ${battleSceneDebugState.auto ? 'bg-green-900 border-green-700 text-green-200' : 'bg-gray-900 border-gray-700 text-white'}`;
      }
      if (sel && battleSceneDebugState) sel.value = String(battleSceneDebugState.speed || 2);
      if (runBtn && battleSceneDebugState) {
        runBtn.textContent = battleSceneDebugState.running ? '暂停' : '开始';
        runBtn.className = `px-3 py-2 rounded-lg border text-xs font-black ${battleSceneDebugState.running ? 'bg-red-900 border-red-700 text-red-200' : 'bg-gray-900 border-gray-700 text-white'}`;
      }
    }

    function pushBattleSceneDebugFeed(text) {
      if (!battleSceneDebugState) return;
      const line = `[${String(new Date().toLocaleTimeString())}] ${text}`;
      battleSceneDebugState.feed.push(line);
      const feed = document.getElementById('battleSceneDebugFeed');
      if (feed) {
        feed.innerHTML = battleSceneDebugState.feed.slice(-60).map((t) => {
          const tone = feedTone(t);
          return `<div class="ui-feed__line"${tone ? ` data-tone="${tone}"` : ''}>${escapeHtml(t)}</div>`;
        }).join('');
        feed.scrollTop = feed.scrollHeight;
      }
    }

    // 战斗日志分级（B7）：按关键词判语气色 —— 不动各调用点，渲染时统一着色
    function feedTone(t) {
      const s = String(t);
      if (/治疗|回复|恢复|吸血/.test(s)) return 'heal';
      if (/羁绊|共鸣|获得|提升|增加|附加|护盾|狂暴|免疫|反弹/.test(s)) return 'buff';
      if (/倒下|失败|判定|回合上限/.test(s)) return 'system';
      if (/造成|伤害|追击|反噬|牺牲/.test(s)) return 'damage';
      return '';
    }

    /* ── 战斗反馈层（B7）─────────────────────────────────────────
       飘字/技能特写挂在 #battleFloatLayer / #battleCastLayer（index.html 内），
       不随 renderBattleSceneDebug 的 innerHTML 重建被抹掉。纯视觉，不进数值快照。 */

    // 取单位卡相对战斗场景容器的中心坐标（用于定位飘字）
    function unitAnchor(target) {
      if (!battleSceneDebugState || !target) return null;
      const host = document.getElementById('battleSceneDebug');
      const side = target.isEnemy ? 'enemy' : 'player';
      const list = target.isEnemy ? battleSceneDebugState.enemies : battleSceneDebugState.player;
      const idx = list.indexOf(target);
      if (!host || idx < 0) return null;
      const grid = document.getElementById(side === 'enemy' ? 'battleSceneDebugEnemyGrid' : 'battleSceneDebugPlayerGrid');
      const card = grid && grid.children[idx] ? grid.children[idx].firstElementChild : null;
      if (!card || !card.getBoundingClientRect) return null;
      const cr = card.getBoundingClientRect();
      const hr = host.getBoundingClientRect();
      if (!cr.height) return null;
      return { x: cr.left - hr.left + cr.width / 2, y: cr.top - hr.top + cr.height * 0.34 };
    }

    // 飘字：tone = damage|crit|heal|shield|dodge|immune
    function battleSceneDebugFloat(target, text, tone) {
      const layer = document.getElementById('battleFloatLayer');
      if (!layer || !text) return;
      const at = unitAnchor(target);
      if (!at) return;
      const el = document.createElement('div');
      el.className = 'ui-float' + (tone ? ` ui-float--${tone}` : '');
      el.textContent = String(text);
      el.style.left = `${at.x}px`;
      el.style.top = `${at.y}px`;
      layer.appendChild(el);
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1000);
    }

    // 技能特写：立绘 + 「技能名 · 角色名」横滑过场
    function battleSceneDebugCast(actor, skill) {
      const layer = document.getElementById('battleCastLayer');
      if (!layer || !actor || !skill) return;
      layer.innerHTML = '';
      const name = skill && skill.name ? String(skill.name) : '';
      const who = actor.displayName || actor.name || '';
      const img = actor.imageUrl ? `<img class="ui-cast__img" src="${actor.imageUrl}" alt="">` : '';
      const el = document.createElement('div');
      el.className = 'ui-cast';
      el.innerHTML = `${img}<div class="ui-cast__text">` +
        `<span class="ui-cast__skill">${escapeHtml(name)}</span>` +
        `<span class="ui-cast__who">${escapeHtml(who)}</span>` +
        `</div><div class="ui-cast__sweep"></div>`;
      layer.appendChild(el);
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 900);
    }

    function renderBattleSceneDebug() {
      if (!battleSceneDebugState) return;
      const roundEl = document.getElementById('battleSceneDebugRound');
      const energyEl = document.getElementById('battleSceneDebugEnergy');
      if (roundEl) roundEl.textContent = String(battleSceneDebugState.round || 1);
      if (energyEl) energyEl.textContent = String(battleSceneDebugState.energy || 0);

      // B7：名字不再 JS 截断（原 6 字截断把「暴劲龙皇·…」全砍了），
      // 完整交给 .ui-bt__name 的两行 clamp 处理
      const shortName = (name) => String(name || '');
      const currentTurn = battleSceneDebugState.turnOrder && battleSceneDebugState.turnOrder[battleSceneDebugState.turnCursor];

      const renderGrid = (containerId, units, side) => {
        const root = document.getElementById(containerId);
        if (!root) return;
        root.innerHTML = '';
        for (let i = 0; i < 6; i++) {
          const unit = units[i];
          const cell = document.createElement('div');
          cell.className = 'w-full h-full min-w-0 min-h-0';
          if (!unit) {
            cell.innerHTML = `<div class="ui-bt" style="opacity:.35"></div>`;
            root.appendChild(cell);
            continue;
          }
          const name = unit.displayName || unit.name || '单位';
          const label = shortName(name);
          const img = unit.imageUrl
            ? `<img src="${unit.imageUrl}" class="ui-bt__img" alt="">`
            : `<div class="ui-bt__ph">${escapeHtml(label.slice(0, 1))}</div>`;
          const dead = unit.currentHp <= 0;
          const hpPct = unit.maxHp > 0 ? Math.max(0, Math.min(100, Math.floor(unit.currentHp / unit.maxHp * 100))) : 0;
          // 血条分色：>50 绿 / 20-50 黄 / <20 红（.ui-bt__hp[data-hp]）
          const hpTone = dead ? 'low' : (hpPct > 50 ? 'ok' : (hpPct > 20 ? 'mid' : 'low'));
          const hpText = dead ? '—' : `${Math.max(0, Math.floor(unit.currentHp))}/${Math.floor(unit.maxHp)}`;
          const isActor = currentTurn && currentTurn.side === side && currentTurn.index === i;
          const selecting = !!battleSceneDebugState.awaitingTarget;
          const pickSide = selecting ? battleSceneDebugState.awaitingTarget.pickSide : null;
          const targetable = selecting && pickSide === side && !dead;
          const dim = selecting && side !== pickSide && !isActor ? ' ui-bt--dim' : '';
          const fx = battleSceneDebugState.hitFx && battleSceneDebugState.hitFx.side === side && battleSceneDebugState.hitFx.index === i && battleSceneDebugState.hitFx.until > Date.now();
          // B8：暴击 → --crit（重击抖动 + 立绘提亮）；普通命中 → --strike（顿挫）；叠在闪白之上
          const fxCls = fx ? (battleSceneDebugState.hitFx.crit ? ' ui-bt--crit' : ' ui-bt--strike') : '';
          const fxOverlay = fx ? `<div class="ui-bt--hit" style="position:absolute;inset:0;pointer-events:none;background:rgba(255,255,255,0.14)"></div>` : '';
          const actorMark = (isActor && !selecting) ? `<div class="ui-bt__mark">▶</div>` : '';
          const deadMark = dead ? `<div class="ui-bt__deadmark">已倒下</div>` : '';
          cell.innerHTML = `
            <div class="ui-bt${isActor && !selecting ? ' ui-bt--actor' : ''}${targetable ? ' ui-bt--target' : ''}${dim}${fxCls}${dead ? ' ui-bt--dead' : ''}">
              ${fxOverlay}
              ${actorMark}
              ${img}
              <div class="ui-bt__info">
                <div class="ui-bt__name">${escapeHtml(label)}</div>
                <div class="ui-bt__hp" data-hp="${hpTone}">
                  <div class="ui-bt__hpfill" style="width:${hpPct}%"></div>
                  <div class="ui-bt__hpnum">${hpText}</div>
                </div>
              </div>
              ${deadMark}
            </div>
          `;
          cell.classList.add('cursor-pointer');
          cell.onclick = () => onBattleSceneDebugUnitClick(side, i);
          root.appendChild(cell);
        }
      };

      renderGrid('battleSceneDebugPlayerGrid', battleSceneDebugState.player, 'player');
      renderGrid('battleSceneDebugEnemyGrid', battleSceneDebugState.enemies, 'enemy');

      const actionBar = document.getElementById('battleSceneDebugActionBar');
      if (actionBar) actionBar.classList.toggle('hidden', !battleSceneDebugState.awaitingTarget);
      if (battleSceneDebugState.awaitingTarget) {
        const actor = battleSceneDebugState.player[battleSceneDebugState.awaitingTarget.actorIndex];
        const hint = document.getElementById('battleSceneDebugActionHint');
        const buttons = document.getElementById('battleSceneDebugActionButtons');
        const cancelBtn = document.getElementById('battleSceneDebugActionCancel');
        const energy = battleSceneDebugState.energy || 0;
        const silenced = !!(actor && battleSceneDebugGetStatus(actor, 'silence'));
        if (hint) {
          if (battleSceneDebugState.awaitingTarget.ultPause) {
            hint.textContent = actor ? `⚡ ${actor.displayName || actor.name} 能量充足：选技能直接放，或交给 AI 普攻` : '请选择目标';
          } else {
            const pickText = battleSceneDebugState.awaitingTarget.pickSide === 'player' ? '点选我方目标' : '点选敌方目标';
            hint.textContent = actor ? `操作：${actor.displayName || actor.name}，选择行动并${pickText}` : '请选择目标';
          }
        }
        if (buttons) {
          buttons.innerHTML = '';
          const addBtn = (text, selected, disabled, onClick) => {
            const b = document.createElement('button');
            b.textContent = text;
            b.disabled = !!disabled;
            // B7：技能按钮迁组件库（.ui-btn--sm），选中态用金色，禁用交给 .ui-btn 原生 disabled 样式
            b.className = `ui-btn ui-btn--sm flex-shrink-0 ${selected ? 'ui-btn--gold' : 'ui-btn--ghost'}`;
            b.onclick = onClick;
            buttons.appendChild(b);
          };
          addBtn('普攻', battleSceneDebugState.awaitingTarget.actionType === 'basic', false, () => {
            if (!battleSceneDebugState || !battleSceneDebugState.awaitingTarget) return;
            battleSceneDebugState.awaitingTarget.actionType = 'basic';
            battleSceneDebugState.awaitingTarget.skillIndex = null;
            battleSceneDebugState.awaitingTarget.pickSide = 'enemy';
            renderBattleSceneDebug();
          });
          // C9 切片 3：混合模式唤醒（能量够放技能）时提供"AI 代打"——本次行动交给自动决策
          if (battleSceneDebugState.awaitingTarget.ultPause) {
            addBtn('AI 代打', false, false, () => {
              if (!battleSceneDebugState || !battleSceneDebugState.awaitingTarget) return;
              battleSceneDebugState.awaitingTarget = null;
              battleSceneDebugAutoAct(actor);
            });
          }
          const skills = actor && Array.isArray(actor.skills) ? actor.skills : [];
          skills.slice(0, 4).forEach((s, idx) => {
            const cost = battleSceneDebugGetSkillCost(s);
            const spec = battleSceneDebugGetSkillTargetSpec(s);
            const disabled = silenced || energy < cost;
            const selected = battleSceneDebugState.awaitingTarget.actionType === 'skill' && battleSceneDebugState.awaitingTarget.skillIndex === idx;
            const label = `${s && s.name ? s.name : `技能${idx + 1}`}${cost > 0 ? `（-${cost}）` : ''}`;
            addBtn(label, selected, disabled, () => {
              if (!battleSceneDebugState || !battleSceneDebugState.awaitingTarget) return;
              if ((battleSceneDebugState.energy || 0) < cost) return;
              if (silenced) return;
              if (spec.kind === 'auto') {
                const ok = battleSceneDebugApplySkill(actor, 'player', idx, 'enemy', 0);
                if (ok) {
                  battleSceneDebugState.awaitingTarget = null;
                  battleSceneDebugTickAfterAction(actor);
                  battleSceneDebugState.turnCursor += 1;
                  renderBattleSceneDebug();
                  if (aliveCount(battleSceneDebugState.player) === 0 || aliveCount(battleSceneDebugState.enemies) === 0) {
                    battleSceneDebugFinish(aliveCount(battleSceneDebugState.player) > 0);
                  }
                }
                return;
              }
              battleSceneDebugState.awaitingTarget.actionType = 'skill';
              battleSceneDebugState.awaitingTarget.skillIndex = idx;
              battleSceneDebugState.awaitingTarget.pickSide = spec.kind === 'allyPick' ? 'player' : 'enemy';
              renderBattleSceneDebug();
            });
          });
        }
        if (cancelBtn) {
          cancelBtn.onclick = () => {
            if (!battleSceneDebugState) return;
            battleSceneDebugState.awaitingTarget = null;
            renderBattleSceneDebug();
          };
        }
      }
    }

    function aliveCount(list) {
      return list.filter(u => u && u.currentHp > 0).length;
    }

    function battleSceneDebugInitRound(isFirst) {
      if (!battleSceneDebugState) return;
      const dead = battleSceneDebugState.player.filter(u => u && !(u.currentHp > 0)).length;
      const cores = battleSceneDebugState.player.filter(u => u && u.currentHp > 0 && u.isCore);
      const coreAlive = cores.length;
      const coreGain = cores.reduce((sum, u) => sum + (u.id === 'char_sur_007' ? 6 : 4), 0);
      const gain = Math.max(0, 2 + coreGain);
      if (!isFirst) battleSceneDebugState.round += 1;
      // E3：周期挑战可带自定义回合上限（时限/背水等机制更短）；其余战斗仍为 30
      const roundLimit = (battleSceneDebugMechanic && Number(battleSceneDebugMechanic.roundLimit) > 0)
        ? Number(battleSceneDebugMechanic.roundLimit) : 30;
      if (!isFirst && (battleSceneDebugState.round || 1) > roundLimit) {
        pushBattleSceneDebugFeed(`回合上限：超过 ${roundLimit} 回合仍未结束，判定失败`);
        battleSceneDebugFinish(false);
        return;
      }
      battleSceneDebugState.energy = isFirst ? gain : ((battleSceneDebugState.energy || 0) + gain);
      // E1 祝福：能量涌流（每回合额外回能）—— 非远征时为 0
      const turnE = battleSceneDebugBlessSum('energyPerTurnAdd');
      if (turnE > 0) battleSceneDebugState.energy = (battleSceneDebugState.energy || 0) + turnE;
      battleSceneDebugState.turnOrder = buildBattleSceneDebugTurnOrder();
      battleSceneDebugState.turnCursor = 0;
      battleSceneDebugState.awaitingTarget = null;
      if (isFirst) pushBattleSceneDebugFeed(`回合开始：第 ${battleSceneDebugState.round} 回合，初始能量 ${gain}（基础2 + 核心能量${coreGain}）`);
      else pushBattleSceneDebugFeed(`回合开始：第 ${battleSceneDebugState.round} 回合，核心${coreAlive}人，死亡${dead}人，获得能量 +${gain}`);
      battleSceneDebugApplyRoundStartPassives();
      // ★ A1 单源化：BOSS 机制（狂暴 / 脚本 / 阶段 / 召唤）统一走 battle/boss_mechanics.js
      battleSceneDebugRunBossRound();
      // E3：周期挑战机制（召唤随从 / 禁疗流失 / 限时狂暴）—— 非挑战时为空操作
      battleSceneDebugMechanicRound(battleSceneDebugState);
      // 召唤援军会改变战场人数 → 重算行动顺序
      battleSceneDebugState.turnOrder = buildBattleSceneDebugTurnOrder();
      battleSceneDebugState.turnCursor = 0;
      if (aliveCount(battleSceneDebugState.player) === 0 || aliveCount(battleSceneDebugState.enemies) === 0) {
        battleSceneDebugFinish(aliveCount(battleSceneDebugState.player) > 0);
        return;
      }
      renderBattleSceneDebug();
    }

    /**
     * BOSS 机制适配器（唯一真相源：assets/js/app/battle/boss_mechanics.js）
     * ⚠️ 正式引擎此前**完全没有**首领机制 —— 主线每 5 关一个 BOSS，
     *    其阶段推进 / 召唤援军 / 11 个 scriptId 脚本在正式战斗中全部静默失效。
     */
    function battleSceneDebugRunBossRound() {
      if (!battleSceneDebugState) return;
      const mod = window.__bossMechanics;
      if (!mod || typeof mod.runRound !== 'function') return;
      const stage = battleSceneDebugGetStage();
      mod.runRound({
        round: battleSceneDebugState.round,
        team: battleSceneDebugState.player,
        enemies: battleSceneDebugState.enemies,
        enrageRound: (stage && stage.modifiers && stage.modifiers.enrageRound) ? stage.modifiers.enrageRound : 8,
        namePrefix: (stage && stage.chapter) ? String(stage.chapter).replace(/^.+：/, '') : '首领',
        api: {
          addStatus: battleSceneDebugAddStatus,
          getStatus: battleSceneDebugGetStatus,
          getStatusValue: battleSceneDebugGetStatusValue,
          applyHit: battleSceneDebugApplyHit,
          log: (html) => pushBattleSceneDebugFeed(String(html).replace(/<[^>]*>/g, '')),
          key: () => {},
          vfx: (type) => { if (window.__battleVfx && typeof window.__battleVfx.play === 'function') window.__battleVfx.play(type); },
          affixValue: battleSceneDebugAffixValue
        }
      });
    }

    function buildBattleSceneDebugTurnOrder() {
      if (!battleSceneDebugState) return [];
      const order = [];
      const effectiveSpeed = (u) => {
        const base = Math.max(1, (u.speed || 0) + battleSceneDebugGetStatusValue(u, 'spdFlatUp') - battleSceneDebugGetStatusValue(u, 'spdFlatDown'));
        const up = battleSceneDebugGetStatusValue(u, 'spdUp');
        const down = battleSceneDebugGetStatusValue(u, 'spdDown');
        return base * (1 + up / 100) * (1 - down / 100);
      };
      battleSceneDebugState.player.forEach((u, idx) => {
        if (!u || !(u.currentHp > 0)) return;
        order.push({ side: 'player', index: idx, speed: effectiveSpeed(u) });
      });
      battleSceneDebugState.enemies.forEach((u, idx) => {
        if (!u || !(u.currentHp > 0)) return;
        order.push({ side: 'enemy', index: idx, speed: effectiveSpeed(u) });
      });
      order.sort((a, b) => (b.speed || 0) - (a.speed || 0));
      return order;
    }

    function onBattleSceneDebugUnitClick(side, index) {
      if (!battleSceneDebugState) return;
      const list = side === 'enemy' ? battleSceneDebugState.enemies : battleSceneDebugState.player;
      const unit = list[index];
      if (!unit) return;

      if (battleSceneDebugState.awaitingTarget) {
        const pickSide = battleSceneDebugState.awaitingTarget.pickSide;
        if (pickSide === side) resolveBattleSceneDebugPlayerAction(side, index);
        return;
      }

      if (side === 'player') {
        if (unit.currentHp > 0) unit.currentHp = 0;
        else unit.currentHp = Math.max(1, unit.maxHp || 1);
        pushBattleSceneDebugFeed(`${unit.displayName || unit.name} 状态切换：${unit.currentHp > 0 ? '存活' : '阵亡'}`);
        renderBattleSceneDebug();
      }
    }

    function pickRandomAlive(list) {
      const alive = list.filter(u => u && u.currentHp > 0);
      if (alive.length === 0) return null;
      return alive[Math.floor(Math.random() * alive.length)];
    }

    function battleSceneDebugGetStatus(unit, type) {
      if (!unit || !unit.statuses) return null;
      return unit.statuses.find(s => s && s.type === type) || null;
    }

    function battleSceneDebugGetStatusValue(unit, type) {
      if (!unit || !unit.statuses) return 0;
      return unit.statuses
        .filter(s => s && s.type === type && (s.turns || 0) > 0)
        .reduce((sum, s) => sum + (typeof s.value === 'number' ? s.value : 0), 0);
    }

    function battleSceneDebugAddStatus(unit, type, value, turns) {
      if (!unit) return;
      if (!unit.statuses) unit.statuses = [];
      if ((type === 'stun' || type === 'silence' || type === 'charm') && unit.statuses.some(s => s && (s.type === 'ccImmune' || s.type === `${type}Immune`))) return;
      const existing = unit.statuses.find(s => s && s.type === type);
      if (existing) {
        if (typeof existing.value === 'number' && typeof value === 'number') existing.value = value >= 0 ? Math.max(existing.value, value) : Math.min(existing.value, value);
        else existing.value = value;
        existing.turns = Math.max(existing.turns || 0, turns || 0);
        if (arguments.length >= 5 && arguments[4] && typeof arguments[4] === 'object') existing.meta = { ...(existing.meta || {}), ...arguments[4] };
      } else {
        const meta = arguments.length >= 5 && arguments[4] && typeof arguments[4] === 'object' ? arguments[4] : undefined;
        unit.statuses.push(meta ? { type, value, turns: turns || 0, meta } : { type, value, turns: turns || 0 });
      }
    }

    function battleSceneDebugTickRound(list) {
      list.forEach(u => {
        if (!u) return;
        (u.statuses || []).forEach(s => {
          if (!s) return;
          if ((s.turns || 0) > 0) s.turns -= 1;
        });
        u.statuses = (u.statuses || []).filter(s => s && (s.turns || 0) > 0);
      });
    }

    function battleSceneDebugTickAfterAction(unit) {
      if (!unit) return;
      (unit.statuses || []).forEach(s => {
        if (!s) return;
        if ((s.turns || 0) > 0) s.turns -= 1;
      });
      unit.statuses = (unit.statuses || []).filter(s => s && (s.turns || 0) > 0);
    }

    function battleSceneDebugGetStage() {
      if (!battleSceneDebugState) return null;
      return stagesData.find(s => s && s.id === battleSceneDebugState.stageId) || null;
    }

    function battleSceneDebugAffixValue(id) {
      const stage = battleSceneDebugGetStage();
      if (!stage || !stage.modifiers || !Array.isArray(stage.modifiers.affixes)) return 0;
      const a = stage.modifiers.affixes.find(x => x && x.id === id);
      return a && typeof a.value === 'number' ? a.value : 0;
    }

    function battleSceneDebugApplyRoundStartPassives() {
      if (!battleSceneDebugState) return;
      battleSceneDebugCatLinkState.roundFollowUpUsed = false;
      if (battleSceneDebugState.round === 1) {
        battleSceneDebugState.player.forEach(u => u && u.currentHp > 0 && battleSceneDebugAddStatus(u, 'nonCritUndying', 1, 999));
        battleSceneDebugState.player.forEach(u => {
          if (!u || u.currentHp <= 0) return;
          const text = (u.passiveText || (u.passive && u.passive.text) || '');
          if (/(全体队友|所有队友)永久免疫控制/.test(text)) battleSceneDebugState.player.forEach(x => x && x.currentHp > 0 && battleSceneDebugAddStatus(x, 'ccImmune', 1, 999));
          if (/(全体队友|所有队友)永久免疫眩晕/.test(text)) battleSceneDebugState.player.forEach(x => x && x.currentHp > 0 && battleSceneDebugAddStatus(x, 'stunImmune', 1, 999));
          if (/(全体队友|所有队友)永久免疫沉默/.test(text)) battleSceneDebugState.player.forEach(x => x && x.currentHp > 0 && battleSceneDebugAddStatus(x, 'silenceImmune', 1, 999));
          if (/(全体队友|所有队友)永久免疫魅惑/.test(text)) battleSceneDebugState.player.forEach(x => x && x.currentHp > 0 && battleSceneDebugAddStatus(x, 'charmImmune', 1, 999));
          if (/永久免疫控制/.test(text)) battleSceneDebugAddStatus(u, 'ccImmune', 1, 999);
          if (/永久免疫眩晕/.test(text)) battleSceneDebugAddStatus(u, 'stunImmune', 1, 999);
          if (/永久免疫沉默/.test(text)) battleSceneDebugAddStatus(u, 'silenceImmune', 1, 999);
          if (/永久免疫魅惑/.test(text)) battleSceneDebugAddStatus(u, 'charmImmune', 1, 999);
        });
      }
      const all = [...battleSceneDebugState.player, ...battleSceneDebugState.enemies].filter(u => u && u.currentHp > 0);
      all.forEach(u => {
        const text = (u.passiveText || (u.passive && u.passive.text) || '');
        if (!text) return;
        if (battleSceneDebugState.round === 1) {
          const mRevive = text.match(/复活(\d+)次/);
          if (mRevive) {
            const charges = Math.max(0, parseInt(mRevive[1], 10));
            if (charges > 0) battleSceneDebugAddStatus(u, 'revive', 1, 999, { charges, hpPct: 0.3 });
          }
          if (/非暴击不死/.test(text)) {
            battleSceneDebugAddStatus(u, 'nonCritUndying', 1, 999, { charges: 1 });
          }
        }
        const mShield = text.match(/每回合开始时[^。]*生命上限(\d+)%的护盾/);
        if (mShield) {
          const pct = Math.max(1, Math.min(80, parseInt(mShield[1], 10)));
          const shield = Math.floor((u.maxHp || 0) * pct / 100);
          if (shield > 0) u.shield = (u.shield || 0) + shield;
        }
        const mHeal = text.match(/每回合回复自身(\d+)%最大生命值/);
        if (mHeal) {
          const pct = Math.max(1, Math.min(50, parseInt(mHeal[1], 10)));
          const heal = Math.floor((u.maxHp || 0) * pct / 100);
          battleSceneDebugApplyHeal(u, heal);
        }
      });

      if (battleSceneDebugState.round === 1) {
        battleSceneDebugInitCoreIfNeeded();
        battleSceneDebugInitCatLinkIfNeeded();

        const mech = battleSceneDebugState.player.find(u => u && u.currentHp > 0 && u.id === 'char_sur_007');
        if (mech) {
          battleSceneDebugState.enemies.forEach(e => {
            if (!e || e.currentHp <= 0) return;
            e.statuses = (e.statuses || []).filter(s => s && !['dmgUp', 'moranDmgUp', 'dmgReducUp', 'bondReducUp', 'moranReducUp'].includes(s.type));
          });
          battleSceneDebugState.player.forEach(u => {
            if (!u || u.currentHp <= 0) return;
            const shield = Math.floor((u.maxHp || 0) * 6.8 * 13);
            if (shield > 0) u.shield = (u.shield || 0) + shield;
            battleSceneDebugAddStatus(u, 'dmgUp', 20, 2);
          });
          pushBattleSceneDebugFeed('核心启动：特化强韧覆盖全队，敌方增伤/减伤被清除，我方两回合增伤+20%');
        }

        const urSpecial = battleSceneDebugState.player.find(u => u && u.currentHp > 0 && u.id === 'char_ur_010');
        if (urSpecial) {
          battleSceneDebugState.player.forEach(u => {
            if (!u || u.currentHp <= 0) return;
            const shield = Math.floor((u.maxHp || 0) * 7.0);
            if (shield > 0) u.shield = (u.shield || 0) + shield;
          });
          pushBattleSceneDebugFeed('核心启动：特化生命覆盖全队（700%）');
        }
      }
      battleSceneDebugUpdateRainFlowerBondState();
      battleSceneDebugGiveCoreEnergy();
    }

    function battleSceneDebugApplyRoundEndPassives() {
      if (!battleSceneDebugState) return;
      battleSceneDebugState.player.filter(u => u && u.currentHp > 0).forEach(u => {
        const text = (u.passiveText || (u.passive && u.passive.text) || '');
        if (!text) return;
        const m = text.match(/每回合结束时，增加全队(\d+)%速度（最高(\d+)%）/);
        if (m) {
          const inc = Math.max(1, Math.min(30, parseInt(m[1], 10)));
          const cap = Math.max(8, Math.min(80, parseInt(m[2], 10)));
          battleSceneDebugState.player.filter(x => x && x.currentHp > 0).forEach(t => {
            const cur = battleSceneDebugGetStatusValue(t, 'spdUp');
            const next = Math.min(cap, cur + inc);
            battleSceneDebugAddStatus(t, 'spdUp', next, 999);
          });
        }
      });
    }

    function battleSceneDebugGetTeamUnit(id) {
      if (!battleSceneDebugState) return null;
      return battleSceneDebugState.player.find(u => u && u.id === id) || null;
    }

    function battleSceneDebugInitCoreIfNeeded() {
      const owner = battleSceneDebugGetTeamUnit(battleSceneDebugCoreState.ownerId);
      if (!owner) return;
      const text = owner.passiveText || '';
      const mHp = text.match(/特化生命值[^，。；]*最大生命值(\d+)%/);
      battleSceneDebugCoreState.enhancedPct = mHp ? Math.max(0.05, Math.min(0.5, parseInt(mHp[1], 10) / 100)) : 0.2;
      const mEnergy = text.match(/每回合可获得(\d+)点能量/);
      battleSceneDebugCoreState.energyPerTurn = mEnergy ? Math.max(0, Math.min(12, parseInt(mEnergy[1], 10))) : 3;
      const mThreshold = text.match(/每累计消耗(\d+)%特化生命值/);
      battleSceneDebugCoreState.thresholdPct = mThreshold ? Math.max(0.2, Math.min(0.95, parseInt(mThreshold[1], 10) / 100)) : 0.7;
      const mField = text.match(/极限力场[^，。；]*持续(\d+)回合/);
      battleSceneDebugCoreState.fieldTurns = mField ? Math.max(1, Math.min(6, parseInt(mField[1], 10))) : 2;
      battleSceneDebugCoreState.active = true;
      battleSceneDebugCoreState.spent = 0;
      battleSceneDebugCoreState.triggers = 0;

      battleSceneDebugState.player.forEach(u => {
        if (!u) return;
        u.enhancedHpMax = Math.floor((u.maxHp || 0) * battleSceneDebugCoreState.enhancedPct);
        u.enhancedHp = u.enhancedHpMax;
      });
      battleSceneDebugCoreState.threshold = Math.max(1, Math.floor(battleSceneDebugState.player.reduce((sum, u) => sum + ((u && u.enhancedHpMax) || 0), 0) * battleSceneDebugCoreState.thresholdPct));
      pushBattleSceneDebugFeed(`核心启动：全队获得特化生命值，并每回合额外获得能量`);
    }

    function battleSceneDebugGiveCoreEnergy() {
      if (!battleSceneDebugCoreState.active || !battleSceneDebugState) return;
      battleSceneDebugState.energy = (battleSceneDebugState.energy || 0) + (battleSceneDebugCoreState.energyPerTurn || 0);
    }

    function battleSceneDebugTriggerLimitField() {
      if (!battleSceneDebugCoreState.active || !battleSceneDebugState) return;
      const owner = battleSceneDebugGetTeamUnit(battleSceneDebugCoreState.ownerId);
      const targets = battleSceneDebugState.enemies.filter(e => e && e.currentHp > 0);
      if (!owner || targets.length === 0) return;
      const t = targets[Math.floor(Math.random() * targets.length)];
      battleSceneDebugAddStatus(t, 'limitField', 30, battleSceneDebugCoreState.fieldTurns);
      const dmg = Math.max(1, Math.floor((owner.attack || 0) * 10));
      battleSceneDebugApplyDamage(t, dmg);
      pushBattleSceneDebugFeed(`极限力场：对 ${t.displayName || t.name} 造成 ${dmg} 并使其易伤`);
      if (t.currentHp <= 0) pushBattleSceneDebugFeed(`[${t.displayName || t.name}] 已倒下`);
    }

    function battleSceneDebugMaybeTriggerCore() {
      if (!battleSceneDebugCoreState.active) return;
      while (battleSceneDebugCoreState.spent >= battleSceneDebugCoreState.threshold * (battleSceneDebugCoreState.triggers + 1)) {
        battleSceneDebugCoreState.triggers++;
        battleSceneDebugTriggerLimitField();
      }
    }

    function battleSceneDebugInitCatLinkIfNeeded() {
      const cat = battleSceneDebugGetTeamUnit(battleSceneDebugCatLinkState.catId);
      if (!cat) return;
      const text = cat.passiveText || '';
      if (!/生命链接/.test(text)) return;
      battleSceneDebugCatLinkState.active = true;

      const mSpd = text.match(/特化加速(\d+)%/);
      const spd = mSpd ? Math.max(0, Math.min(120, parseInt(mSpd[1], 10))) : 46;
      const mTurns = text.match(/生命链接[^，。]*持续(\d+)回合/);
      const turns = mTurns ? Math.max(1, Math.min(12, parseInt(mTurns[1], 10))) : 6;
      const mFollow = text.match(/以(\d+)%强度/);
      const followScale = mFollow ? Math.max(0.3, Math.min(1.2, parseInt(mFollow[1], 10) / 100)) : 0.8;
      const mTransfer = text.match(/最多(\d+)次/);
      const transfersLeft = mTransfer ? Math.max(0, Math.min(10, parseInt(mTransfer[1], 10))) : 3;

      battleSceneDebugAddStatus(cat, 'spdUp', spd, turns);

      const candidates = battleSceneDebugState.player.filter(u => u && u.currentHp > 0 && u.id !== cat.id);
      if (candidates.length === 0) return;
      const partner = candidates.sort((a, b) => (b.attack || 0) - (a.attack || 0))[0];
      battleSceneDebugAddStatus(cat, 'lifeLink', 1, turns, { role: 'source', partnerId: partner.id, transfersLeft, followScale, turns });
      battleSceneDebugAddStatus(partner, 'lifeLink', 1, turns, { role: 'partner', partnerId: cat.id, transfersLeft, followScale, turns });
      pushBattleSceneDebugFeed(`生命链接：露露链接 ${partner.displayName || partner.name}`);
    }

    function battleSceneDebugGetCatLinkInfo() {
      if (!battleSceneDebugCatLinkState.active || !battleSceneDebugState) return null;
      const cat = battleSceneDebugGetTeamUnit(battleSceneDebugCatLinkState.catId);
      if (!cat) return null;
      const src = battleSceneDebugGetStatus(cat, 'lifeLink');
      if (!src || !src.meta || src.meta.role !== 'source') return null;
      const partner = battleSceneDebugGetTeamUnit(src.meta.partnerId);
      return { cat, src, partner };
    }

    function battleSceneDebugTryPreventLifeLinkDeath(unit) {
      const info = battleSceneDebugGetCatLinkInfo();
      if (!info) return false;
      const { cat, partner } = info;
      if (!partner || partner.currentHp <= 0 || cat.currentHp <= 0) return false;
      if (unit.id === cat.id || unit.id === partner.id) {
        unit.currentHp = 1;
        pushBattleSceneDebugFeed(`生命链接：${unit.displayName || unit.name} 受到致命伤但被保护`);
        return true;
      }
      return false;
    }

    function battleSceneDebugTransferLifeLink() {
      const info = battleSceneDebugGetCatLinkInfo();
      if (!info) return;
      const { cat, src } = info;
      if (!cat || cat.currentHp <= 0) return;
      if (!src.meta || typeof src.meta.transfersLeft !== 'number') src.meta.transfersLeft = 3;
      if (src.meta.transfersLeft <= 0) return;

      const candidates = battleSceneDebugState.player.filter(u => u && u.currentHp > 0 && u.id !== cat.id).sort((a, b) => (b.attack || 0) - (a.attack || 0));
      const next = candidates.find(u => u.id !== src.meta.partnerId);
      if (!next) return;

      src.meta.transfersLeft -= 1;
      src.meta.partnerId = next.id;
      const turns = src.meta.turns || 6;
      src.turns = turns;
      battleSceneDebugAddStatus(next, 'lifeLink', 1, turns, { role: 'partner', partnerId: cat.id, transfersLeft: src.meta.transfersLeft, followScale: src.meta.followScale, turns });
      pushBattleSceneDebugFeed(`生命链接转移：链接至 ${next.displayName || next.name}`);
    }

    function battleSceneDebugTriggerStoredFollowUp() {
      const info = battleSceneDebugGetCatLinkInfo();
      if (!info) return;
      const { cat, src, partner } = info;
      if (!partner || partner.currentHp <= 0 || cat.currentHp <= 0) return;
      if (battleSceneDebugCatLinkState.roundFollowUpUsed) return;
      const power = (src && src.meta && typeof src.meta.followScale === 'number') ? src.meta.followScale : 0.8;
      const target = battleSceneDebugChooseTarget(partner, battleSceneDebugState.enemies);
      if (!target) return;
      battleSceneDebugApplyHit(partner, target, power, '蓄能追击', { isFollowUp: true });
      battleSceneDebugCatLinkState.roundFollowUpUsed = true;
    }

    /* ── C6：羁绊加成（队伍层面） ─────────────────────────────
       数字全在 domain/bonds.js（单一真相源），这里只负责在进战斗时套到单位上。
       不写进 calculateTotalStats —— 那是"角色个人"数值，装备/属性面板看的就是它。 */
    function battleSceneDebugApplyBonds(stats) {
      if (!stats || !battleSceneDebugBondTotal) return stats;
      const bonds = window.__bonds;
      if (!bonds || typeof bonds.applyToStats !== 'function') return stats;
      return bonds.applyToStats(stats, battleSceneDebugBondTotal);
    }

    function battleSceneDebugUpdateRainFlowerBondState() {
      if (!battleSceneDebugState) return;
      const koi = battleSceneDebugGetTeamUnit('char_sur_014');
      const yoru = battleSceneDebugGetTeamUnit('char_ur_001');
      const koiAlive = !!(koi && koi.currentHp > 0);
      const yoruAlive = !!(yoru && yoru.currentHp > 0);

      const clearBond = () => {
        battleSceneDebugState.player.forEach(u => {
          if (!u) return;
          u.statuses = (u.statuses || []).filter(s => !['bondSpdUp', 'bondReducUp'].includes(s.type));
        });
      };
      const clearMoran = () => {
        battleSceneDebugState.player.forEach(u => {
          if (!u) return;
          u.statuses = (u.statuses || []).filter(s => !['moranSpdUp', 'moranReducUp', 'moranAtkUp', 'moranDmgUp', 'moranControl'].includes(s.type));
        });
      };

      if (koiAlive && yoruAlive) {
        if (battleSceneDebugRainFlowerBondState !== 'bond') pushBattleSceneDebugFeed(`雨花共鸣：双星同在，全队受福泽`);
        clearMoran();
        battleSceneDebugState.player.forEach(u => {
          if (!u || u.currentHp <= 0) return;
          battleSceneDebugAddStatus(u, 'bondSpdUp', 12, 999);
          battleSceneDebugAddStatus(u, 'bondReducUp', 10, 999);
        });
        if (battleSceneDebugRainFlowerBondState !== 'bond') {
          battleSceneDebugState.player.forEach(u => u && u.currentHp > 0 && battleSceneDebugAddStatus(u, 'ccImmune', 1, 1));
        }
        battleSceneDebugRainFlowerBondState = 'bond';
        return;
      }

      if (koiAlive || yoruAlive) {
        const survivor = koiAlive ? koi : yoru;
        const state = koiAlive ? 'moranKoi' : 'moranYoru';
        if (battleSceneDebugRainFlowerBondState !== state) pushBattleSceneDebugFeed(`蓦然回首：${survivor.displayName || survivor.name}`);
        clearBond();
        clearMoran();
        if (koiAlive) {
          battleSceneDebugState.player.forEach(u => {
            if (!u || u.currentHp <= 0) return;
            battleSceneDebugAddStatus(u, 'moranSpdUp', 14, 999);
            battleSceneDebugAddStatus(u, 'moranReducUp', 14, 999);
            battleSceneDebugAddStatus(u, 'moranAtkUp', 22, 999);
            battleSceneDebugAddStatus(u, 'moranDmgUp', 8, 999);
          });
          battleSceneDebugState.player.forEach(u => u && u.currentHp > 0 && battleSceneDebugAddStatus(u, 'ccImmune', 1, 1));
        } else {
          battleSceneDebugAddStatus(yoru, 'moranSpdUp', 18, 999);
          battleSceneDebugAddStatus(yoru, 'moranReducUp', 12, 999);
          battleSceneDebugAddStatus(yoru, 'moranAtkUp', 10, 999);
          battleSceneDebugAddStatus(yoru, 'moranDmgUp', 0, 999);
          battleSceneDebugAddStatus(yoru, 'moranControl', 1, 999, { chanceBonus: 20, turnsBonus: 1, spdFlatDown: 25 });
          battleSceneDebugAddStatus(yoru, 'ccImmune', 1, 1);
        }
        battleSceneDebugRainFlowerBondState = state;
        return;
      }

      if (battleSceneDebugRainFlowerBondState !== 'none') {
        clearBond();
        clearMoran();
        battleSceneDebugRainFlowerBondState = 'none';
      }
    }

    /** C9：职业克制乘数（唯一数值源 domain/counters.js；模块缺失时退中性 ×1，不崩） */
    function battleSceneDebugClassCounter(attacker, target) {
      try {
        const api = (window.__counters || (window.Game && window.Game.domain && window.Game.domain.counters) || null);
        if (api && typeof api.multOf === 'function') return api.multOf(attacker && attacker.class, target && target.class);
      } catch (e) { /* ignore */ }
      return { mult: 1, state: 'neutral', rel: null };
    }

    function computeDebugDamage(attacker, target, mult, opts = {}) {
      const m = Number(mult);
      mult = Number.isFinite(m) ? m : 0;
      if (battleSceneDebugGetStatus(target, 'immune')) return { immune: true, dodged: false, crit: false, block: false, damage: 0 };
      const tPassive = target && target.passiveRuntime ? target.passiveRuntime : null;
      if (target && !target.isEnemy && tPassive && tPassive.firstHitImmuneChance > 0 && !tPassive.firstHitUsed) {
        if (Math.random() * 100 < tPassive.firstHitImmuneChance) {
          tPassive.firstHitUsed = true;
          return { immune: true, dodged: false, crit: false, block: false, damage: 0 };
        }
        tPassive.firstHitUsed = true;
      }

      const atkUp = battleSceneDebugGetStatusValue(attacker, 'atkUp') + battleSceneDebugGetStatusValue(attacker, 'moranAtkUp');
      let dmgUp = battleSceneDebugGetStatusValue(attacker, 'dmgUp');
      const defDown = battleSceneDebugGetStatusValue(target, 'defDown');
      const dodgeUp = battleSceneDebugGetStatusValue(target, 'dodgeUp');
      const dmgReducUp = battleSceneDebugGetStatusValue(target, 'dmgReducUp') + battleSceneDebugGetStatusValue(target, 'bondReducUp') + battleSceneDebugGetStatusValue(target, 'moranReducUp');

      const dodgeChance = Math.max(0, (target.dodgeRate || 0) + dodgeUp - (attacker.effectHit || 0) * 0.5);
      if (dodgeChance > 0 && Math.random() * 100 < dodgeChance) return { immune: false, dodged: true, crit: false, block: false, damage: 0 };

      const passive = attacker && attacker.passiveRuntime ? attacker.passiveRuntime : null;
      if (passive && passive.bonusVs) {
        Object.entries(passive.bonusVs).forEach(([k, v]) => {
          if (!v) return;
          if (battleSceneDebugGetStatus(target, k)) dmgUp += v;
        });
      }
      const atk = Math.max(1, (Number(attacker.attack) || 1) * (1 + atkUp / 100));
      const base = opts.rawOverride != null ? Number(opts.rawOverride) : (atk * mult);
      // C9：职业克制乘区（克制 +15% / 被克 -15%，环见 assets/data/counters.json）
      const counter = battleSceneDebugClassCounter(attacker, target);
      const raw = base * (0.9 + Math.random() * 0.2) * (1 + dmgUp / 100) * counter.mult;
      const limitField = battleSceneDebugGetStatusValue(target, 'limitField');
      const ignoreDef = Math.max(
        typeof opts.ignoreDef === 'number' ? opts.ignoreDef : 0,
        passive && typeof passive.ignoreDef === 'number' ? passive.ignoreDef : 0
      );
      const penIgnore = passive && typeof passive.penIgnorePct === 'number' ? passive.penIgnorePct : 0;
      const pen = Math.max(0, Math.min(200, (attacker.penetration || 0) + ignoreDef * 2));
      const def = Math.max(0, (target.defense || 0) * (1 - defDown / 100) * (1 - pen / 200) * (1 - Math.min(80, penIgnore) / 100));
      let dmg = Math.max(1, Math.floor(raw * (100 / (100 + def))));
      if (!Number.isFinite(dmg)) dmg = 0;

      const critResist = attacker && !attacker.isEnemy ? battleSceneDebugAffixValue('critResist') : 0;
      const antiCrit = Math.max(0, target.antiCrit || 0);
      const critRate = Math.max(0, (attacker.critRate || 0) - critResist - antiCrit);
      const forceCrit = !!battleSceneDebugGetStatus(attacker, 'nextCrit');
      const crit = forceCrit || ((Math.random() * 100) < critRate);
      if (crit) dmg = Math.max(1, Math.floor(dmg * (Math.max(150, attacker.critDmg || 150) / 100)));
      if (crit && passive && typeof passive.critBonusPct === 'number' && passive.critBonusPct > 0) {
        dmg = Math.max(1, Math.floor(dmg * (1 + passive.critBonusPct / 100)));
      }
      if (!crit) {
        const nonCritReduc = battleSceneDebugGetStatusValue(target, 'nonCritReduc');
        if (nonCritReduc > 0) dmg = Math.max(1, Math.floor(dmg * (1 - Math.min(80, nonCritReduc) / 100)));
      }

      const block = (Math.random() * 100) < Math.max(0, target.blockRate || 0);
      if (block) dmg = Math.max(1, Math.floor(dmg * 0.5));

      const reduc = Math.min(80, (target.dmgReduc || 0) + dmgReducUp + battleSceneDebugBlessingReduc(target));
      if (reduc > 0) dmg = Math.max(1, Math.floor(dmg * (1 - reduc / 100)));
      if (limitField > 0) dmg = Math.max(1, Math.floor(dmg * (1 + limitField / 100)));

      if (target && !target.isEnemy && battleSceneDebugAffixValue('dmgTakenUp') > 0) {
        dmg = Math.floor(dmg * (1 + battleSceneDebugAffixValue('dmgTakenUp') / 100));
      }

      // E2 布阵：站位乘区（前排承伤 ↑ / 后排输出 ↑）—— 配置在 battleScene.formation
      dmg = battleSceneDebugPositionDmg(dmg, attacker, target);
      // E1 祝福：伤害乘区（狂热 / 背水 / 猎手 / 后排强袭）
      dmg = battleSceneDebugBlessingDmg(dmg, attacker, target);
      // E3 周期挑战：机制乘区（破盾 / 元素弱点 / 随从减伤 / 狂暴 / 背水递增）
      dmg = battleSceneDebugChallengeDmg(dmg, attacker, target);

      if (!Number.isFinite(dmg)) dmg = 0;
      return { immune: false, dodged: false, crit, block, damage: dmg, counterState: counter.state };
    }

    function battleSceneDebugParsePassiveText(text) {
      const t = String(text || '');
      const getNum = (re) => {
        const m = t.match(re);
        if (!m) return 0;
        return parseInt(m[1], 10) || 0;
      };
      const bonusVs = {};
      [
        ['burn', /对灼烧目标伤害提升(\d+)%/],
        ['poison', /对中毒目标伤害提升(\d+)%/],
        ['bleed', /对流血目标伤害提升(\d+)%/],
        ['spdDown', /攻击带有减速效果的目标时，伤害提升(\d+)%/],
        ['silence', /攻击带有沉默效果的目标时，伤害提升(\d+)%/],
        ['shock', /对带有感电标记的目标伤害提升(\d+)%/]
      ].forEach(([k, re]) => {
        const v = getNum(re);
        if (v) bonusVs[k] = v;
      });

      const runtime = {
        atkPercent: getNum(/攻击力提升(\d+)%/),
        hpPercent: getNum(/生命值提升(\d+)%/),
        defPercent: getNum(/防御力提升(\d+)%/),
        critRate: getNum(/暴击率提升(\d+)%/),
        critDmg: getNum(/暴击伤害提升(\d+)%/),
        effectHit: getNum(/效果命中提升(\d+)%/),
        penetration: getNum(/穿透提升(\d+)%/),
        tenacity: getNum(/抗性提升(\d+)%/),
        speed: getNum(/速度提升(\d+)%/),
        dmgReduc: getNum(/免伤提升(\d+)%/),
        ignoreDef: getNum(/无视目标(\d+)%防御/),
        penIgnorePct: getNum(/无视目标(\d+)%防御/),
        critBonusPct: getNum(/暴击时伤害额外增加(\d+)%/),
        firstHitImmuneChance: getNum(/每回合有(\d+)%几率免疫受到的第一次伤害/),
        firstHitUsed: false,
        bonusVs,
        onHitCc: null,
        onHitMark: null,
        followUpOnBasic: null,
        counter: null,
        onKillImmuneTurns: 0,
        onEnemyDeathAtkUp: 0,
        critDmgPerHit: 0,
        critDmgStacks: 0,
        skillAtkStack: null
      };

      const mCc = t.match(/攻击时有(\d+)%几率(魅惑|眩晕|沉默)目标(\d+)回合/);
      if (mCc) {
        const map = { 魅惑: 'charm', 眩晕: 'stun', 沉默: 'silence' };
        runtime.onHitCc = { chance: parseInt(mCc[1], 10) || 0, type: map[mCc[2]] || 'stun', turns: parseInt(mCc[3], 10) || 1 };
      }
      const mShock = t.match(/攻击时有(\d+)%几率给目标添加“感电”标记/);
      if (mShock) runtime.onHitMark = { chance: parseInt(mShock[1], 10) || 0, type: 'shock', turns: 2 };

      const mFollow = t.match(/普通攻击有(\d+)%几率触发追击，造成(\d+)%伤害/);
      if (mFollow) runtime.followUpOnBasic = { chance: parseInt(mFollow[1], 10) || 0, scale: (parseInt(mFollow[2], 10) || 0) / 100 };

      const mCounter = t.match(/受到攻击时有(\d+)%几率反击，造成(\d+)%伤害/);
      if (mCounter) runtime.counter = { chance: parseInt(mCounter[1], 10) || 0, scale: (parseInt(mCounter[2], 10) || 0) / 100 };

      if (/击杀目标后进入隐身状态一回合/.test(t)) runtime.onKillImmuneTurns = 1;

      const mEnemyDeath = t.match(/敌方每死亡一人[^，。]*增加(\d+)%攻击力/);
      if (mEnemyDeath) runtime.onEnemyDeathAtkUp = parseInt(mEnemyDeath[1], 10) || 0;

      const mCritGrow = t.match(/每攻击一次，暴击伤害提升(\d+)%（无上限）/);
      if (mCritGrow) runtime.critDmgPerHit = parseInt(mCritGrow[1], 10) || 0;

      const mSkillStack = t.match(/每释放一次技能，攻击力永久增加(\d+)%（最高叠加(\d+)层）/);
      if (mSkillStack) runtime.skillAtkStack = { value: parseInt(mSkillStack[1], 10) || 0, max: parseInt(mSkillStack[2], 10) || 0, stacks: 0 };
      return runtime;
    }

    function battleSceneDebugApplyHit(attacker, target, multiplier, label, opts = {}) {
      if (!battleSceneDebugState || !attacker || !target) return { damage: 0 };
      if (!Number.isFinite(attacker.currentHp)) attacker.currentHp = Math.max(0, Number(attacker.currentHp) || 0);
      if (!Number.isFinite(attacker.maxHp)) attacker.maxHp = Math.max(1, Number(attacker.maxHp) || 1);
      if (!Number.isFinite(target.currentHp)) target.currentHp = Math.max(0, Number(target.currentHp) || 0);
      if (!Number.isFinite(target.maxHp)) target.maxHp = Math.max(1, Number(target.maxHp) || 1);
      if (!(attacker.currentHp > 0) || !(target.currentHp > 0)) return { damage: 0 };
      const r = computeDebugDamage(attacker, target, multiplier, opts);
      if (r.immune) {
        pushBattleSceneDebugFeed(`${attacker.displayName || attacker.name} 的${label}被 ${target.displayName || target.name} 免疫`);
        battleSceneDebugFloat(target, '免疫', 'immune');
        return { damage: 0 };
      }
      if (r.dodged) {
        pushBattleSceneDebugFeed(`${attacker.displayName || attacker.name} 的${label}被 ${target.displayName || target.name} 闪避`);
        battleSceneDebugFloat(target, '闪避', 'dodge');
        if (!target.isEnemy && /成功闪避后下一次攻击必暴击/.test((target.passiveText || ''))) {
          battleSceneDebugAddStatus(target, 'nextCrit', 1, 3);
        }
        const mHeal = String(target.passiveText || '').match(/闪避成功时回复(\d+)%最大生命值/);
        if (mHeal) {
          const pct = Math.max(0, Math.min(80, parseInt(mHeal[1], 10)));
          const heal = Math.floor((target.maxHp || 0) * pct / 100);
          const actual = battleSceneDebugApplyHeal(target, heal);
          if (actual > 0) pushBattleSceneDebugFeed(`${target.displayName || target.name} 闪避回复 ${actual}`);
        }
        return { damage: 0 };
      }

      if (battleSceneDebugGetStatus(attacker, 'nextCrit')) {
        const s = battleSceneDebugGetStatus(attacker, 'nextCrit');
        if (s) s.turns = 0;
        attacker.statuses = (attacker.statuses || []).filter(x => x && (x.turns || 0) > 0);
      }

      const { dealt } = battleSceneDebugApplyDamage(target, r.damage);
      battleSceneDebugAfterHit(attacker, target, label === '普攻', opts);
      const p = attacker.passiveRuntime;
      if (dealt > 0 && p && p.critDmgPerHit > 0) {
        p.critDmgStacks = (p.critDmgStacks || 0) + 1;
        attacker.critDmg = (attacker.critDmg || 150) + p.critDmgPerHit;
      }

      const drain = battleSceneDebugAffixValue('energyDrain');
      const gain = (!attacker.isEnemy && drain > 0 && Math.random() * 100 < drain) ? 0 : 1;
      if (!attacker.isEnemy && dealt > 0 && battleSceneDebugState) {
        battleSceneDebugState.energy = (battleSceneDebugState.energy || 0) + gain;
      }

      const flags = [];
      if (r.crit) flags.push('暴击');
      if (r.block) flags.push('格挡');
      if (r.counterState === 'counter') flags.push('克制');
      if (r.counterState === 'weak') flags.push('被克');
      const flagStr = flags.length ? `（${flags.join('/')}）` : '';
      pushBattleSceneDebugFeed(`${attacker.displayName || attacker.name} 对 ${target.displayName || target.name} 使用${label}，造成 ${dealt}${flagStr}`);
      // B7 伤害飘字：暴击走金色大字，普伤红色
      if (dealt > 0) battleSceneDebugFloat(target, `-${dealt}`, r.crit ? 'crit' : 'damage');
      // B9 音效：命中/暴击（engine 内部节流 + 静音判断，缺失时静默跳过）
      if (window.Game && Game.audio) Game.audio.sfx(r.crit ? 'crit' : 'hit');

      const lifestealTotal = (attacker.lifesteal || 0) + battleSceneDebugGetStatusValue(attacker, 'lifestealUp');
      if (lifestealTotal > 0 && dealt > 0) {
        const heal = Math.floor(dealt * lifestealTotal / 100);
        const actual = battleSceneDebugApplyHeal(attacker, heal);
        if (actual > 0) pushBattleSceneDebugFeed(`${attacker.displayName || attacker.name} 吸血回复 ${actual}`);
      }

      if (!(target.currentHp > 0)) {
        if (!target.isEnemy && battleSceneDebugTryPreventLifeLinkDeath(target)) {
          return { damage: dealt, crit: !!r.crit };
        }
        const undying = battleSceneDebugGetStatus(target, 'nonCritUndying');
        if (undying && !r.crit) {
          target.currentHp = 1;
          pushBattleSceneDebugFeed(`不败：${target.displayName || target.name} 在非暴击致命伤下存活`);
          return { damage: dealt, crit: !!r.crit };
        }

        const revive = battleSceneDebugGetStatus(target, 'revive');
        if (revive && revive.meta && typeof revive.meta.charges === 'number' && revive.meta.charges > 0) {
          revive.meta.charges -= 1;
          const hpPct = revive.meta.hpPct || 0.3;
          target.currentHp = Math.max(1, Math.floor((target.maxHp || 1) * hpPct));
          target.statuses = (target.statuses || []).filter(s => s && ['revive'].includes(s.type));
          pushBattleSceneDebugFeed(`复活：${target.displayName || target.name} 重新站起（剩余 ${revive.meta.charges}）`);
          return { damage: dealt, crit: !!r.crit };
        }

        pushBattleSceneDebugFeed(`[${target.displayName || target.name}] 已倒下`);
        if (!target.isEnemy && target.id === battleSceneDebugCatLinkState.catId) {
          battleSceneDebugTransferLifeLink();
        } else if (!target.isEnemy && battleSceneDebugGetStatus(target, 'lifeLink') && battleSceneDebugGetStatus(target, 'lifeLink').meta && battleSceneDebugGetStatus(target, 'lifeLink').meta.role === 'partner') {
          battleSceneDebugTransferLifeLink();
        }
        if (target.isEnemy) {
          battleSceneDebugState.player.forEach(u => {
            if (!u || u.currentHp <= 0) return;
            if (u.passiveRuntime && u.passiveRuntime.onEnemyDeathAtkUp) {
              u.attack = Math.floor(u.attack * (1 + u.passiveRuntime.onEnemyDeathAtkUp / 100));
            }
          });
          if (!attacker.isEnemy && attacker.passiveRuntime && attacker.passiveRuntime.onKillImmuneTurns) {
            battleSceneDebugAddStatus(attacker, 'immune', 1, attacker.passiveRuntime.onKillImmuneTurns);
          }
          // E1 祝福：击杀收益（战意高涨 / 嗜血 / 追猎）—— 仅远征生效
          const killE = battleSceneDebugBlessSum('onKillEnergy');
          if (killE > 0 && !attacker.isEnemy) {
            battleSceneDebugState.energy = (battleSceneDebugState.energy || 0) + killE;
            pushBattleSceneDebugFeed(`战意高涨：击杀回复 ${killE} 点能量`);
          }
          const killHeal = battleSceneDebugBlessSum('onKillHealPct');
          if (killHeal > 0 && !attacker.isEnemy) {
            const healed = battleSceneDebugApplyHeal(attacker, Math.floor((attacker.maxHp || 0) * killHeal / 100));
            if (healed > 0) pushBattleSceneDebugFeed(`嗜血：${attacker.displayName || attacker.name} 回复 ${healed}`);
          }
          const pursue = battleSceneDebugBlessSum('onKillBasic');
          if (pursue > 0 && !attacker.isEnemy && !opts.isFollowUp) {
            const next = (battleSceneDebugState.enemies || []).find(u => u && u.currentHp > 0);
            if (next) battleSceneDebugApplyHit(attacker, next, 1.0, '追猎', { isFollowUp: true });
          }
        }
      }

      if (label === '普攻' && !opts.isFollowUp && p && p.followUpOnBasic && target.currentHp > 0) {
        const f = p.followUpOnBasic;
        if (Math.random() * 100 < (f.chance || 0)) {
          battleSceneDebugApplyHit(attacker, target, f.scale || 0.8, '追击', { isFollowUp: true });
        }
      }

      const tP = target.passiveRuntime;
      if (tP && tP.reflectPct > 0 && dealt > 0 && attacker.currentHp > 0) {
        const reflect = Math.max(1, Math.floor(dealt * tP.reflectPct / 100));
        attacker.currentHp = Math.max(0, attacker.currentHp - reflect);
        pushBattleSceneDebugFeed(`${target.displayName || target.name} 反弹伤害 ${reflect} 给 ${attacker.displayName || attacker.name}`);
      }
      // E1 祝福：荆棘之甲（我方前排受击时反弹伤害，只对远征队伍生效）
      const bReflect = battleSceneDebugBlessings.find(b => b && b.type === 'reflect');
      if (bReflect && dealt > 0 && attacker.currentHp > 0 && !target.isEnemy
        && (!bReflect.pos || bReflect.pos === (target.position || 'front'))) {
        const reflect = Math.max(1, Math.floor(dealt * (Number(bReflect.value) || 0) / 100));
        attacker.currentHp = Math.max(0, attacker.currentHp - reflect);
        pushBattleSceneDebugFeed(`荆棘之甲：${target.displayName || target.name} 反弹 ${reflect} 给 ${attacker.displayName || attacker.name}`);
      }

      if (!opts.isCounter && !target.isEnemy && target.currentHp > 0 && tP && tP.counter && attacker.currentHp > 0) {
        if (Math.random() * 100 < (tP.counter.chance || 0)) {
          battleSceneDebugApplyHit(target, attacker, tP.counter.scale || 1.0, '反击', { isCounter: true });
        }
      }

      return { damage: dealt, crit: !!r.crit };
    }

    function battleSceneDebugAfterHit(attacker, target, isBasic, opts = {}) {
      if (!attacker || !target || target.currentHp <= 0) return;
      const p = attacker.passiveRuntime;
      if (!p) return;
      if (p.onHitMark && Math.random() * 100 < (p.onHitMark.chance || 0)) {
        battleSceneDebugAddStatus(target, p.onHitMark.type, 1, p.onHitMark.turns || 2);
      }
      if (p.onHitCc) {
        const type = p.onHitCc.type;
        const isControl = type === 'stun' || type === 'silence' || type === 'charm';
        const once = opts && opts.ccOnce ? opts.ccOnce : null;
        if (once && once.used && isControl) return;
        const immune = battleSceneDebugGetStatus(target, 'ccImmune') || (type && battleSceneDebugGetStatus(target, `${type}Immune`));
        if (immune || !type) return;
        battleSceneDebugAddStatus(target, type, 1, p.onHitCc.turns || 1);
        if (once && isControl) once.used = true;
      }
    }

    function battleSceneDebugChooseTarget(attacker, candidates, opts = {}) {
      const alive = candidates.filter(u => u && u.currentHp > 0);
      if (alive.length === 0) return null;
      const taunter = alive.find(u => battleSceneDebugGetStatus(u, 'taunt'));
      if (taunter) return taunter;
      let pool = alive;
      if (opts && opts.basic) {
        const front = alive.filter(u => (u.position || 'front') === 'front');
        const back = alive.filter(u => (u.position || 'front') !== 'front');
        // E2：刺客切入 —— 敌方有后排时直取后排（脆皮放后排不再绝对安全）
        if (battleSceneDebugFormationCfg().assassinDiveBack && attacker && attacker.class === 'assassin' && back.length) {
          pool = back;
        } else if (front.length) {
          pool = front;
        }
      }
      if (pool.length === 0) return null;
      if (attacker && attacker.class === 'assassin') {
        return pool.sort((a, b) => (a.currentHp / a.maxHp) - (b.currentHp / b.maxHp))[0];
      }
      return pool[Math.floor(Math.random() * pool.length)];
    }

    function battleSceneDebugTickTurnStart(unit) {
      if (!unit) return;
      if (!Number.isFinite(unit.currentHp)) unit.currentHp = Math.max(0, Number(unit.currentHp) || 0);
      if (!Number.isFinite(unit.maxHp)) unit.maxHp = Math.max(1, Number(unit.maxHp) || 1);
      if (!(unit.currentHp > 0)) return;
      const burn = battleSceneDebugGetStatus(unit, 'burn');
      const bleed = battleSceneDebugGetStatus(unit, 'bleed');
      const poison = battleSceneDebugGetStatus(unit, 'poison');
      const regen = battleSceneDebugGetStatus(unit, 'regen');
      let dot = 0;
      const burnResist = battleSceneDebugGetStatusValue(unit, 'burnResist');
      const bleedResist = battleSceneDebugGetStatusValue(unit, 'bleedResist');
      const poisonResist = battleSceneDebugGetStatusValue(unit, 'poisonResist');
      if (burn) dot += (burn.value || 0) * (1 + battleSceneDebugAffixValue('burnAmp') / 100) * (1 - Math.min(85, burnResist) / 100);
      if (bleed) dot += (bleed.value || 0) * (1 + battleSceneDebugAffixValue('dotUp') / 100) * (1 - Math.min(85, bleedResist) / 100);
      if (poison) dot += (poison.value || 0) * (1 + battleSceneDebugAffixValue('dotUp') / 100) * (1 - Math.min(85, poisonResist) / 100);
      if (dot > 0) {
        const { dealt } = battleSceneDebugApplyDamage(unit, dot);
        if (dealt > 0) pushBattleSceneDebugFeed(`${unit.displayName || unit.name} 受到持续伤害 ${dealt}`);
      }
      if (regen) {
        const healDown = Math.min(80, Math.max(0, battleSceneDebugGetStatusValue(unit, 'healDownDebuff') || 0));
        const raw = Math.max(0, Math.floor((regen.value || 0) * (1 - healDown / 100)));
        const actual = battleSceneDebugApplyHeal(unit, raw);
        if (actual > 0) pushBattleSceneDebugFeed(`${unit.displayName || unit.name} 回复 ${actual}`);
      }
    }

    function battleSceneDebugApplyDamage(target, amount) {
      if (!target) return { dealt: 0, shieldAbsorb: 0 };
      if (!Number.isFinite(target.currentHp)) target.currentHp = Math.max(0, Number(target.currentHp) || 0);
      if (!Number.isFinite(target.maxHp)) target.maxHp = Math.max(1, Number(target.maxHp) || 1);
      if (!(target.currentHp > 0)) return { dealt: 0, shieldAbsorb: 0 };
      let left = Math.max(0, Math.floor(Number(amount) || 0));
      let shieldAbsorb = 0;

      if (!target.isEnemy && (target.enhancedHp || 0) > 0) {
        const cap = (target.enhancedHp || 0) * 2;
        const absorbRaw = Math.min(left, cap);
        if (absorbRaw > 0) {
          const spent = Math.ceil(absorbRaw / 2);
          target.enhancedHp = Math.max(0, (target.enhancedHp || 0) - spent);
          left -= absorbRaw;
          if (battleSceneDebugCoreState.active) {
            battleSceneDebugCoreState.spent += spent;
            battleSceneDebugMaybeTriggerCore();
          }
        }
      }

      if ((target.shield || 0) > 0 && left > 0) {
        shieldAbsorb = Math.min(target.shield, left);
        target.shield = Math.max(0, target.shield - shieldAbsorb);
        left -= shieldAbsorb;
        const breakPct = battleSceneDebugAffixValue('shieldBreak');
        if (breakPct > 0 && target.shield > 0) {
          const extra = Math.floor(shieldAbsorb * breakPct / 100);
          target.shield = Math.max(0, target.shield - extra);
        }
        // E3：破盾检测（铁壁机制）—— 非挑战时为空操作
        battleSceneDebugMechanicAfterDamage(target);
      }
      const dealt = Math.min(target.currentHp, left);
      target.currentHp = Math.max(0, target.currentHp - dealt);
      if (!Number.isFinite(target.currentHp)) target.currentHp = 0;
      if (battleSceneDebugState) {
        battleSceneDebugState.maxDamage = Math.max(battleSceneDebugState.maxDamage || 0, dealt || 0);
        // E3：累计伤害（周期挑战的分数 = 对敌方造成的总伤害，含被护盾吸收的部分）
        if (target.isEnemy) {
          battleSceneDebugState.totalDamage = (battleSceneDebugState.totalDamage || 0) + (dealt || 0) + (shieldAbsorb || 0);
        }
      }
      return { dealt, shieldAbsorb };
    }

    function battleSceneDebugApplyHeal(target, amount) {
      if (!target) return 0;
      if (!Number.isFinite(target.currentHp)) target.currentHp = Math.max(0, Number(target.currentHp) || 0);
      if (!Number.isFinite(target.maxHp)) target.maxHp = Math.max(1, Number(target.maxHp) || 1);
      if (!(target.currentHp > 0)) return 0;
      // E3：禁疗机制 —— 治疗量按机制削减（非挑战时为 ×1，行为不变）
      const healMul = battleSceneDebugMechanicHealMul();
      const raw = Math.max(0, Math.floor(Number(amount) || 0) * healMul);
      const heal = raw;
      const actual = Math.min(target.maxHp - target.currentHp, heal);
      target.currentHp += actual;
      if (!Number.isFinite(target.currentHp)) target.currentHp = 0;
      if (battleSceneDebugState) {
        battleSceneDebugState.totalHealing = (battleSceneDebugState.totalHealing || 0) + (actual || 0);
      }
      // B7 治疗飘字（纯视觉）
      if (actual > 0) battleSceneDebugFloat(target, `+${actual}`, 'heal');
      return actual;
    }

    function battleSceneDebugGetSkillCost(skill) {
      if (!skill) return 2;
      // E1 祝福：节能装置（技能消耗 -1，最低 0）—— 非远征时减 0，行为不变
      const cut = battleSceneDebugBlessSum('cost');
      const applyCut = (v) => (cut > 0 ? Math.max(0, v - cut) : v);
      // D1：数据显式 cost 优先（战术技 1 费、大招 3/4 费），未标 cost 的老技能走原启发式
      if (Number.isFinite(skill.cost)) return applyCut(Math.max(0, skill.cost));
      const desc = typeof skill.description === 'string' ? skill.description : '';
      const effects = Array.isArray(skill.effects) ? skill.effects : [];
      const isSpeedSkill = /速度/.test(desc) && /(增加|提升)/.test(desc) && !/降低/.test(desc);
      const isSpeedEffect = effects.some(e => e && (e.stat === 'spdUp' || e.stat === 'spdFlatUp' || e.stat === 'speedUp'));
      const base = (isSpeedSkill || isSpeedEffect) ? 0 : 2;
      return applyCut(base);
    }

    function battleSceneDebugGetSkillTargetSpec(skill) {
      const effects = skill && Array.isArray(skill.effects) ? skill.effects : [];
      let needsEnemyPick = false;
      let needsAllyPick = false;
      let hasAny = false;
      effects.forEach(e => {
        if (!e) return;
        const t = e.target || 'enemy';
        hasAny = true;
        if (t === 'allySelect') needsAllyPick = true;
        if (t === 'enemy') needsEnemyPick = true;
      });
      if (!hasAny) return { kind: 'enemyPick' };
      if (needsAllyPick) return { kind: 'allyPick' };
      if (needsEnemyPick) return { kind: 'enemyPick' };
      return { kind: 'auto' };
    }

    function battleSceneDebugApplySkill(actor, actorSide, skillIndex, targetSide, targetIndex) {
      if (!battleSceneDebugState || !actor) return false;
      if (battleSceneDebugGetStatus(actor, 'silence')) return false;
      const skills = Array.isArray(actor.skills) ? actor.skills : [];
      const skill = skills[skillIndex];
      if (!skill) return false;

      const cost = battleSceneDebugGetSkillCost(skill);
      if ((battleSceneDebugState.energy || 0) < cost) return false;

      battleSceneDebugState.energy -= cost;
      // E1 祝福：能量回响（施放技能后额外回能）—— 非远征时为 0
      const castBack = battleSceneDebugBlessSum('onCastEnergy');
      if (castBack > 0 && !actor.isEnemy) {
        battleSceneDebugState.energy = (battleSceneDebugState.energy || 0) + castBack;
        pushBattleSceneDebugFeed(`能量回响：回复 ${castBack} 点能量`);
      }
      // B9 音效：技能施放
      if (window.Game && Game.audio) Game.audio.sfx('skill');
      // B7 技能特写横幅（纯视觉，不影响任何数值）
      battleSceneDebugCast(actor, skill);

      const enemies = battleSceneDebugState.enemies;
      const allies = battleSceneDebugState.player;
      const pickList = (side) => (side === 'enemy' ? enemies : allies);
      const targetsFromType = (type) => {
        const aliveEnemies = enemies.filter(u => u && u.currentHp > 0);
        const aliveAllies = allies.filter(u => u && u.currentHp > 0);
        const aliveEnemiesFront = aliveEnemies.filter(u => (u.position || 'front') === 'front');
        const aliveEnemiesBack = aliveEnemies.filter(u => (u.position || 'front') !== 'front');
        const aliveAlliesFront = aliveAllies.filter(u => (u.position || 'front') === 'front');
        const aliveAlliesBack = aliveAllies.filter(u => (u.position || 'front') !== 'front');
        if (type === 'allEnemies') return aliveEnemies;
        if (type === 'allEnemiesFront') return aliveEnemiesFront.length ? aliveEnemiesFront : aliveEnemies;
        if (type === 'allEnemiesBack') return aliveEnemiesBack.length ? aliveEnemiesBack : aliveEnemies;
        if (type === 'allAllies') return aliveAllies;
        if (type === 'allAlliesFront') return aliveAlliesFront.length ? aliveAlliesFront : aliveAllies;
        if (type === 'allAlliesBack') return aliveAlliesBack.length ? aliveAlliesBack : aliveAllies;
        if (type === 'randomEnemies') return aliveEnemies.length ? [aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)]] : [];
        if (type === 'randomEnemiesFront') return (aliveEnemiesFront.length ? [aliveEnemiesFront[Math.floor(Math.random() * aliveEnemiesFront.length)]] : (aliveEnemies.length ? [aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)]] : []));
        if (type === 'randomEnemiesBack') return (aliveEnemiesBack.length ? [aliveEnemiesBack[Math.floor(Math.random() * aliveEnemiesBack.length)]] : (aliveEnemies.length ? [aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)]] : []));
        if (type === 'randomAllies') return aliveAllies.length ? [aliveAllies[Math.floor(Math.random() * aliveAllies.length)]] : [];
        if (type === 'enemyLowest') {
          if (!aliveEnemies.length) return [];
          return [aliveEnemies.sort((a, b) => (a.currentHp / a.maxHp) - (b.currentHp / b.maxHp))[0]];
        }
        if (type === 'allyLowest') {
          if (!aliveAllies.length) return [];
          return [aliveAllies.sort((a, b) => (a.currentHp / a.maxHp) - (b.currentHp / b.maxHp))[0]];
        }
        if (type === 'ally') return [actor];
        if (type === 'enemy') {
          const list2 = pickList(targetSide);
          const t = list2[targetIndex];
          return t && t.currentHp > 0 ? [t] : [];
        }
        if (type === 'allySelect') {
          const list2 = pickList(targetSide);
          const t = list2[targetIndex];
          return t && t.currentHp > 0 ? [t] : [];
        }
        return [];
      };

      const effects = Array.isArray(skill.effects) ? skill.effects : [];
      pushBattleSceneDebugFeed(`${actor.displayName || actor.name} 释放 ${skill.name || '技能'}（能量-${cost}）`);
      const ccOnce = { used: false };
      effects.forEach(effect => {
        if (!effect) return;
        const chance = typeof effect.chance === 'number' ? effect.chance : 100;
        const ccType = effect && effect.type === 'cc' ? effect.cc : '';
        const isAbsoluteCc = ccType === 'stun' || ccType === 'silence' || ccType === 'charm';
        if (!isAbsoluteCc && chance < 100 && Math.random() * 100 >= chance) return;
        const targetType = effect.target || 'enemy';

        if (effect.type === 'selfCost') {
          if (effect.costType === 'currentHpPct' && typeof effect.value === 'number') {
            const costHp = Math.floor(actor.currentHp * Math.min(95, effect.value) / 100);
            actor.currentHp = Math.max(1, actor.currentHp - costHp);
            pushBattleSceneDebugFeed(`${actor.displayName || actor.name} 消耗生命 ${costHp}`);
          }
          return;
        }

        if (effect.type === 'damage') {
          const hits = Math.max(1, effect.hits || 1);
          const ignoreDef = typeof effect.ignoreDef === 'number' ? effect.ignoreDef : 0;
          for (let h = 0; h < hits; h++) {
            const hitTargets = (targetType === 'randomEnemies' || targetType === 'randomAllies') ? targetsFromType(targetType) : targetsFromType(targetType);
            hitTargets.forEach(t => {
              if (!t || t.currentHp <= 0) return;
              if (effect.requireStatus && !battleSceneDebugGetStatus(t, effect.requireStatus)) return;
              if (Array.isArray(effect.requireStatusAny) && effect.requireStatusAny.length > 0) {
                if (!effect.requireStatusAny.some(s => s && battleSceneDebugGetStatus(t, s))) return;
              }
              const hpBelow = (typeof effect.requireHpBelow === 'number')
                ? effect.requireHpBelow
                : (typeof effect.requireTargetHpRateBelow === 'number' ? effect.requireTargetHpRateBelow : null);
              if (typeof hpBelow === 'number' && Number.isFinite(hpBelow)) {
                if ((t.currentHp / t.maxHp) > Math.max(0, Math.min(1, hpBelow))) return;
              }
              const scale = typeof effect.scale === 'number' ? effect.scale : 1.0;
              const scaleFrom = effect.scaleFrom || 'atk';
              const rawOverride =
                scaleFrom === 'maxHp' ? Math.floor((actor.maxHp || 0) * scale + (effect.addFlat || 0)) :
                scaleFrom === 'targetMaxHp' ? Math.floor((t.maxHp || 0) * scale + (effect.addFlat || 0)) :
                null;
              const { damage, crit } = battleSceneDebugApplyHit(actor, t, scale, '技能', { rawOverride, ignoreDef, ccOnce });
              if (damage > 0) setBattleSceneDebugHitFx(t.isEnemy ? 'enemy' : 'player', (t.isEnemy ? enemies : allies).indexOf(t), crit);
            });
          }
          return;
        }

        if (effect.type === 'trueDamage') {
          const hits = Math.max(1, effect.hits || 1);
          for (let h = 0; h < hits; h++) {
            const hitTargets = (targetType === 'randomEnemies' || targetType === 'randomAllies') ? targetsFromType(targetType) : targetsFromType(targetType);
            hitTargets.forEach(t => {
              if (!t || t.currentHp <= 0) return;
              if (effect.requireStatus && !battleSceneDebugGetStatus(t, effect.requireStatus)) return;
              if (Array.isArray(effect.requireStatusAny) && effect.requireStatusAny.length > 0) {
                if (!effect.requireStatusAny.some(s => s && battleSceneDebugGetStatus(t, s))) return;
              }
              const hpBelow = (typeof effect.requireHpBelow === 'number')
                ? effect.requireHpBelow
                : (typeof effect.requireTargetHpRateBelow === 'number' ? effect.requireTargetHpRateBelow : null);
              if (typeof hpBelow === 'number' && Number.isFinite(hpBelow)) {
                if ((t.currentHp / t.maxHp) > Math.max(0, Math.min(1, hpBelow))) return;
              }
              const scale = typeof effect.scale === 'number' ? effect.scale : 0.1;
              const scaleFrom = effect.scaleFrom || 'atk';
              const base =
                scaleFrom === 'targetMaxHp' ? (t.maxHp || 0) * scale :
                scaleFrom === 'maxHp' ? (actor.maxHp || 0) * scale :
                (actor.attack || 0) * scale;
              const amount = Math.max(1, Math.floor(base));
              const { dealt } = battleSceneDebugApplyDamage(t, amount);
              if (dealt > 0) {
                setBattleSceneDebugHitFx(t.isEnemy ? 'enemy' : 'player', (t.isEnemy ? enemies : allies).indexOf(t));
                battleSceneDebugAfterHit(actor, t, false, { ccOnce });
              }
            });
          }
          return;
        }

        if (effect.type === 'heal') {
          const scale = typeof effect.scale === 'number' ? effect.scale : 1.0;
          targetsFromType(targetType).forEach(t => {
            if (!t || t.currentHp <= 0) return;
            const amount = Math.max(1, Math.floor((actor.attack || 1) * scale));
            battleSceneDebugApplyHeal(t, amount);
          });
          return;
        }

        if (effect.type === 'buff' || effect.type === 'debuff') {
          const stat = effect.stat;
          const value = typeof effect.value === 'number' ? effect.value : 0;
          const turns = typeof effect.turns === 'number' ? effect.turns : 2;
          targetsFromType(targetType).forEach(t => {
            if (!t || t.currentHp <= 0) return;
            battleSceneDebugAddStatus(t, stat, value, turns);
          });
          return;
        }

        if (effect.type === 'dot') {
          const dot = effect.dot;
          const turns = typeof effect.turns === 'number' ? effect.turns : 2;
          const scale = typeof effect.scale === 'number' ? effect.scale : 0.1;
          const value = Math.max(1, Math.floor((actor.attack || 0) * scale));
          targetsFromType(targetType).forEach(t => {
            if (!t || t.currentHp <= 0) return;
            battleSceneDebugAddStatus(t, dot, value, turns);
          });
          return;
        }

        if (effect.type === 'shield') {
          const scale = typeof effect.scale === 'number' ? effect.scale : 0.5;
          const turns = typeof effect.turns === 'number' ? effect.turns : 2;
          targetsFromType(targetType).forEach(t => {
            if (!t || t.currentHp <= 0) return;
            const amount = Math.max(1, Math.floor((actor.attack || 1) * scale));
            t.shield = (t.shield || 0) + amount;
            battleSceneDebugAddStatus(t, 'shield', 1, turns);
          });
          return;
        }

        if (effect.type === 'energySteal') {
          const amount = Math.max(0, Math.floor(effect.amount || 1));
          if (battleSceneDebugState && amount > 0) battleSceneDebugState.energy = (battleSceneDebugState.energy || 0) + amount;
          return;
        }

        if (effect.type === 'execute') {
          const thresholdRaw = typeof effect.threshold === 'number' ? effect.threshold : 0.2;
          const threshold = Math.min(0.25, Math.max(0.05, thresholdRaw));
          let did = false;
          targetsFromType(targetType).forEach(t => {
            if (!t || t.currentHp <= 0) return;
            if (t.currentHp / t.maxHp <= threshold) {
              t.currentHp = 0;
              pushBattleSceneDebugFeed(`斩杀：${t.displayName || t.name} 被处决`);
              did = true;
            }
          });
          if (did) return;
        }

        if (effect.type === 'taunt') {
          battleSceneDebugAddStatus(actor, 'taunt', 1, typeof effect.turns === 'number' ? effect.turns : 2);
          return;
        }

        if (effect.type === 'cc') {
          const cc = effect.cc;
          const turns = typeof effect.turns === 'number' ? effect.turns : 1;
          const list = targetsFromType(targetType);
          const eligible = list.filter(t => t && t.currentHp > 0 && !battleSceneDebugGetStatus(t, 'ccImmune') && !battleSceneDebugGetStatus(t, `${cc}Immune`));
          if (eligible.length === 0) return;
          const isAbsolute = cc === 'stun' || cc === 'silence' || cc === 'charm';
          const picked = isAbsolute ? eligible[Math.floor(Math.random() * eligible.length)] : eligible[0];
          if (!picked) return;
          battleSceneDebugAddStatus(picked, cc, 1, turns);
          return;
        }

        if (effect.type === 'dispel') {
          const remove = Array.isArray(effect.statuses) ? effect.statuses : [];
          targetsFromType(targetType).forEach(t => {
            if (!t || t.currentHp <= 0) return;
            t.statuses = (t.statuses || []).filter(s => s && !remove.includes(s.type));
          });
          return;
        }
      });

      if (!actor.isEnemy && actor.id === battleSceneDebugCatLinkState.catId) battleSceneDebugTriggerStoredFollowUp();
      if (actor.passiveRuntime && actor.passiveRuntime.skillAtkStack) {
        const st = actor.passiveRuntime.skillAtkStack;
        if (st && st.max > 0 && st.value > 0 && (st.stacks || 0) < st.max) {
          st.stacks = (st.stacks || 0) + 1;
          actor.attack = Math.floor((actor.attack || 0) * (1 + st.value / 100));
          pushBattleSceneDebugFeed(`${actor.displayName || actor.name} 叠加剑意（${st.stacks}/${st.max}）`);
        }
      }
      return true;
    }

    /**
     * B8：受击反馈（顿挫 / 暴击冲击 + 镜头震动）
     * crit = true 时：单位卡走 .ui-bt--crit（更长更重），并给整个战斗层加 .ui-shake。
     * ⚠️ 一律走 state.hitFx 通道 —— render 会重建 innerHTML，直接加 class 会被抹掉。
     */
    function setBattleSceneDebugHitFx(side, index, crit) {
      if (!battleSceneDebugState) return;
      const isCrit = !!crit;
      battleSceneDebugState.hitFx = { side, index, until: Date.now() + (isCrit ? 420 : 240), crit: isCrit };
      renderBattleSceneDebug();
      if (isCrit) {
        const root = document.getElementById('battleSceneDebug');
        if (root) {
          root.classList.remove('ui-shake');
          // 强制重排以重启动画（连续暴击时不会"只震第一次"）
          void root.offsetWidth;
          root.classList.add('ui-shake');
          setTimeout(() => root.classList.remove('ui-shake'), 300);
        }
      }
      setTimeout(() => {
        if (!battleSceneDebugState) return;
        if (battleSceneDebugState.hitFx && battleSceneDebugState.hitFx.side === side && battleSceneDebugState.hitFx.index === index) {
          battleSceneDebugState.hitFx = null;
          renderBattleSceneDebug();
        }
      }, isCrit ? 440 : 260);
    }

    // 掉落结算 —— 单一实现：battle/rewards.js 的 rollRewards
    function battleSceneDebugRollRewards(stage, isWin) {
      return window.__battleRewards.rollRewards(stage, isWin);
    }

    // 战斗结算 —— 单一实现：battle/report.js 的 buildBattleLogs（日志渲染在模块内）
    //                    + battle/rewards.js 的 rollRewards（掉落）
    function battleSceneDebugToResult(stage, isWin) {
      const feed = (battleSceneDebugState && Array.isArray(battleSceneDebugState.feed) ? battleSceneDebugState.feed : []);
      const players = (battleSceneDebugState && battleSceneDebugState.player ? battleSceneDebugState.player : []).filter(Boolean);
      const enemies = (battleSceneDebugState && battleSceneDebugState.enemies ? battleSceneDebugState.enemies : []).filter(Boolean);
      const logs = window.__battleReport.buildBattleLogs({
        feed,
        players,
        enemies,
        stageName: stage && stage.name ? stage.name : '',
        isWin
      });
      return {
        isWin,
        rounds: Math.max(1, battleSceneDebugState ? battleSceneDebugState.round : 1),
        maxDamage: Math.max(0, battleSceneDebugState ? (battleSceneDebugState.maxDamage || 0) : 0),
        healing: Math.max(0, battleSceneDebugState ? (battleSceneDebugState.totalHealing || 0) : 0),
        // E3：累计伤害（周期挑战分数；其余战斗不读）
        totalDamage: Math.max(0, battleSceneDebugState ? (battleSceneDebugState.totalDamage || 0) : 0),
        logs,
        rewards: battleSceneDebugRollRewards(stage, isWin)
      };
    }

    function battleSceneDebugFinish(isWin) {
      if (!battleSceneDebugState) return;
      // B9 音效：胜负旋律（在 closeBattleSceneDebug 切回主城 BGM 前播）
      if (window.Game && Game.audio) Game.audio.sfx(isWin ? 'victory' : 'defeat');
      battleSceneDebugState.running = false;
      battleSceneDebugSyncControls();
      const stage = stagesData.find(s => s && s.id === battleSceneDebugState.stageId);
      // E1 远征：战斗结束即回写队伍血量（跨节点累计）—— 必须在 closeBattleSceneDebug 前
      if (window.__expedition && typeof window.__expedition.captureTeam === 'function') {
        window.__expedition.captureTeam(battleSceneDebugState.player || []);
      }
      // E3 周期挑战：回写本场累计伤害（分数）—— 同样必须在 closeBattleSceneDebug 前
      if (window.__challenge && typeof window.__challenge.captureDamage === 'function') {
        window.__challenge.captureDamage(
          battleSceneDebugState.totalDamage || 0,
          battleSceneDebugState.maxDamage || 0,
          isWin
        );
      }
      // E4 多队远征：回写本队血量（跨层累计）
      if (window.__squads && typeof window.__squads.captureTeam === 'function') {
        window.__squads.captureTeam(battleSceneDebugState.player || [], isWin);
      }
      const result = battleSceneDebugToResult(stage, isWin);
      closeBattleSceneDebug();
      if (stage) showBattleResult(stage, result, false);
      // C5：只有取胜才计入今日目标（败北不记，避免"刷失败"完成任务）
      if (isWin) {
        if (typeof window.bumpGoal === 'function') window.bumpGoal('battle', 1);
        if (typeof window.renderDailyGoals === 'function') window.renderDailyGoals();
        if (typeof window.refreshRedDots === 'function') window.refreshRedDots();
      }
    }

    function battleSceneDebugStepOnce() {
      if (!battleSceneDebugState) return;
      if (aliveCount(battleSceneDebugState.player) === 0 || aliveCount(battleSceneDebugState.enemies) === 0) {
        battleSceneDebugFinish(aliveCount(battleSceneDebugState.player) > 0);
        return;
      }
      if (battleSceneDebugState.awaitingTarget) return;

      if (battleSceneDebugState.turnCursor >= battleSceneDebugState.turnOrder.length) {
        battleSceneDebugApplyRoundEndPassives();
        battleSceneDebugInitRound(false);
        return;
      }

      const turn = battleSceneDebugState.turnOrder[battleSceneDebugState.turnCursor];
      if (!turn) {
        battleSceneDebugState.turnCursor += 1;
        return;
      }

      const actorList = turn.side === 'enemy' ? battleSceneDebugState.enemies : battleSceneDebugState.player;
      const actor = actorList[turn.index];
      if (!actor || !(actor.currentHp > 0)) {
        battleSceneDebugState.turnCursor += 1;
        return;
      }

      battleSceneDebugTickTurnStart(actor);
      if (!(actor.currentHp > 0)) {
        pushBattleSceneDebugFeed(`${actor.displayName || actor.name} 已倒下`);
        battleSceneDebugState.turnCursor += 1;
        renderBattleSceneDebug();
        return;
      }

      const stun = battleSceneDebugGetStatus(actor, 'stun');
      if (stun) {
        pushBattleSceneDebugFeed(`${actor.displayName || actor.name} 被眩晕，无法行动`);
        battleSceneDebugTickAfterAction(actor);
        battleSceneDebugState.turnCursor += 1;
        renderBattleSceneDebug();
        return;
      }

      const charm = battleSceneDebugGetStatus(actor, 'charm');
      if (charm) {
        const allies = turn.side === 'enemy' ? battleSceneDebugState.enemies : battleSceneDebugState.player;
        const candidates = allies.filter(u => u && u.currentHp > 0 && u !== actor);
        const target = candidates.length ? battleSceneDebugChooseTarget(actor, candidates, { basic: true }) : null;
        if (!target) {
          pushBattleSceneDebugFeed(`${actor.displayName || actor.name} 被魅惑，但没有可攻击目标`);
        } else {
            battleSceneDebugApplyHit(actor, target, 1.0, '魅惑', { ccOnce: { used: false } });
            setBattleSceneDebugHitFx(turn.side, allies.indexOf(target));
        }
        battleSceneDebugTickAfterAction(actor);
        battleSceneDebugState.turnCursor += 1;
        renderBattleSceneDebug();
        if (aliveCount(battleSceneDebugState.player) === 0 || aliveCount(battleSceneDebugState.enemies) === 0) {
          battleSceneDebugFinish(aliveCount(battleSceneDebugState.player) > 0);
        }
        return;
      }

      // C9 切片 3：混合模式（自动 + 手动大招）—— 轮到我方且能量够放技能时暂停，
      // 由玩家决定放不放/放谁；能量不够或没技能时照旧 AI 自动行动，不烦玩家。
      if (turn.side === 'player' && battleSceneDebugState.auto && battleSceneDebugState.manualUlt) {
        const aliveEnemy2 = battleSceneDebugState.enemies.some(u => u && u.currentHp > 0);
        if (aliveEnemy2 && battleSceneDebugCanManualUlt(actor)) {
          battleSceneDebugState.awaitingTarget = { actorIndex: turn.index, actionType: 'basic', skillIndex: null, pickSide: 'enemy', ultPause: true };
          pushBattleSceneDebugFeed(`⏸ 等待指挥：${actor.displayName || actor.name} 能量充足，请决定技能释放（也可交给 AI）`);
          battleSceneDebugState.running = false;
          battleSceneDebugSyncControls();
          renderBattleSceneDebug();
          return;
        }
      }

      if (turn.side === 'player' && !battleSceneDebugState.auto) {
        const aliveEnemy = battleSceneDebugState.enemies.some(u => u && u.currentHp > 0);
        if (!aliveEnemy) return;
        battleSceneDebugState.awaitingTarget = { actorIndex: turn.index, actionType: 'basic', skillIndex: null, pickSide: 'enemy' };
        pushBattleSceneDebugFeed(`等待操作：${actor.displayName || actor.name} 请选择行动与目标`);
        renderBattleSceneDebug();
        battleSceneDebugState.running = false;
        battleSceneDebugSyncControls();
        return;
      }

      if (turn.side === 'enemy') {
        const target = battleSceneDebugChooseTarget(actor, battleSceneDebugState.player, { basic: true });
        if (!target) return;
        battleSceneDebugApplyHit(actor, target, 1.0, '普攻', { ccOnce: { used: false } });
        setBattleSceneDebugHitFx('player', battleSceneDebugState.player.indexOf(target));
        battleSceneDebugTickAfterAction(actor);
        battleSceneDebugState.turnCursor += 1;
        renderBattleSceneDebug();
        if (aliveCount(battleSceneDebugState.player) === 0 || aliveCount(battleSceneDebugState.enemies) === 0) {
          battleSceneDebugFinish(aliveCount(battleSceneDebugState.player) > 0);
        }
        return;
      }

      battleSceneDebugAutoAct(actor);
    }

    /* ── C9 切片 3：我方 AI 行动（单源）─────────────────────────
       自动模式每步、混合模式"AI 代打"按钮都走这里：优先放技能（能量够且未被沉默），
       否则普攻；收尾统一做 tick/推进/渲染/胜负判定。 */
    /* D1 战术技（第 2 技能）：AI 选技策略 —— 全仓唯一决策点
       规则：放得起的技能里优先 cost 最高的（大招优先）；若「再攒约 1 回合就够放大招」则本回合
       普攻攒能量 —— 否则低费战术技会把高费大招活活饿死（能量 3 → 放 2 费小技 → 剩 1 → 永远到不了 4）。
       ⚠️ AUTO_SAVE_GAP ≈ 每回合基础能量增长（2）。改能量规则时这里要一起看。*/
    const AUTO_SAVE_GAP = 2;

    function battleSceneDebugPickAutoSkill(actor, energy) {
      const skills = Array.isArray(actor && actor.skills) ? actor.skills : [];
      const cand = [];
      for (let i = 0; i < skills.length; i++) {
        if (!skills[i]) continue;
        const cost = battleSceneDebugGetSkillCost(skills[i]);
        if (cost > 0) cand.push({ i, cost });
      }
      if (!cand.length) return -1;
      // cost 降序；同 cost 取靠前的（= 主技优先于战术技）
      cand.sort((a, b) => (b.cost - a.cost) || (a.i - b.i));
      const big = cand[0];
      if (energy >= big.cost) return big.i;
      if (big.cost - energy <= AUTO_SAVE_GAP) return -1;   // 攒一手
      const alt = cand.find(x => energy >= x.cost);
      return alt ? alt.i : -1;
    }

    function battleSceneDebugCanManualUlt(actor) {
      if (!actor || !(actor.currentHp > 0)) return false;
      if (battleSceneDebugGetStatus(actor, 'silence')) return false;
      const skills = Array.isArray(actor.skills) ? actor.skills : [];
      // D1：任一技能放得起就能手动（不再只判 skills[0]）
      for (let i = 0; i < skills.length; i++) {
        if (!skills[i]) continue;
        const cost = battleSceneDebugGetSkillCost(skills[i]);
        if (cost > 0 && (battleSceneDebugState.energy || 0) >= cost) return true;
      }
      return false;
    }

    function battleSceneDebugAutoAct(actor) {
      if (!battleSceneDebugState || !actor) return;
      const energy = battleSceneDebugState.energy || 0;
      const silenced = battleSceneDebugGetStatus(actor, 'silence');
      let used = false;
      // D1：多技能选技（唯一决策点 battleSceneDebugPickAutoSkill）
      if (!silenced) {
        const sIdx = battleSceneDebugPickAutoSkill(actor, energy);
        if (sIdx >= 0) {
          const spec = battleSceneDebugGetSkillTargetSpec(actor.skills[sIdx]);
          if (spec.kind === 'enemyPick') {
            const t = battleSceneDebugChooseTarget(actor, battleSceneDebugState.enemies);
            if (t) {
              const idx = battleSceneDebugState.enemies.indexOf(t);
              used = battleSceneDebugApplySkill(actor, 'player', sIdx, 'enemy', idx);
            }
          } else if (spec.kind === 'allyPick') {
            const allies = battleSceneDebugState.player.filter(u => u && u.currentHp > 0);
            const lowest = allies.sort((a, b) => (a.currentHp / a.maxHp) - (b.currentHp / b.maxHp))[0] || null;
            const idx = lowest ? battleSceneDebugState.player.indexOf(lowest) : -1;
            if (idx >= 0) used = battleSceneDebugApplySkill(actor, 'player', sIdx, 'player', idx);
          } else {
            used = battleSceneDebugApplySkill(actor, 'player', sIdx, 'enemy', 0);
          }
        }
      }
      if (!used) {
        const target = battleSceneDebugChooseTarget(actor, battleSceneDebugState.enemies, { basic: true });
        if (!target) return;
        const mult =
          actor.class === 'assassin' ? 1.1 :
          actor.class === 'warrior' ? 1.0 :
          actor.class === 'archer' ? 1.0 :
          actor.class === 'mage' ? 1.0 :
          1.0;
        battleSceneDebugApplyHit(actor, target, mult, '普攻', { ccOnce: { used: false } });
        setBattleSceneDebugHitFx('enemy', battleSceneDebugState.enemies.indexOf(target));
      }
      battleSceneDebugTickAfterAction(actor);
      battleSceneDebugState.turnCursor += 1;
      renderBattleSceneDebug();
      if (aliveCount(battleSceneDebugState.player) === 0 || aliveCount(battleSceneDebugState.enemies) === 0) {
        battleSceneDebugFinish(aliveCount(battleSceneDebugState.player) > 0);
      }
    }

  // ── 对外暴露 ──────────────────────────────────────────────────────
  // 内联脚本与 HTML 事件属性都按裸标识符/window 属性解析，故逐个显式挂载。
  window.battleSceneDebugApplyShellUI = battleSceneDebugApplyShellUI;
  window.battleSceneDebugRestoreShellUI = battleSceneDebugRestoreShellUI;
  window.openBattleSceneDebug = openBattleSceneDebug;
  window.closeBattleSceneDebug = closeBattleSceneDebug;
  window.battleSceneDebugSyncControls = battleSceneDebugSyncControls;
  window.battleSceneDebugAutoAct = battleSceneDebugAutoAct;   // C9 切片 3：AI 代打路径，调试工具/回归脚本直接调用
  window.battleSceneDebugPickAutoSkill = battleSceneDebugPickAutoSkill; // D1：多技能选技（唯一决策点）
  window.pushBattleSceneDebugFeed = pushBattleSceneDebugFeed;
  window.renderBattleSceneDebug = renderBattleSceneDebug;
  window.aliveCount = aliveCount;
  window.battleSceneDebugInitRound = battleSceneDebugInitRound;
  window.battleSceneDebugRunBossRound = battleSceneDebugRunBossRound;
  window.buildBattleSceneDebugTurnOrder = buildBattleSceneDebugTurnOrder;
  window.onBattleSceneDebugUnitClick = onBattleSceneDebugUnitClick;
  window.pickRandomAlive = pickRandomAlive;
  window.battleSceneDebugGetStatus = battleSceneDebugGetStatus;
  window.battleSceneDebugGetStatusValue = battleSceneDebugGetStatusValue;
  window.battleSceneDebugAddStatus = battleSceneDebugAddStatus;
  window.battleSceneDebugTickRound = battleSceneDebugTickRound;
  window.battleSceneDebugTickAfterAction = battleSceneDebugTickAfterAction;
  window.battleSceneDebugGetStage = battleSceneDebugGetStage;
  window.battleSceneDebugAffixValue = battleSceneDebugAffixValue;
  window.battleSceneDebugApplyRoundStartPassives = battleSceneDebugApplyRoundStartPassives;
  window.battleSceneDebugApplyRoundEndPassives = battleSceneDebugApplyRoundEndPassives;
  window.battleSceneDebugGetTeamUnit = battleSceneDebugGetTeamUnit;
  window.battleSceneDebugInitCoreIfNeeded = battleSceneDebugInitCoreIfNeeded;
  window.battleSceneDebugGiveCoreEnergy = battleSceneDebugGiveCoreEnergy;
  window.battleSceneDebugTriggerLimitField = battleSceneDebugTriggerLimitField;
  window.battleSceneDebugMaybeTriggerCore = battleSceneDebugMaybeTriggerCore;
  window.battleSceneDebugInitCatLinkIfNeeded = battleSceneDebugInitCatLinkIfNeeded;
  window.battleSceneDebugGetCatLinkInfo = battleSceneDebugGetCatLinkInfo;
  window.battleSceneDebugTryPreventLifeLinkDeath = battleSceneDebugTryPreventLifeLinkDeath;
  window.battleSceneDebugTransferLifeLink = battleSceneDebugTransferLifeLink;
  window.battleSceneDebugTriggerStoredFollowUp = battleSceneDebugTriggerStoredFollowUp;
  window.battleSceneDebugUpdateRainFlowerBondState = battleSceneDebugUpdateRainFlowerBondState;
  window.battleSceneDebugApplyBonds = battleSceneDebugApplyBonds;
  window.computeDebugDamage = computeDebugDamage;
  window.battleSceneDebugParsePassiveText = battleSceneDebugParsePassiveText;
  window.battleSceneDebugApplyHit = battleSceneDebugApplyHit;
  window.battleSceneDebugAfterHit = battleSceneDebugAfterHit;
  window.battleSceneDebugChooseTarget = battleSceneDebugChooseTarget;
  window.battleSceneDebugTickTurnStart = battleSceneDebugTickTurnStart;
  window.battleSceneDebugApplyDamage = battleSceneDebugApplyDamage;
  window.battleSceneDebugApplyHeal = battleSceneDebugApplyHeal;
  window.battleSceneDebugGetSkillCost = battleSceneDebugGetSkillCost;
  window.battleSceneDebugGetSkillTargetSpec = battleSceneDebugGetSkillTargetSpec;
  window.battleSceneDebugApplySkill = battleSceneDebugApplySkill;
  window.setBattleSceneDebugHitFx = setBattleSceneDebugHitFx;
  window.battleSceneDebugRollRewards = battleSceneDebugRollRewards;
  window.battleSceneDebugToResult = battleSceneDebugToResult;
  window.battleSceneDebugFinish = battleSceneDebugFinish;
  window.battleSceneDebugStepOnce = battleSceneDebugStepOnce;

  /* ── 状态的对外兼容暴露（P2b） ──
   * 全局对象的访问器属性会被标识符查找命中，因此定义 window.battleSceneDebugState 之后，
   * 控制台 / CDP / tools/*.mjs 里写 `battleSceneDebugState` 依旧可读可写，
   * 与它当年作为 index.html 顶层 `let` 时的手感一致。
   * enumerable:false —— 避免污染 `for (const k in window)` 之类的枚举。
   */
  [
    ['battleSceneDebugState', () => battleSceneDebugState, (v) => { battleSceneDebugState = v; }],
    ['battleSceneDebugCoreState', () => battleSceneDebugCoreState, (v) => { battleSceneDebugCoreState = v; }],
    ['battleSceneDebugCatLinkState', () => battleSceneDebugCatLinkState, (v) => { battleSceneDebugCatLinkState = v; }],
    ['battleSceneDebugRainFlowerBondState', () => battleSceneDebugRainFlowerBondState, (v) => { battleSceneDebugRainFlowerBondState = v; }]
  ].forEach(([name, get, set]) => {
    Object.defineProperty(window, name, { configurable: true, enumerable: false, get, set });
  });

  /** 4 个战斗状态的只读快照（引用语义，勿直接改；要改走 setState 或对应函数）。 */
  const getState = () => ({
    scene: battleSceneDebugState,
    core: battleSceneDebugCoreState,
    catLink: battleSceneDebugCatLinkState,
    rainFlowerBond: battleSceneDebugRainFlowerBondState
  });

  /** 局部更新战斗状态（仅覆盖传入的键），返回更新后的快照。调试 / 测试用。 */
  const setState = (patch) => {
    if (!patch || typeof patch !== 'object') return getState();
    if ('scene' in patch) battleSceneDebugState = patch.scene;
    if ('core' in patch) battleSceneDebugCoreState = patch.core;
    if ('catLink' in patch) battleSceneDebugCatLinkState = patch.catLink;
    if ('rainFlowerBond' in patch) battleSceneDebugRainFlowerBondState = patch.rainFlowerBond;
    return getState();
  };

  const api = {
    enterBattle,
    battleSceneDebugStep,
    resolveBattleSceneDebugPlayerAction,
    toggleBattleSceneDebugRun,
    runBattleSceneDebugLoop,
    getState,
    setState
  };
  if (window.Game && window.Game.battle) {
    window.Game.battle.scene = api;
    window.Game.battle.enterBattle = enterBattle;
  }
  window.__battleScene = api;
  window.__battleEntry = api;
})();
