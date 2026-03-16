(() => {
  function createInstance(itemData) {
    const equipTemplates = (typeof equipmentData !== 'undefined' && Array.isArray(equipmentData)) ? equipmentData : (Array.isArray(window.equipmentData) ? window.equipmentData : []);
    const insTemplates = (typeof inscriptionsData !== 'undefined' && Array.isArray(inscriptionsData)) ? inscriptionsData : (Array.isArray(window.inscriptionsData) ? window.inscriptionsData : []);
    const isEquip = Array.isArray(equipTemplates) && equipTemplates.some(e => e && e.id === itemData.id);
    if (isEquip && window.__inventory && typeof window.__inventory.createEquipmentInstance === 'function') {
      return window.__inventory.createEquipmentInstance(itemData);
    }
    if (!isEquip && window.__inventory && typeof window.__inventory.createInscriptionInstance === 'function') {
      return window.__inventory.createInscriptionInstance(itemData);
    }

    const instance = { ...JSON.parse(JSON.stringify(itemData)), instanceId: Date.now() + Math.random() };
    if (isEquip) {
      instance.level = 1;
      instance.exp = 0;
      instance.refine = 0;
    } else {
      instance.level = 1;
      instance.exp = 0;
    }
    return instance;
  }

  function rollRewards(stage, isWin) {
    const mats = (typeof materialsData !== 'undefined' && Array.isArray(materialsData)) ? materialsData : (Array.isArray(window.materialsData) ? window.materialsData : []);
    const rewards = {
      exp: (stage && stage.rewards && stage.rewards.exp) || 0,
      gold: (stage && stage.rewards && stage.rewards.gold) || 0,
      items: [],
      materials: {}
    };
    if (!isWin || !stage || !stage.rewards || !Array.isArray(stage.rewards.items)) return rewards;

    stage.rewards.items.forEach(item => {
      if (Math.random() >= (item.dropRate || 0)) return;
      const itemData =
        (Array.isArray(equipTemplates) ? equipTemplates.find(i => i && i.id === item.id) : null) ||
        (Array.isArray(insTemplates) ? insTemplates.find(i => i && i.id === item.id) : null);
      if (itemData) {
        rewards.items.push(createInstance(itemData));
        return;
      }
      const mat = Array.isArray(mats) ? mats.find(m => m && m.id === item.id) : null;
      if (!mat || !mat.key) return;
      const qty = Math.max(1, typeof item.quantity === 'number' ? item.quantity : 1);
      rewards.materials[mat.key] = (rewards.materials[mat.key] || 0) + qty;
    });
    return rewards;
  }

  const api = { rollRewards };
  if (window.Game && window.Game.battle) window.Game.battle.rewards = api;
  window.__battleRewards = api;
})();
