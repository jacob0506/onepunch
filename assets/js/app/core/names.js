/**
 * 名称映射单一真相源（core/names.js）
 *
 * 为什么独立成模块：
 *   这批中英文映射原本内联在 index.html 的「领域函数区」，而 ui/backpack.js 里
 *   还有一份**不完整**的副本 —— 它的 `getInscriptionTypeName` fallback 直接返回英文 key
 *   （例：铭文类型显示 "attack" 而不是 "攻击"）。这正是本项目头号陷阱"双份实现"的典型形态：
 *   改一处漏一处，且漏的那处还不报错。
 *
 * 现统一到本文件，index.html 只保留 window 引用。
 * 新增阵营 / 类型 / 难度 / 属性时，**只改本文件**。
 */
(() => {
  const CLASS_NAMES = {
    warrior: '战士', mage: '法师', assassin: '刺客', archer: '射手', healer: '辅助', tank: '坦克',
  };

  // faction 在数据里有 22 种取值；未映射时 UI 会直接显示英文原文（例："战士 / knight"）
  const FACTION_NAMES = {
    nature: '自然', war: '战争', light: '光明', tech: '科技',
    knight: '骑士', abyss: '深渊', star: '星辰', earth: '大地',
    thunder: '雷霆', ice: '冰霜', void: '虚空', fire: '火焰',
    wind: '疾风', water: '流水', dragon: '龙裔', beast: '兽族',
    sun: '烈阳', dark: '暗影', rogue: '游侠', moon: '月华',
    god: '神域', time: '时序',
  };

  const EQUIPMENT_TYPE_NAMES = {
    weapon: '武器', armor: '防具', accessory: '饰品', shoes: '鞋子', helmet: '头盔',
  };

  const INSCRIPTION_TYPE_NAMES = {
    attack: '攻击', defense: '防御', health: '生命', crit: '暴击', dodge: '闪避',
    speed: '速度', penetration: '穿透', tenacity: '韧性', holy: '神圣', chaos: '混沌',
  };

  const ATTRIBUTE_NAMES = {
    attack: '攻击力', defense: '防御力', health: '生命值', speed: '速度',
    critRate: '暴击率', dodgeRate: '闪避率', penetration: '穿透', tenacity: '韧性', mana: '魔法值',
  };

  const DIFFICULTY_NAMES = { normal: '普通', hard: '困难', nightmare: '噩梦', abyss: '深渊' };

  const DIFFICULTY_CLASSES = {
    normal: 'bg-green-900 text-green-400',
    hard: 'bg-yellow-900 text-yellow-400',
    nightmare: 'bg-red-900 text-red-400',
    abyss: 'bg-purple-900 text-purple-300',
  };

  function getClassName(classType) {
    return CLASS_NAMES[classType] || classType;
  }

  function getFactionName(faction) {
    if (!faction) return '未知';
    return FACTION_NAMES[faction] || faction;
  }

  function getEquipmentTypeName(type) {
    return EQUIPMENT_TYPE_NAMES[type] || type;
  }

  function getInscriptionTypeName(type) {
    return INSCRIPTION_TYPE_NAMES[type] || type;
  }

  function getAttributeName(attr) {
    return ATTRIBUTE_NAMES[attr] || attr;
  }

  function getAttributeUnit(attr) {
    const key = String(attr || '');
    if (key.includes('Rate') || key === 'penetration' || key === 'tenacity') return '%';
    return '';
  }

  function getDifficultyName(difficulty) {
    return DIFFICULTY_NAMES[difficulty] || difficulty;
  }

  function getDifficultyClass(difficulty) {
    return DIFFICULTY_CLASSES[difficulty] || 'bg-gray-700 text-gray-400';
  }

  const fns = {
    getClassName, getFactionName, getEquipmentTypeName, getInscriptionTypeName,
    getAttributeName, getAttributeUnit, getDifficultyName, getDifficultyClass,
  };

  const G = window.Game || (window.Game = {});
  if (!G.core) G.core = {};
  G.core.names = {
    CLASS_NAMES, FACTION_NAMES, EQUIPMENT_TYPE_NAMES, INSCRIPTION_TYPE_NAMES,
    ATTRIBUTE_NAMES, DIFFICULTY_NAMES, DIFFICULTY_CLASSES, ...fns,
  };

  // 挂到 window：内联脚本与其它模块都以裸标识符调用这些函数
  for (const [name, fn] of Object.entries(fns)) {
    if (typeof window[name] !== 'function') window[name] = fn;
  }
})();
