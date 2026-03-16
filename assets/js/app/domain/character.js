(() => {
  function calculateTotalStats(char) {
    const level = Math.max(1, typeof char.level === 'number' ? char.level : 1);
    const stars = Math.max(1, typeof char.stars === 'number' ? char.stars : 1);
    const levelFactor = 1 + (level - 1) * 0.1;
    const starFactor = 1 + (stars - 1) * 0.16;

    let stats = {
      attack: char.baseAttributes.attack * levelFactor * starFactor,
      defense: char.baseAttributes.defense * levelFactor * starFactor,
      health: char.baseAttributes.health * levelFactor * starFactor,
      speed: (char.baseAttributes.speed || 100) * (1 + (level - 1) * 0.05) * (1 + (stars - 1) * 0.06),
      atkPercent: 0,
      defPercent: 0,
      hpPercent: 0,
      critRate: 0,
      critDmg: 150,
      blockRate: 0,
      dodgeRate: 0,
      dmgReduc: 0,
      lifesteal: 0,
      effectHit: 0,
      penetration: 0,
      tenacity: 0
    };

    const starSteps = Math.max(0, stars - 1);
    stats.critRate += starSteps * 1.5;
    stats.effectHit += starSteps * 1.0;
    stats.tenacity += starSteps * 1.0;
    if (stars >= 3) stats.penetration += 6;
    if (stars >= 5) stats.dmgReduc += 4;
    if (stars >= 6) stats.lifesteal += 4;
    if (stars >= 7) stats.critDmg += 12;
    if (stars >= 8) stats.speed += 8;

    if (char.awakened) {
      const getAwakenProfile = window.getAwakenProfile;
      const p = typeof getAwakenProfile === 'function' ? getAwakenProfile(char) : null;
      if (p && p.bonus) {
        Object.entries(p.bonus).forEach(([k, v]) => {
          if (typeof v !== 'number') return;
          if (typeof stats[k] === 'number') stats[k] += v;
          else if (k === 'attack') stats.attack += v;
          else if (k === 'defense') stats.defense += v;
          else if (k === 'health') stats.health += v;
          else if (k === 'speed') stats.speed += v;
        });
      }
    }

    const equipments = char.equipments || {};
    Object.values(equipments).forEach(item => {
      if (!item) return;
      const attrs = item.attributes || {};
      const levelBonus = 1 + (item.level - 1) * 0.1;

      if (attrs.attack) stats.attack += attrs.attack * levelBonus;
      if (attrs.defense) stats.defense += attrs.defense * levelBonus;
      if (attrs.health) stats.health += attrs.health * levelBonus;
      if (attrs.speed) stats.speed += attrs.speed * levelBonus;

      if (attrs.atkPercent) stats.atkPercent += attrs.atkPercent;
      if (attrs.defPercent) stats.defPercent += attrs.defPercent;
      if (attrs.hpPercent) stats.hpPercent += attrs.hpPercent;
      if (attrs.critRate) stats.critRate += attrs.critRate;
      if (attrs.critDmg) stats.critDmg += attrs.critDmg;
      if (attrs.blockRate) stats.blockRate += attrs.blockRate;
      if (attrs.dodgeRate) stats.dodgeRate += attrs.dodgeRate;
      if (attrs.dmgReduc) stats.dmgReduc += attrs.dmgReduc;
      if (attrs.lifesteal) stats.lifesteal += attrs.lifesteal;
      if (attrs.effectHit) stats.effectHit += attrs.effectHit;
      if (attrs.penetration) stats.penetration += attrs.penetration;
      if (attrs.tenacity) stats.tenacity += attrs.tenacity;
    });

    const inscriptions = char.inscriptions || [];
    const setCounts = {};
    inscriptions.forEach(ins => {
      if (!ins) return;
      const attrs = ins.attributes || {};
      const levelBonus = 1 + (ins.level - 1) * 0.2;

      if (attrs.attack) stats.attack += attrs.attack * levelBonus;
      if (attrs.defense) stats.defense += attrs.defense * levelBonus;
      if (attrs.health) stats.health += attrs.health * levelBonus;
      if (attrs.speed) stats.speed += attrs.speed * levelBonus;

      if (attrs.atkPercent) stats.atkPercent += attrs.atkPercent;
      if (attrs.defPercent) stats.defPercent += attrs.defPercent;
      if (attrs.hpPercent) stats.hpPercent += attrs.hpPercent;
      if (attrs.critRate) stats.critRate += attrs.critRate;
      if (attrs.critDmg) stats.critDmg += attrs.critDmg;
      if (attrs.blockRate) stats.blockRate += attrs.blockRate;
      if (attrs.dodgeRate) stats.dodgeRate += attrs.dodgeRate;
      if (attrs.dmgReduc) stats.dmgReduc += attrs.dmgReduc;
      if (attrs.lifesteal) stats.lifesteal += attrs.lifesteal;
      if (attrs.effectHit) stats.effectHit += attrs.effectHit;
      if (attrs.penetration) stats.penetration += attrs.penetration;
      if (attrs.tenacity) stats.tenacity += attrs.tenacity;

      if (ins.setEffect) {
        const setName = ins.name.split('铭文')[0];
        setCounts[setName] = (setCounts[setName] || 0) + 1;
      }
    });

    stats.attack *= (1 + stats.atkPercent / 100);
    stats.defense *= (1 + stats.defPercent / 100);
    stats.health *= (1 + stats.hpPercent / 100);

    const applySetEffect = (effect) => {
      if (!effect) return;
      let m;
      if (effect.includes('全属性+20%')) {
        stats.attack *= 1.2;
        stats.defense *= 1.2;
        stats.health *= 1.2;
      }
      m = effect.match(/攻击\+(\d+)%/);
      if (m) stats.attack *= (1 + parseInt(m[1], 10) / 100);
      m = effect.match(/防御\+(\d+)%/);
      if (m) stats.defense *= (1 + parseInt(m[1], 10) / 100);
      m = effect.match(/生命\+(\d+)%/);
      if (m) stats.health *= (1 + parseInt(m[1], 10) / 100);
      m = effect.match(/速度\+(\d+)%/);
      if (m) stats.speed *= (1 + parseInt(m[1], 10) / 100);

      m = effect.match(/暴击率\+(\d+)%/);
      if (m) stats.critRate += parseInt(m[1], 10);
      m = effect.match(/暴击伤害(提升|增加)(\d+)%/);
      if (m) stats.critDmg += parseInt(m[2], 10);
      m = effect.match(/闪避率\+(\d+)%/);
      if (m) stats.dodgeRate += parseInt(m[1], 10);
      m = effect.match(/格挡率\+(\d+)%/);
      if (m) stats.blockRate += parseInt(m[1], 10);
      m = effect.match(/免伤\+(\d+)%/);
      if (m) stats.dmgReduc += parseInt(m[1], 10);
      m = effect.match(/吸血率额外提升(\d+)%/);
      if (m) stats.lifesteal += parseInt(m[1], 10);
      m = effect.match(/效果命中\+(\d+)%/);
      if (m) stats.effectHit += parseInt(m[1], 10);
      m = effect.match(/效果抵抗\+(\d+)%/);
      if (m) stats.tenacity += parseInt(m[1], 10);
      m = effect.match(/无视防御\+(\d+)%/);
      if (m) stats.penetration += parseInt(m[1], 10);
      m = effect.match(/无视目标(\d+)%防御/);
      if (m) stats.penetration += parseInt(m[1], 10);
    };

    const inscriptionsData = window.inscriptionsData;
    if (Array.isArray(inscriptionsData)) {
      for (const [name, count] of Object.entries(setCounts)) {
        const insData = inscriptionsData.find(i => i && i.name && i.name.startsWith(name));
        if (insData && insData.setEffect && count >= insData.setEffect.pieces) {
          applySetEffect(insData.setEffect.effect);
        }
      }
    }

    return {
      ...stats,
      attack: Math.floor(stats.attack),
      defense: Math.floor(stats.defense),
      health: Math.floor(stats.health),
      speed: Math.floor(stats.speed)
    };
  }

  function calculateCharacterAttack(char) {
    return calculateTotalStats(char).attack;
  }
  function calculateCharacterDefense(char) {
    return calculateTotalStats(char).defense;
  }
  function calculateCharacterHealth(char) {
    return calculateTotalStats(char).health;
  }
  function calculateCharacterSpeed(char) {
    return calculateTotalStats(char).speed;
  }
  function calculateCharacterPower(char) {
    return calculateCharacterAttack(char) +
      calculateCharacterDefense(char) +
      calculateCharacterHealth(char) / 10 +
      calculateCharacterSpeed(char);
  }

  const api = {
    calculateTotalStats,
    calculateCharacterAttack,
    calculateCharacterDefense,
    calculateCharacterHealth,
    calculateCharacterSpeed,
    calculateCharacterPower
  };

  if (window.Game && window.Game.domain) window.Game.domain.character = api;
  window.__character = api;
})();

