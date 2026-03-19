(() => {
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const pick = (arr) => (Array.isArray(arr) && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);
  const alive = (arr) => (Array.isArray(arr) ? arr.filter(u => u && u.currentHp > 0) : []);
  const lowestHpRate = (arr) => alive(arr).sort((a, b) => (a.currentHp / a.maxHp) - (b.currentHp / b.maxHp))[0] || null;
  const highestAtk = (arr) => alive(arr).sort((a, b) => (b.attack || 0) - (a.attack || 0))[0] || null;

  function ensureState(boss) {
    if (!boss.bossState) boss.bossState = { triggers: {} };
    if (!boss.bossState.triggers) boss.bossState.triggers = {};
    return boss.bossState;
  }

  function run(ctx) {
    const boss = ctx && ctx.boss;
    const m = ctx && ctx.m;
    const scriptId = m && m.scriptId;
    if (!boss || !m || !scriptId) return false;
    const team = ctx.team || [];
    const enemies = ctx.enemies || [];
    const round = ctx.round || 1;
    const addStatus = ctx.addStatus;
    const getStatus = ctx.getStatus;
    const getStatusValue = ctx.getStatusValue;
    const applyHit = ctx.applyHit;
    const append = (html) => ctx.appendBattleLog && ctx.appendBattleLog(ctx.logs, ctx.roundContainer, html);
    const markKey = ctx.markKey || (() => {});
    const vfx = ctx.vfx || (() => {});

    const st = ensureState(boss);

    if (scriptId === 'sky_rift') {
      const chargeKey = `sky_charge_${round}`;
      const releaseKey = `sky_release_${round}`;
      if (round % 4 === 3 && !st.triggers[chargeKey]) {
        st.triggers[chargeKey] = true;
        addStatus(boss, 'dmgReducUp', 25, 1);
        addStatus(boss, 'dodgeUp', 18, 1);
        append(`<div class="text-purple-300 font-black">天穹裂隙：首领撕开天空裂缝，正在蓄力…</div>`);
        vfx('ultimate');
        markKey();
      }
      if (round % 4 === 0 && !st.triggers[releaseKey]) {
        st.triggers[releaseKey] = true;
        append(`<div class="text-purple-300 font-black">天穹裂隙：裂空斩落下！全体受到冲击</div>`);
        vfx('slam');
        alive(team).forEach(t => {
          applyHit(boss, t, 1.20, '裂空斩');
          addStatus(t, 'spdDown', 18, 2);
          addStatus(t, 'shock', Math.floor(boss.attack * 0.10), 2);
        });
        markKey();
      }
      if (round % 2 === 0) {
        const t = pick(alive(team));
        if (t) {
          append(`<div class="text-purple-300 font-black">天穹裂隙：裂隙射线命中 <span class="text-blue-300">${t.name}</span></div>`);
          applyHit(boss, t, 1.05, '裂隙射线');
          addStatus(t, 'silence', 1, 1);
          markKey();
        }
      }
      return true;
    }

    if (scriptId === 'astral_prism') {
      if (!st.triggers.prismInit) {
        st.triggers.prismInit = true;
        boss.shield += Math.floor(boss.maxHp * clamp((m.protocolShieldPct || 14) / 100, 0.08, 0.22));
        boss.passive = boss.passive || {};
        boss.passive.reflectPct = Math.max(boss.passive.reflectPct || 0, 12);
        append(`<div class="text-purple-300 font-black">星棱棱镜：首领展开棱镜护盾并获得反伤</div>`);
        vfx('ultimate');
        markKey();
      }
      if (round % 3 === 0) {
        const t = highestAtk(team) || pick(alive(team));
        if (t) {
          const raw = Math.floor(Math.max(1, boss.attack * 0.88));
          append(`<div class="text-purple-300 font-black">星棱光束：锁定 <span class="text-blue-300">${t.name}</span>，造成真实伤害 <span class="text-red-500 font-black">${raw}</span></div>`);
          t.currentHp = Math.max(0, t.currentHp - raw);
          vfx('danger');
          markKey();
          if (t.currentHp <= 0) {
            append(`<div class="text-gray-500">[${t.name}] 已倒下</div>`);
            markKey();
          }
        }
      }
      if (round % 2 === 0) {
        addStatus(boss, 'atkUp', 18, 1);
        addStatus(boss, 'dmgReducUp', 12, 1);
      }
      return true;
    }

    if (scriptId === 'tide_titan') {
      if (!st.tide) st.tide = { mode: 'highTide', stacks: 0 };
      st.tide.stacks += 1;
      const mode = st.tide.stacks % 2 === 0 ? 'ebb' : 'highTide';
      st.tide.mode = mode;
      if (mode === 'highTide') {
        addStatus(boss, 'atkUp', 22, 1);
        addStatus(boss, 'spdUp', 12, 1);
        append(`<div class="text-purple-300 font-black">潮汐巨像：涨潮！首领攻击与速度提升</div>`);
      } else {
        addStatus(boss, 'dmgReducUp', 18, 1);
        addStatus(boss, 'defDown', -20, 1);
        append(`<div class="text-purple-300 font-black">潮汐巨像：退潮！首领强化防御并蓄势</div>`);
      }
      markKey();
      if (round % 3 === 0) {
        append(`<div class="text-purple-300 font-black">海啸：全体受到冲刷并降低速度</div>`);
        vfx('ultimate');
        alive(team).forEach(t => {
          applyHit(boss, t, 1.10, '海啸');
          addStatus(t, 'spdDown', 22, 2);
          if (Math.random() < 0.35) addStatus(t, 'taunt', 1, 1);
        });
        markKey();
      }
      return true;
    }

    if (scriptId === 'magma_overload') {
      if (!st.triggers.magmaInit) {
        st.triggers.magmaInit = true;
        append(`<div class="text-purple-300 font-black">熔核过载：首领核心升温，战场进入灼热状态</div>`);
        vfx('ultimate');
        markKey();
      }
      if (round % 2 === 0) {
        alive(team).forEach(t => addStatus(t, 'burn', Math.floor(boss.attack * 0.08), 2));
        append(`<div class="text-purple-300 font-black">熔核余烬：全体附加灼烧</div>`);
        markKey();
      }
      if (round % 4 === 0) {
        append(`<div class="text-purple-300 font-black">熔核过载：爆燃冲击！</div>`);
        vfx('slam');
        alive(team).forEach(t => applyHit(boss, t, 1.25, '爆燃冲击'));
        addStatus(boss, 'defDown', 18, 2);
        markKey();
      } else if (round % 4 === 3) {
        boss.shield += Math.floor(boss.maxHp * 0.10);
        addStatus(boss, 'dmgReducUp', 18, 1);
        append(`<div class="text-purple-300 font-black">熔核过载：核心护盾生成</div>`);
        markKey();
      }
      return true;
    }

    if (scriptId === 'sanctuary_judgement') {
      if (!st.judgement) st.judgement = { stacks: 0 };
      st.judgement.stacks += 1;
      if (st.judgement.stacks >= 4) {
        st.judgement.stacks = 0;
        append(`<div class="text-purple-300 font-black">圣域审判：净化与裁决降临！</div>`);
        vfx('ultimate');
        const aliveTeam = alive(team);
        const silenced = pick(aliveTeam);
        if (silenced) addStatus(silenced, 'silence', 1, 1);
        aliveTeam.forEach(t => {
          addStatus(t, 'atkUp', -18, 2);
          addStatus(t, 'defDown', 16, 2);
        });
        boss.currentHp = Math.min(boss.maxHp, boss.currentHp + Math.floor(boss.maxHp * 0.04));
        boss.shield += Math.floor(boss.maxHp * 0.12);
        markKey();
      } else {
        append(`<div class="text-purple-300 font-black">圣域印记：审判层数 ${st.judgement.stacks}/4</div>`);
      }
      if (round % 3 === 0) {
        const t = lowestHpRate(team);
        if (t) {
          append(`<div class="text-purple-300 font-black">神罚打击：锁定 <span class="text-blue-300">${t.name}</span></div>`);
          vfx('danger');
          applyHit(boss, t, 1.30, '神罚打击');
          addStatus(t, 'healDownDebuff', 30, 2);
          markKey();
        }
      }
      return true;
    }

    if (scriptId === 'divine_echo') {
      if (!st.echo) st.echo = { pending: [] };
      const pending = Array.isArray(st.echo.pending) ? st.echo.pending : [];
      const now = [];
      pending.forEach(p => {
        if (!p || !p.targetId) return;
        const t = alive(team).find(x => x.id === p.targetId);
        if (!t) return;
        const raw = Math.floor(Math.max(1, boss.attack * (p.mult || 0.65)));
        append(`<div class="text-purple-300 font-black">神圣回响：<span class="text-blue-300">${t.name}</span> 受到回响真实伤害 <span class="text-red-500 font-black">${raw}</span></div>`);
        t.currentHp = Math.max(0, t.currentHp - raw);
        vfx('danger');
        markKey();
        if (t.currentHp <= 0) {
          append(`<div class="text-gray-500">[${t.name}] 已倒下</div>`);
          markKey();
        }
      });
      st.echo.pending = now;
      if (round % 2 === 0) {
        const t = pick(alive(team));
        if (t) {
          append(`<div class="text-purple-300 font-black">神圣回响：首领对 <span class="text-blue-300">${t.name}</span> 种下回响印记</div>`);
          vfx('ultimate');
          st.echo.pending.push({ targetId: t.id, mult: 0.70 });
          addStatus(t, 'spdDown', 12, 2);
          markKey();
        }
      }
      if (round % 3 === 0) {
        addStatus(boss, 'immune', 1, 1);
      }
      return true;
    }

    return false;
  }

  const api = { run };
  if (window.Game && window.Game.battle) window.Game.battle.bossScripts = api;
  window.__bossScripts = api;
})();
