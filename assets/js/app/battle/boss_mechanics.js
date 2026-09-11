/**
 * BOSS 关卡机制 —— **唯一真相源**（A1 战斗层单源化的第一步）
 * ------------------------------------------------------------------
 * 合并了原先散落在两处的实现：
 *   1. `simulateBattleLive` 内联的 processBossScripts / processBossPhases / summonAdds / 狂暴
 *   2. `battle/boss_scripts.js` 的 6 个独立脚本（sky_rift 等）
 * 现在战斗（唯一引擎 = 可视化引擎，旧引擎 simulateBattleLive 已于 A1 退役）
 * 必须通过本模块执行 BOSS 机制，不允许再写一份 —— 这是"同一关卡两种打法结果不同"的根源之一。
 *
 * ⚠️ 本模块**不依赖 DOM，也不依赖任何全局战斗状态**。
 *    宿主（驱动方）通过 ctx.api 注入能力，因此两套引擎可以共用同一份规则。
 *
 * ctx 契约：
 *   { boss, m, round, team, enemies, namePrefix, api }
 *   api = {
 *     addStatus(unit, type, value, turns, meta?),
 *     getStatus(unit, type) -> status|null,
 *     getStatusValue(unit, type) -> number,
 *     applyHit(attacker, target, multiplier, label, opts?) -> void,   // 走驱动方伤害管线（含闪避/暴击/护盾/特化生命）
 *     log(html) -> void,                                              // 战斗日志/播报
 *     key() -> void,                                                  // 标记关键事件（高亮/触发特效）
 *     vfx(type) -> void,                                              // 'ultimate' | 'slam' | 'danger' | 'crit'
 *     affixValue(id) -> number                                        // 关卡词条，可选
 *   }
 *
 * 导出（window.Game.battle.bossMechanics / window.__bossMechanics）：
 *   runRound(ctx)   —— 回合开始总入口：狂暴 → 逐个首领脚本 → 阶段/召唤。返回是否处理过任何首领
 *   runScript(ctx)  —— 单个首领的脚本
 *   runPhases(ctx)  —— 单个首领的阶段阈值与召唤
 *   runEnrage(ctx)  —— 狂暴（回合数达到 enrageRound 后全体首领加攻）
 *   SCRIPT_IDS      —— 支持的脚本 id 列表
 */
