(() => {
  const RARITY_ORDER = { R: 1, SR: 2, SSR: 3, UR: 4, SUR: 5 };
  function getEquipmentTemplates() {
    if (typeof equipmentData !== 'undefined' && Array.isArray(equipmentData)) return equipmentData;
    if (Array.isArray(window.equipmentData)) return window.equipmentData;
    return [];
  }

  function getInscriptionTemplates() {
    if (typeof inscriptionsData !== 'undefined' && Array.isArray(inscriptionsData)) return inscriptionsData;
    if (Array.isArray(window.inscriptionsData)) return window.inscriptionsData;
    return [];
  }

  function normalizeNumericAttributes(attrs) {
    const out = {};
    if (!attrs || typeof attrs !== 'object') return out;
    Object.entries(attrs).forEach(([k, v]) => {
      if (typeof v === 'number') out[k] = v;
      else if (typeof v === 'string') {
        const n = parseFloat(v);
        if (Number.isFinite(n)) out[k] = n;
      }
    });
    return out;
  }

  function calculateEquipmentPower(item) {
    if (!item) return 0;
    let power = 0;
    const attrs = item.attributes || {};
    const levelBonus = 1 + ((item.level || 1) - 1) * 0.1;

    if (attrs.attack) power += attrs.attack * levelBonus * 2;
    if (attrs.defense) power += attrs.defense * levelBonus * 5;
    if (attrs.health) power += attrs.health * levelBonus * 0.5;
    if (attrs.speed) power += attrs.speed * levelBonus * 10;

    const secondaryWeights = {
      atkPercent: 50, hpPercent: 50, defPercent: 50,
      critRate: 100, dodgeRate: 100, blockRate: 100,
      dmgReduc: 150, lifesteal: 150, effectHit: 80,
      penetration: 120, tenacity: 120
    };
    for (const [key, weight] of Object.entries(secondaryWeights)) {
      if (attrs[key]) power += attrs[key] * weight;
    }
    return Math.floor(power);
  }

  function calculateEnhanceCost(level, rarity) {
    const rarityMultiplier = {
      R: 1,
      SR: 1.5,
      SSR: 2,
      UR: 3,
      SUR: 5
    };
    return Math.floor(100 * (level || 1) * (rarityMultiplier[rarity] || 1));
  }

  function calculateRefineCost(refine) {
    return (Math.max(0, refine || 0) + 1) * 100;
  }

  function getMaxEquipmentLevel(rarity) {
    const maxLevels = {
      R: 20,
      SR: 30,
      SSR: 40,
      UR: 50,
      SUR: 60
    };
    return maxLevels[rarity] || 20;
  }

  function calculateInscriptionExpToNextLevel(level) {
    return 50 * Math.pow(2, (level || 1) - 1);
  }

  function getEquipmentExpToNextLevel(level, rarity) {
    const base = { R: 60, SR: 90, SSR: 140, UR: 220, SUR: 360 };
    return Math.floor((base[rarity] || 80) * Math.pow(1.22, Math.max(0, (level || 1) - 1)));
  }

  function getEquipmentFeedExp(item) {
    if (!item) return 0;
    const r = item.rarity || 'R';
    const mult = { R: 1, SR: 1.4, SSR: 2.1, UR: 3.2, SUR: 4.8 };
    return Math.floor(40 * (mult[r] || 1) * Math.max(1, item.level || 1));
  }

  function getInscriptionFeedExp(ins) {
    if (!ins) return 0;
    const r = ins.rarity || 'R';
    const mult = { R: 1, SR: 1.35, SSR: 2.0, UR: 3.1, SUR: 4.6 };
    return Math.floor(35 * (mult[r] || 1) * Math.max(1, ins.level || 1));
  }

  function getAffixCountRangeByRarity(rarity) {
    const ranges = {
      R: [0, 1],
      SR: [1, 2],
      SSR: [2, 3],
      UR: [3, 4],
      SUR: [4, 5]
    };
    return ranges[rarity] || [0, 1];
  }

  function randomInt(min, max) {
    const a = Math.min(min, max);
    const b = Math.max(min, max);
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  function pickN(keys, n) {
    const pool = [...keys];
    const out = [];
    const count = Math.max(0, Math.min(n, pool.length));
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      out.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return out;
  }

  function getEquipmentAffixPool(templateType) {
    const common = [
      'atkPercent', 'defPercent', 'hpPercent',
      'critRate', 'critDmg', 'dodgeRate', 'blockRate',
      'dmgReduc', 'lifesteal', 'effectHit',
      'penetration', 'tenacity',
      'speed'
    ];
    if (templateType === 'weapon') return [...common, 'attack'];
    if (templateType === 'armor') return [...common, 'defense', 'health'];
    if (templateType === 'helmet') return [...common, 'health', 'defense'];
    if (templateType === 'shoes') return [...common, 'speed', 'dodgeRate'];
    if (templateType === 'accessory') return [...common, 'attack', 'effectHit'];
    return common;
  }

  function getAffixValue(key, rarity) {
    const rank = RARITY_ORDER[rarity] || 1;
    const v = {
      attack: 18 * rank,
      defense: 14 * rank,
      health: 120 * rank,
      speed: 8 * rank,

      atkPercent: 2 * rank,
      defPercent: 2 * rank,
      hpPercent: 2 * rank,
      critRate: 2 * rank,
      critDmg: 6 * rank,
      dodgeRate: 2 * rank,
      blockRate: 2 * rank,
      dmgReduc: 1 * rank,
      lifesteal: 1 * rank,
      effectHit: 2 * rank,
      penetration: 2 * rank,
      tenacity: 2 * rank
    };
    return v[key] || 0;
  }

  function getEquipmentSetTag(name) {
    const n = String(name || '');
    if (!n) return '';
    const rules = [
      { tag: 'wind', re: /(疾风|踏风|风行|迅捷)/ },
      { tag: 'shadow', re: /(影|暗|夜|疾影|影舞)/ },
      { tag: 'dragon', re: /(龙|龙骨|古龙|龙纹)/ },
      { tag: 'void', re: /(虚空|深渊|终焉|黑曜)/ },
      { tag: 'slaughter', re: /(屠戮|破军|狂战|裁决)/ },
      { tag: 'sanctuary', re: /(圣|神谕|守护|誓约)/ }
    ];
    const hit = rules.find(r => r.re.test(n));
    return hit ? hit.tag : '';
  }

  function uniqueStrings(list) {
    const out = [];
    const set = new Set();
    (Array.isArray(list) ? list : []).forEach(v => {
      if (typeof v !== 'string') return;
      if (!v) return;
      if (set.has(v)) return;
      set.add(v);
      out.push(v);
    });
    return out;
  }

  function getMaxReforgeLockCount(rarity, affixCount) {
    const r = String(rarity || 'R');
    const baseCap = r === 'SUR' ? 3 : (r === 'UR' ? 2 : (r === 'SSR' ? 2 : (r === 'SR' ? 1 : 0)));
    const n = Math.max(0, parseInt(affixCount, 10) || 0);
    if (n <= 0) return 0;
    return Math.max(0, Math.min(baseCap, Math.max(0, n - 1)));
  }

  function getReforgeCost(rarity, lockedCount, affixCount) {
    const r = rarity || 'R';
    const baseDust = { R: 4, SR: 8, SSR: 14, UR: 22, SUR: 34 };
    const baseGold = { R: 480, SR: 900, SSR: 1500, UR: 2600, SUR: 4200 };
    const n = Math.max(1, parseInt(affixCount, 10) || 1);
    const locks = Math.max(0, parseInt(lockedCount, 10) || 0);
    const dust = Math.floor((baseDust[r] || 6) * (1 + (n - 1) * 0.4) * (1 + locks * 0.95));
    const gold = Math.floor((baseGold[r] || 900) * (1 + (n - 1) * 0.35) * (1 + locks * 1.25));
    const lockCrystalPer = (r === 'SSR' ? 1 : (r === 'UR' ? 2 : (r === 'SUR' ? 3 : 0)));
    const lockCrystal = locks > 0 ? Math.max(1, locks * lockCrystalPer) : 0;
    return { gold, reforgeDust: Math.max(0, dust), lockCrystal: Math.max(0, lockCrystal) };
  }

  function reforgeEquipmentAffixes(instance, lockKeys) {
    if (!instance) return null;
    const templates = getEquipmentTemplates();
    const template = templates.find(t => t && t.id === instance.id);
    if (!template) return null;
    normalizeEquipmentInstance(instance, template);

    const baseKeys = new Set(Object.keys(instance.baseAttributes || {}));
    const pool = getEquipmentAffixPool(instance.type).filter(k => !baseKeys.has(k));
    const [minN, maxN] = getAffixCountRangeByRarity(instance.rarity);
    const targetN = clampInt(Array.isArray(instance.extraKeys) ? instance.extraKeys.length : randomInt(minN, maxN), minN, maxN);

    const currentKeys = uniqueStrings(instance.extraKeys);
    const locked = uniqueStrings(lockKeys).filter(k => pool.includes(k) && currentKeys.includes(k));
    const available = pool.filter(k => !locked.includes(k));
    const need = Math.max(0, targetN - locked.length);
    const rolled = pickN(available, need);
    const extraKeys = [...locked, ...rolled];
    const extraAttributes = {};
    extraKeys.forEach(k => {
      const val = getAffixValue(k, instance.rarity);
      if (val) extraAttributes[k] = val;
    });
    instance.extraKeys = extraKeys;
    instance.extraAttributes = extraAttributes;
    instance.lockedKeys = locked;
    instance.attributes = { ...(instance.baseAttributes || {}), ...(instance.extraAttributes || {}) };
    return instance;
  }

  function reforgeInscriptionAffixes(instance, lockKeys) {
    if (!instance) return null;
    const templates = getInscriptionTemplates();
    const template = templates.find(t => t && t.id === instance.id);
    if (!template) return null;
    normalizeInscriptionInstance(instance, template);

    const baseKeys = new Set(Object.keys(instance.baseAttributes || {}));
    const pool = [
      'attack', 'defense', 'health', 'speed',
      'atkPercent', 'defPercent', 'hpPercent',
      'critRate', 'critDmg', 'dodgeRate', 'blockRate',
      'dmgReduc', 'lifesteal', 'effectHit',
      'penetration', 'tenacity'
    ].filter(k => !baseKeys.has(k));
    const [minN, maxN] = getAffixCountRangeByRarity(instance.rarity);
    const targetN = clampInt(Array.isArray(instance.extraKeys) ? instance.extraKeys.length : randomInt(minN, maxN), minN, maxN);

    const currentKeys = uniqueStrings(instance.extraKeys);
    const locked = uniqueStrings(lockKeys).filter(k => pool.includes(k) && currentKeys.includes(k));
    const available = pool.filter(k => !locked.includes(k));
    const need = Math.max(0, targetN - locked.length);
    const rolled = pickN(available, need);
    const extraKeys = [...locked, ...rolled];
    const extraAttributes = {};
    extraKeys.forEach(k => {
      const val = getAffixValue(k, instance.rarity);
      if (val) extraAttributes[k] = val;
    });
    instance.extraKeys = extraKeys;
    instance.extraAttributes = extraAttributes;
    instance.lockedKeys = locked;
    instance.attributes = { ...(instance.baseAttributes || {}), ...(instance.extraAttributes || {}) };
    return instance;
  }

  function clampInt(v, a, b) {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return a;
    return Math.max(a, Math.min(b, n));
  }

  function normalizeEquipmentInstance(instance, template) {
    if (!instance || !template) return instance;
    if (!instance.instanceId) instance.instanceId = Date.now() + Math.random();
    if (!instance.rarity) instance.rarity = template.rarity;
    if (!instance.type) instance.type = template.type;
    if (!instance.name) instance.name = template.name;
    if (!instance.imageUrl) instance.imageUrl = template.imageUrl;
    if (!instance.level) instance.level = 1;
    if (typeof instance.exp !== 'number') instance.exp = 0;
    if (typeof instance.setTag !== 'string') instance.setTag = template.setTag || getEquipmentSetTag(instance.name);

    const baseAttributes = normalizeNumericAttributes(template.attributes || {});
    instance.baseAttributes = { ...baseAttributes };

    const baseKeys = new Set(Object.keys(baseAttributes));
    const pool = getEquipmentAffixPool(template.type).filter(k => !baseKeys.has(k));
    const [minN, maxN] = getAffixCountRangeByRarity(instance.rarity);

    let extraKeys = Array.isArray(instance.extraKeys) ? instance.extraKeys.filter(k => typeof k === 'string') : null;
    if (!extraKeys || extraKeys.length === 0) {
      const derived = {};
      Object.keys(instance.attributes || {}).forEach(k => {
        if (!baseKeys.has(k)) derived[k] = instance.attributes[k];
      });
      const derivedKeys = Object.keys(derived);
      if (derivedKeys.length > 0) extraKeys = derivedKeys;
    }
    if (!extraKeys || extraKeys.length === 0) extraKeys = pickN(pool, randomInt(minN, maxN));

    const extraAttributes = {};
    extraKeys.forEach(k => {
      const val = getAffixValue(k, instance.rarity);
      if (!val) return;
      extraAttributes[k] = val;
    });
    instance.extraKeys = extraKeys;
    instance.extraAttributes = extraAttributes;
    if (!Array.isArray(instance.lockedKeys)) instance.lockedKeys = [];
    instance.lockedKeys = uniqueStrings(instance.lockedKeys).filter(k => instance.extraKeys.includes(k));

    instance.attributes = { ...instance.baseAttributes, ...instance.extraAttributes };
    return instance;
  }

  function normalizeInscriptionInstance(instance, template) {
    if (!instance || !template) return instance;
    if (!instance.instanceId) instance.instanceId = Date.now() + Math.random();
    if (!instance.rarity) instance.rarity = template.rarity;
    if (!instance.type) instance.type = template.type;
    if (!instance.name) instance.name = template.name;
    if (!instance.imageUrl) instance.imageUrl = template.imageUrl;
    if (!instance.level) instance.level = 1;
    if (typeof instance.exp !== 'number') instance.exp = 0;
    if (template.setEffect && !instance.setEffect) instance.setEffect = template.setEffect;
    if (template.passiveEffect && !instance.passiveEffect) instance.passiveEffect = template.passiveEffect;

    const baseAttributes = normalizeNumericAttributes(template.attributes || {});
    instance.baseAttributes = { ...baseAttributes };

    const baseKeys = new Set(Object.keys(baseAttributes));
    const pool = [
      'attack', 'defense', 'health', 'speed',
      'atkPercent', 'defPercent', 'hpPercent',
      'critRate', 'critDmg', 'dodgeRate', 'blockRate',
      'dmgReduc', 'lifesteal', 'effectHit',
      'penetration', 'tenacity'
    ].filter(k => !baseKeys.has(k));
    const [minN, maxN] = getAffixCountRangeByRarity(instance.rarity);

    let extraKeys = Array.isArray(instance.extraKeys) ? instance.extraKeys.filter(k => typeof k === 'string') : null;
    if (!extraKeys || extraKeys.length === 0) {
      const derived = {};
      Object.keys(instance.attributes || {}).forEach(k => {
        if (!baseKeys.has(k)) derived[k] = instance.attributes[k];
      });
      const derivedKeys = Object.keys(derived);
      if (derivedKeys.length > 0) extraKeys = derivedKeys;
    }
    if (!extraKeys || extraKeys.length === 0) extraKeys = pickN(pool, randomInt(minN, maxN));

    const extraAttributes = {};
    extraKeys.forEach(k => {
      const val = getAffixValue(k, instance.rarity);
      if (!val) return;
      extraAttributes[k] = val;
    });
    instance.extraKeys = extraKeys;
    instance.extraAttributes = extraAttributes;
    if (!Array.isArray(instance.lockedKeys)) instance.lockedKeys = [];
    instance.lockedKeys = uniqueStrings(instance.lockedKeys).filter(k => instance.extraKeys.includes(k));
    instance.attributes = { ...instance.baseAttributes, ...instance.extraAttributes };
    return instance;
  }

  function ensureEquipmentInstance(instance) {
    const templates = getEquipmentTemplates();
    if (!instance || !Array.isArray(templates)) return instance;
    const template = templates.find(t => t && t.id === instance.id);
    if (!template) return instance;
    return normalizeEquipmentInstance(instance, template);
  }

  function ensureInscriptionInstance(instance) {
    const templates = getInscriptionTemplates();
    if (!instance || !Array.isArray(templates)) return instance;
    const template = templates.find(t => t && t.id === instance.id);
    if (!template) return instance;
    return normalizeInscriptionInstance(instance, template);
  }

  function createEquipmentInstance(template) {
    const instance = { ...JSON.parse(JSON.stringify(template || {})), instanceId: Date.now() + Math.random(), level: 1, exp: 0, refine: 0 };
    return normalizeEquipmentInstance(instance, template);
  }

  function createInscriptionInstance(template) {
    const instance = { ...JSON.parse(JSON.stringify(template || {})), instanceId: Date.now() + Math.random(), level: 1, exp: 0 };
    return normalizeInscriptionInstance(instance, template);
  }

  const api = {
    calculateEquipmentPower,
    calculateEnhanceCost,
    calculateRefineCost,
    getMaxEquipmentLevel,
    calculateInscriptionExpToNextLevel,
    getEquipmentExpToNextLevel,
    getEquipmentFeedExp,
    getInscriptionFeedExp,
    getEquipmentSetTag,
    getMaxReforgeLockCount,
    getReforgeCost,
    reforgeEquipmentAffixes,
    reforgeInscriptionAffixes,
    ensureEquipmentInstance,
    ensureInscriptionInstance,
    createEquipmentInstance,
    createInscriptionInstance
  };
  if (window.Game && window.Game.domain) window.Game.domain.inventory = api;
  window.__inventory = api;
})();
