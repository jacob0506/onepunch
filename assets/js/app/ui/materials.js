/**
 * 材料工具单源（ui/materials.js）
 *
 * 为什么独立成模块：
 *   ensureMaterials / getMaterialMeta / getRarityCostMult 原本在 ui/backpack.js 与
 *   ui/inventory.js 里各有一份**逐字相同**的副本。两份副本一旦分叉
 *   （例如新增一种材料 key、或调整稀有度成本系数），就会出现
 *   「背包页能强化、铭文页却报缺材料」这类只在特定页面复现的怪问题。
 *
 * 现统一到本文件；backpack.js / inventory.js 只保留同名薄壳，调用点无需改动。
 */
(() => {
  const MATERIAL_KEYS = ['enhanceStone', 'inscriptionDust', 'reforgeDust', 'lockCrystal'];

  /** 确保玩家材料字段存在（委托 domain/progression.js，避免默认值定义散落） */
  function ensureMaterials(data) {
    const g = data || window.gameData;
    if (!g) return;
    if (window.__progression && typeof window.__progression.ensurePlayerMaterials === 'function') {
      window.__progression.ensurePlayerMaterials(g);
      return;
    }
    if (!g.player) g.player = {};
    if (!g.player.materials) g.player.materials = {};
    MATERIAL_KEYS.forEach((k) => {
      if (typeof g.player.materials[k] !== 'number') g.player.materials[k] = 0;
    });
  }

  /** 取材料展示元数据（名称 / 图标），未登记时退回 key 本身 */
  function getMaterialMeta(key) {
    const list = (typeof materialsData !== 'undefined' && Array.isArray(materialsData))
      ? materialsData
      : (Array.isArray(window.materialsData) ? window.materialsData : []);
    const m = Array.isArray(list) ? list.find((x) => x && x.key === key) : null;
    return {
      name: m && m.name ? m.name : key,
      iconUrl: m && m.iconUrl ? m.iconUrl : '',
    };
  }

  /** 稀有度 → 材料消耗倍率 */
  function getRarityCostMult(rarity) {
    const map = { R: 1, SR: 2, SSR: 4, UR: 7, SUR: 10 };
    return map[rarity] || 1;
  }

  const api = { MATERIAL_KEYS, ensureMaterials, getMaterialMeta, getRarityCostMult };
  if (window.Game && window.Game.ui) window.Game.ui.materials = api;
  window.__materials = api;
})();