(() => {
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const pick = (arr) => (Array.isArray(arr) && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);
  const alive = (arr) => (Array.isArray(arr) ? arr.filter((u) => u && u.currentHp > 0) : []);
  const lowestHpRate = (arr) => alive(arr).slice().sort((a, b) => (a.currentHp / a.maxHp) - (b.currentHp / b.maxHp))[0] || null;
  const highestAtk = (arr) => alive(arr).slice().sort((a, b) => (b.attack || 0) - (a.attack || 0))[0] || null;

  const SCRIPT_IDS = [
    'element_trial', 'abyss_sacrifice', 'dragon_roar', 'machine_protocol', 'void_phase',
    'sky_rift', 'astral_prism', 'tide_titan', 'magma_overload', 'sanctuary_judgement', 'divine_echo',
  ];

  function ensureState(boss) {
    if (!boss.bossState) boss.bossState = { triggers: {} };
    if (!boss.bossState.triggers) boss.bossState.triggers = {};
    return boss.bossState;
  }

  /** 真实伤害：无视防御/护盾/特化生命 */
  function trueDamage(ctx, target, amount, logHtml) {
    if (!target || !(target.currentHp > 0)) return 0;
    const dmg = Math.max(0, Math.floor(amount));
    if (logHtml) ctx.api.log(logHtml);
    target.currentHp = Math.max(0, target.currentHp - dmg);
    if (logHtml) ctx.api.key();
    if (target.currentHp <= 0) {
      ctx.api.log(`<div class="text-gray-500">[${target.displayName || target.name}] 已倒下</div>`);
      ctx.api.key();
    }
    return dmg;
  }

  /** 首领召唤援军（阶段推进时调用） */
  function summonAdds(ctx, boss) {
    const { m, enemies, api } = ctx;
    if (!m || !m.summonCount) return;
    const boost = typeof api.affixValue === 'function' ? api.affixValue('summonBoost') : 0;
    const count = m.summonCount + (boost > 0 ? Math.floor(m.summonCount * boost / 100) : 0);
    const prefix = ctx.namePrefix || '首领';
    for (let i = 0; i < count; i++) {
      const hp = Math.floor(boss.maxHp * 0.22);
      const slot = {
        id: `${boss.id}_add_${ctx.round}_${i}_${Date.now()}`,
        name: `${prefix}·爪牙`,
        rarity: 'ENEMY',
        class: i % 2 === 0 ? 'assassin' : 'mage',
        position: 'front',
        isPlayer: false,
        isEnemy: true,
        isBoss: false,
        bossState: null,
        bossMechanics: null,
        displayName: `${prefix}·爪牙`,
        imageUrl: '',
        skills: [{ id: `${boss.id}_add_skill_${i}`, name: '爪牙袭击', cooldown: 4 }],
        attack: Math.floor(boss.attack * 0.55),
        defense: Math.floor(boss.defense * 0.55),
        health: hp,
        speed: Math.floor(boss.speed * 1.05),
        critRate: 8,
        critDmg: 150,
        dodgeRate: 4,
        blockRate: 4,
        dmgReduc: 0,
        lifesteal: 0,
        effectHit: 10,
        penetration: 8,
        tenacity: 8,
        currentHp: hp,
        maxHp: hp,
        shield: 0,
        enhancedHp: 0,
        enhancedHpMax: 0,
        statuses: [],
        skillCd: 0,
        energy: 0,
        maxEnergy: 4,
      };
      // 优先填充空位（正式引擎的阵位数组含 null 占位，直接 push 会落到第 7 位之后看不见）
      const hole = enemies.findIndex((u) => !u);
      if (hole >= 0) enemies[hole] = slot;
      else enemies.push(slot);
    }
    api.log(`<div class="text-purple-300 font-black">首领召唤了援军！</div>`);
    api.key();
  }

  /** 阶段阈值：血量跌破阈值时强化 + 免疫 + 护盾 + 召唤 */
  function runPhases(ctx) {
    const { boss, m, api } = ctx;
    const st = ensureState(boss);
    const hpRate = boss.maxHp > 0 ? boss.currentHp / boss.maxHp : 0;
    (m.phaseThresholds || []).forEach((th, idx) => {
      const key = `p${idx}`;
      if (st.triggers[key]) return;
      if (hpRate <= th) {
        st.triggers[key] = true;
        boss.attack = Math.floor(boss.attack * (1 + (m.phaseAtkUp || 0) / 100));
        boss.defense = Math.floor(boss.defense * (1 + (m.phaseDefUp || 0) / 100));
        boss.speed = Math.floor(boss.speed * (1 + (m.phaseSpeedUp || 0) / 100));
        api.addStatus(boss, 'immune', 1, m.immuneTurns || 1);
        boss.shield = (boss.shield || 0) + Math.floor(boss.maxHp * 0.12);
        api.log(`<div class="text-purple-300 font-black">首领进入阶段 ${idx + 2}：获得免疫与护盾，属性提升！</div>`);
        api.key();
        summonAdds(ctx, boss);
      }
    });
  }

  /** 狂暴：回合数达到 enrageRound 后，全体存活首领永久 +25% 攻击 */
  function runEnrage(ctx) {
    const { round, enemies, api } = ctx;
    const enrageRound = (ctx.enrageRound || 8);
    if (round < enrageRound) return false;
    const bosses = enemies.filter((e) => e && e.currentHp > 0 && e.isBoss);
    if (!bosses.length) return false;
    bosses.forEach((b) => {
      if (b.bossState && b.bossState.enrageMarked) return;
      ensureState(b).enrageMarked = true;
      api.addStatus(b, 'atkUp', 25, 99);
    });
    return true;
  }

  /** 单个首领的脚本（11 个 scriptId） */
  function runScript(ctx) {
    const { boss, m, round, team, api } = ctx;
    const scriptId = m && m.scriptId;
    if (!scriptId) return false;
    const st = ensureState(boss);

    if (scriptId === 'element_trial') {
      const order = ['burn', 'poison', 'bleed'];
      const idx = ((st.elementIdx) || 0) % order.length;
      const nextIdx = (idx + 1) % order.length;
      st.elementIdx = nextIdx;
      const resist = m.elementResist || 40;
      const type = order[nextIdx];
      st.elementType = type;
      boss.statuses = (boss.statuses || []).filter((s) => !['burnResist', 'poisonResist', 'bleedResist'].includes(s.type));
      api.addStatus(boss, `${type}Resist`, resist, 999);
      api.log(`<div class="text-yellow-300 font-black">元素轮转：首领获得${type === 'burn' ? '灼烧' : (type === 'poison' ? '中毒' : '流血')}抗性</div>`);
      api.key();
      if (round % 2 === 0) {
        api.log(`<div class="text-yellow-300 font-black">元素爆裂：首领引爆元素能量！</div>`);
        alive(team).forEach((t) => {
          api.applyHit(boss, t, 1.15, '元素爆裂');
          api.addStatus(t, type, Math.floor(boss.attack * 0.12), 2);
        });
        api.key();
      }
      return true;
    }

    if (scriptId === 'abyss_sacrifice') {
      const addsAlive = ctx.enemies.filter((x) => x && x.currentHp > 0 && !x.isBoss && String(x.id).startsWith(`${boss.id}_add_`)).length;
      if (addsAlive > 0) {
        const healPct = m.sacrificeHealPct || 4;
        const heal = Math.floor(boss.maxHp * healPct / 100);
        boss.currentHp = Math.min(boss.maxHp, boss.currentHp + heal);
        api.addStatus(boss, 'dmgReducUp', 20, 2);
        api.log(`<div class="text-purple-300 font-black">深渊献祭：首领吞噬爪牙，回复 ${heal} 并获得减伤</div>`);
        api.key();
      }
      if (round % 3 === 0) {
        api.log(`<div class="text-purple-300 font-black">腐化诅咒：我方治疗与攻击被压制</div>`);
        alive(team).forEach((t) => {
          api.addStatus(t, 'healDownDebuff', 25, 2);
          api.addStatus(t, 'atkUp', -20, 2);
        });
        api.key();
      }
      return true;
    }

    if (scriptId === 'dragon_roar') {
      const every = m.roarEvery || 3;
      if (round % every === 0) {
        const target = lowestHpRate(team);
        if (target) {
          const chance = m.roarStunChance || 35;
          if (Math.random() * 100 < chance) {
            api.addStatus(target, 'stun', 1, 1);
            api.log(`<div class="text-purple-300 font-black">龙吼压制：${target.displayName || target.name} 被眩晕</div>`);
          } else {
            api.addStatus(target, 'spdDown', 20, 2);
            api.log(`<div class="text-purple-300 font-black">龙吼压制：${target.displayName || target.name} 速度降低</div>`);
          }
          api.key();
        }
      }
      if (round % 2 === 0) {
        api.log(`<div class="text-purple-300 font-black">龙炎吐息：全体受到灼烧</div>`);
        alive(team).forEach((t) => {
          api.applyHit(boss, t, 1.10, '龙炎吐息');
          api.addStatus(t, 'burn', Math.floor(boss.attack * 0.10), 2);
        });
        api.key();
      }
      return true;
    }

    if (scriptId === 'machine_protocol') {
      if (!st.triggers.protocolInit) {
        st.triggers.protocolInit = true;
        boss.shield = (boss.shield || 0) + Math.floor(boss.maxHp * (m.protocolShieldPct || 15) / 100);
        api.addStatus(boss, 'ccImmune', 1, 999);
        api.log(`<div class="text-purple-300 font-black">机械协议：首领启动护盾并免疫控制</div>`);
        api.key();
      }
      if ((boss.shield || 0) <= 0) {
        boss.statuses = (boss.statuses || []).filter((s) => s.type !== 'ccImmune');
      }
      if (round % 4 === 0 && (boss.shield || 0) <= 0) {
        boss.shield = (boss.shield || 0) + Math.floor(boss.maxHp * (m.protocolShieldPct || 15) / 100);
        api.addStatus(boss, 'ccImmune', 1, 999);
        api.log(`<div class="text-purple-300 font-black">机械协议：护盾重构</div>`);
        api.key();
      }
      if (round % 3 === 0) {
        api.log(`<div class="text-purple-300 font-black">磁暴脉冲：封锁我方技能</div>`);
        const t = pick(alive(team));
        if (t) api.addStatus(t, 'silence', 1, 1);
        alive(team).forEach((x) => api.applyHit(boss, x, 1.05, '磁暴脉冲'));
        api.key();
      }
      return true;
    }

    if (scriptId === 'void_phase') {
      if (round % 4 === 0) {
        api.addStatus(boss, 'immune', 1, 1);
        api.addStatus(boss, 'atkUp', 25, 2);
        api.log(`<div class="text-purple-300 font-black">虚空相位：首领短暂无敌并强化攻击</div>`);
        api.key();
      }
      if (round % 3 === 0) {
        const t = lowestHpRate(team);
        if (t) {
          const amount = Math.max(1, Math.floor(t.maxHp * 0.22));
          trueDamage(ctx, t, amount, `<div class="text-purple-300 font-black">虚空切割：对 <span class="text-blue-300">${t.displayName || t.name}</span> 造成真实伤害 <span class="text-red-500 font-black">${amount}</span></div>`);
        }
      }
      return true;
    }

    if (scriptId === 'sky_rift') {
      if (round % 4 === 3 && !st.triggers[`sky_charge_${round}`]) {
        st.triggers[`sky_charge_${round}`] = true;
        api.addStatus(boss, 'dmgReducUp', 25, 1);
        api.addStatus(boss, 'dodgeUp', 18, 1);
        api.log(`<div class="text-purple-300 font-black">天穹裂隙：首领撕开天空裂缝，正在蓄力…</div>`);
        api.vfx('ultimate');
        api.key();
      }
      if (round % 4 === 0 && !st.triggers[`sky_release_${round}`]) {
        st.triggers[`sky_release_${round}`] = true;
        api.log(`<div class="text-purple-300 font-black">天穹裂隙：裂空斩落下！全体受到冲击</div>`);
        api.vfx('slam');
        alive(team).forEach((t) => {
          api.applyHit(boss, t, 1.20, '裂空斩');
          api.addStatus(t, 'spdDown', 18, 2);
          api.addStatus(t, 'shock', Math.floor(boss.attack * 0.10), 2);
        });
        api.key();
      }
      if (round % 2 === 0) {
        const t = pick(alive(team));
        if (t) {
          api.log(`<div class="text-purple-300 font-black">天穹裂隙：裂隙射线命中 <span class="text-blue-300">${t.displayName || t.name}</span></div>`);
          api.applyHit(boss, t, 1.05, '裂隙射线');
          api.addStatus(t, 'silence', 1, 1);
          api.key();
        }
      }
      return true;
    }

    if (scriptId === 'astral_prism') {
      if (!st.triggers.prismInit) {
        st.triggers.prismInit = true;
        boss.shield = (boss.shield || 0) + Math.floor(boss.maxHp * clamp((m.protocolShieldPct || 14) / 100, 0.08, 0.22));
        boss.passive = boss.passive || {};
        boss.passive.reflectPct = Math.max(boss.passive.reflectPct || 0, 12);
        api.log(`<div class="text-purple-300 font-black">星棱棱镜：首领展开棱镜护盾并获得反伤</div>`);
        api.vfx('ultimate');
        api.key();
      }
      if (round % 3 === 0) {
        const t = highestAtk(team) || pick(alive(team));
        if (t) {
          const raw = Math.floor(Math.max(1, boss.attack * 0.88));
          trueDamage(ctx, t, raw, `<div class="text-purple-300 font-black">星棱光束：锁定 <span class="text-blue-300">${t.displayName || t.name}</span>，造成真实伤害 <span class="text-red-500 font-black">${raw}</span></div>`);
          api.vfx('danger');
        }
      }
      if (round % 2 === 0) {
        api.addStatus(boss, 'atkUp', 18, 1);
        api.addStatus(boss, 'dmgReducUp', 12, 1);
      }
      return true;
    }

    if (scriptId === 'tide_titan') {
      if (!st.tide) st.tide = { mode: 'highTide', stacks: 0 };
      st.tide.stacks += 1;
      const mode = st.tide.stacks % 2 === 0 ? 'ebb' : 'highTide';
      st.tide.mode = mode;
      if (mode === 'highTide') {
        api.addStatus(boss, 'atkUp', 22, 1);
        api.addStatus(boss, 'spdUp', 12, 1);
        api.log(`<div class="text-purple-300 font-black">潮汐巨像：涨潮！首领攻击与速度提升</div>`);
      } else {
        api.addStatus(boss, 'dmgReducUp', 18, 1);
        api.addStatus(boss, 'defDown', -20, 1);
        api.log(`<div class="text-purple-300 font-black">潮汐巨像：退潮！首领强化防御并蓄势</div>`);
      }
      api.key();
      if (round % 3 === 0) {
        api.log(`<div class="text-purple-300 font-black">海啸：全体受到冲刷并降低速度</div>`);
        api.vfx('ultimate');
        alive(team).forEach((t) => {
          api.applyHit(boss, t, 1.10, '海啸');
          api.addStatus(t, 'spdDown', 22, 2);
          if (Math.random() < 0.35) api.addStatus(t, 'taunt', 1, 1);
        });
        api.key();
      }
      return true;
    }

    if (scriptId === 'magma_overload') {
      if (!st.triggers.magmaInit) {
        st.triggers.magmaInit = true;
        api.log(`<div class="text-purple-300 font-black">熔核过载：首领核心升温，战场进入灼热状态</div>`);
        api.vfx('ultimate');
        api.key();
      }
      if (round % 2 === 0) {
        alive(team).forEach((t) => api.addStatus(t, 'burn', Math.floor(boss.attack * 0.08), 2));
        api.log(`<div class="text-purple-300 font-black">熔核余烬：全体附加灼烧</div>`);
        api.key();
      }
      if (round % 4 === 0) {
        api.log(`<div class="text-purple-300 font-black">熔核过载：爆燃冲击！</div>`);
        api.vfx('slam');
        alive(team).forEach((t) => api.applyHit(boss, t, 1.25, '爆燃冲击'));
        api.addStatus(boss, 'defDown', 18, 2);
        api.key();
      } else if (round % 4 === 3) {
        boss.shield = (boss.shield || 0) + Math.floor(boss.maxHp * 0.10);
        api.addStatus(boss, 'dmgReducUp', 18, 1);
        api.log(`<div class="text-purple-300 font-black">熔核过载：核心护盾生成</div>`);
        api.key();
      }
      return true;
    }

    if (scriptId === 'sanctuary_judgement') {
      if (!st.judgement) st.judgement = { stacks: 0 };
      st.judgement.stacks += 1;
      if (st.judgement.stacks >= 4) {
        st.judgement.stacks = 0;
        api.log(`<div class="text-purple-300 font-black">圣域审判：净化与裁决降临！</div>`);
        api.vfx('ultimate');
        const aliveTeam = alive(team);
        const silenced = pick(aliveTeam);
        if (silenced) api.addStatus(silenced, 'silence', 1, 1);
        aliveTeam.forEach((t) => {
          api.addStatus(t, 'atkUp', -18, 2);
          api.addStatus(t, 'defDown', 16, 2);
        });
        boss.currentHp = Math.min(boss.maxHp, boss.currentHp + Math.floor(boss.maxHp * 0.04));
        boss.shield = (boss.shield || 0) + Math.floor(boss.maxHp * 0.12);
        api.key();
      } else {
        api.log(`<div class="text-purple-300 font-black">圣域印记：审判层数 ${st.judgement.stacks}/4</div>`);
      }
      if (round % 3 === 0) {
        const t = lowestHpRate(team);
        if (t) {
          api.log(`<div class="text-purple-300 font-black">神罚打击：锁定 <span class="text-blue-300">${t.displayName || t.name}</span></div>`);
          api.vfx('danger');
          api.applyHit(boss, t, 1.30, '神罚打击');
          api.addStatus(t, 'healDownDebuff', 30, 2);
          api.key();
        }
      }
      return true;
    }

    if (scriptId === 'divine_echo') {
      if (!st.echo) st.echo = { pending: [] };
      const pending = Array.isArray(st.echo.pending) ? st.echo.pending : [];
      pending.forEach((p) => {
        if (!p || !p.targetId) return;
        const t = alive(team).find((x) => x.id === p.targetId);
        if (!t) return;
        const raw = Math.floor(Math.max(1, boss.attack * (p.mult || 0.65)));
        trueDamage(ctx, t, raw, `<div class="text-purple-300 font-black">神圣回响：<span class="text-blue-300">${t.displayName || t.name}</span> 受到回响真实伤害 <span class="text-red-500 font-black">${raw}</span></div>`);
        api.vfx('danger');
      });
      st.echo.pending = [];
      if (round % 2 === 0) {
        const t = pick(alive(team));
        if (t) {
          api.log(`<div class="text-purple-300 font-black">神圣回响：首领对 <span class="text-blue-300">${t.displayName || t.name}</span> 种下回响印记</div>`);
          api.vfx('ultimate');
          st.echo.pending.push({ targetId: t.id, mult: 0.70 });
          api.addStatus(t, 'spdDown', 12, 2);
          api.key();
        }
      }
      if (round % 3 === 0) {
        api.addStatus(boss, 'immune', 1, 1);
      }
      return true;
    }

    return false;
  }

  /**
   * 回合开始总入口。
   * 顺序与旧实现保持一致：狂暴 → 逐个首领脚本 → 阶段/召唤。
   * @returns {boolean} 是否处理过任何首领
   */
  function runRound(ctx) {
    if (!ctx || !ctx.api || !Array.isArray(ctx.enemies)) return false;
    let handled = false;
    runEnrage(ctx);
    const bosses = ctx.enemies.filter((e) => e && e.currentHp > 0 && e.isBoss && e.bossMechanics);
    bosses.forEach((boss) => {
      const sub = { ...ctx, boss, m: boss.bossMechanics };
      if (runScript(sub)) handled = true;
      runPhases(sub);
      handled = true;
    });
    return handled;
  }

  const api = { runRound, runScript, runPhases, runEnrage, summonAdds, trueDamage, SCRIPT_IDS };
  if (window.Game && window.Game.battle) window.Game.battle.bossMechanics = api;
  window.__bossMechanics = api;
})();
