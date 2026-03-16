(() => {
  function ensureMaterials() {
    if (window.__progression && typeof window.__progression.ensurePlayerMaterials === 'function') {
      window.__progression.ensurePlayerMaterials(gameData);
    } else {
      if (!gameData.player) gameData.player = {};
      if (!gameData.player.materials) gameData.player.materials = {};
      if (typeof gameData.player.materials.enhanceStone !== 'number') gameData.player.materials.enhanceStone = 0;
      if (typeof gameData.player.materials.inscriptionDust !== 'number') gameData.player.materials.inscriptionDust = 0;
      if (typeof gameData.player.materials.reforgeDust !== 'number') gameData.player.materials.reforgeDust = 0;
      if (typeof gameData.player.materials.lockCrystal !== 'number') gameData.player.materials.lockCrystal = 0;
    }
  }

  function getMaterialMeta(key) {
    const list = (typeof materialsData !== 'undefined' && Array.isArray(materialsData)) ? materialsData : (Array.isArray(window.materialsData) ? window.materialsData : []);
    const m = Array.isArray(list) ? list.find(x => x && x.key === key) : null;
    return {
      name: m && m.name ? m.name : key,
      iconUrl: m && m.iconUrl ? m.iconUrl : ''
    };
  }

  function getRarityCostMult(rarity) {
    const map = { R: 1, SR: 2, SSR: 4, UR: 7, SUR: 10 };
    return map[rarity] || 1;
  }

  function renderAttrSections(item, kind) {
    const base = item.baseAttributes || {};
    const extra = item.extraAttributes || {};
    const leveledBonus = kind === 'inscription' ? (1 + ((item.level || 1) - 1) * 0.2) : (1 + ((item.level || 1) - 1) * 0.1);
    const isPercent = (key) => key.includes('Rate') || key.includes('Reduc') || key.includes('Hit') || key.includes('Percent') || ['atkPercent', 'defPercent', 'hpPercent', 'critDmg', 'penetration', 'tenacity'].includes(key);
    const fmt = (key, val) => `${Math.floor((typeof val === 'number' ? val : parseFloat(val) || 0) * leveledBonus)}${isPercent(key) ? '%' : ''}`;
    const rows = (obj, accent) => Object.entries(obj || {}).filter(([, v]) => (typeof v === 'number' && v !== 0) || (typeof v === 'string' && v !== '0')).map(([k, v]) => `
      <div class="flex justify-between items-center py-1 border-b border-gray-800">
        <span class="text-gray-400 text-sm">${getStatName(k)}</span>
        <span class="font-bold text-sm ${accent}">${fmt(k, v)}</span>
      </div>
    `).join('') || `<div class="text-gray-500 text-xs">无</div>`;
    return `
      <div class="text-[10px] text-gray-500 uppercase mb-2 font-bold">基础属性</div>
      <div>${rows(base, 'text-white')}</div>
      <div class="mt-4 text-[10px] text-gray-500 uppercase mb-2 font-bold">随机词条</div>
      <div>${rows(extra, 'text-primary')}</div>
    `;
  }

  function updateEquipmentList() {
    const equipmentList = document.getElementById('equipmentList');
    if (!equipmentList) return;
    equipmentList.innerHTML = '';

    const filterType = document.getElementById('equipmentFilter').value;
    const sortBy = document.getElementById('equipmentSort').value;

    let filteredEquipment = [...gameData.equipment];
    if (filterType !== 'all') filteredEquipment = filteredEquipment.filter(item => item.type === filterType);

    filteredEquipment.sort((a, b) => {
      if (sortBy === 'power') return calculateEquipmentPower(b) - calculateEquipmentPower(a);
      if (sortBy === 'level') return b.level - a.level;
      if (sortBy === 'rarity') {
        const rarityOrder = { R: 1, SR: 2, SSR: 3, UR: 4, SUR: 5 };
        return rarityOrder[b.rarity] - rarityOrder[a.rarity];
      }
      return 0;
    });

    filteredEquipment.forEach(item => {
      if (window.__inventory && typeof window.__inventory.ensureEquipmentInstance === 'function') window.__inventory.ensureEquipmentInstance(item);
      const cardElement = document.createElement('div');
      cardElement.className = `glass-effect rounded-lg overflow-hidden card-hover cursor-pointer rarity-border-${item.rarity.toLowerCase()}`;
      cardElement.innerHTML = `
        <div class="p-3 flex flex-col items-center">
          <div class="w-24 h-24 mb-3">
            <img src="${item.imageUrl}" alt="${item.name}" class="w-full h-full object-contain">
          </div>
          <div class="flex items-center mb-2">
            <span class="text-rarity-${item.rarity.toLowerCase()} font-bold">${item.rarity}</span>
            <span class="ml-2 px-2 py-0.5 bg-gray-700 rounded text-xs">${getEquipmentTypeName(item.type)}</span>
          </div>
          <h4 class="font-bold text-center mb-1">${item.name}</h4>
          <div class="text-xs text-center text-gray-400 mb-2">Lv.${item.level}</div>
          <div class="w-full bg-gray-700 rounded-full h-1 mb-2">
            <div class="bg-primary h-1 rounded-full" style="width: ${(item.level % 10) * 10}%"></div>
          </div>
          <div class="text-right w-full">
            <span class="text-primary text-xs font-bold">战斗力: ${calculateEquipmentPower(item)}</span>
          </div>
        </div>
      `;
      cardElement.addEventListener('click', () => showEquipmentDetail(item));
      equipmentList.appendChild(cardElement);
    });
  }

  function showEquipmentDetail(item) {
    if (window.__inventory && typeof window.__inventory.ensureEquipmentInstance === 'function') window.__inventory.ensureEquipmentInstance(item);
    selectedEquipment = item;
    document.getElementById('detailEquipmentName').textContent = item.name;
    document.getElementById('detailEquipmentImage').innerHTML = `<img src="${item.imageUrl}" alt="${item.name}" class="w-full h-full object-contain">`;
    document.getElementById('detailEquipmentRarity').textContent = item.rarity;
    document.getElementById('detailEquipmentRarity').className = `text-rarity-${item.rarity.toLowerCase()} font-bold`;
    document.getElementById('detailEquipmentType').textContent = getSlotName(item.type);

    const maxLevel = getMaxEquipmentLevel(item.rarity);
    document.getElementById('detailEquipmentLevel').textContent = `Lv.${item.level}/${maxLevel}`;

    const attrContainer = document.querySelector('#equipmentDetailModal .space-y-4').nextElementSibling;
    if (attrContainer) attrContainer.innerHTML = renderAttrSections(item, 'equipment');

    const enhanceBtn = document.getElementById('enhanceEquipment');
    ensureMaterials();
    const enhanceCostGold = calculateEnhanceCost(item.level, item.rarity);
    const enhanceCostStone = Math.max(1, Math.ceil((item.level || 1) / 4) * getRarityCostMult(item.rarity));
    const m1 = getMaterialMeta('enhanceStone');
    enhanceBtn.innerHTML = `<i class="fa fa-arrow-up mr-2"></i>升级 (💰${enhanceCostGold} · ${m1.name} ${enhanceCostStone})`;

    const refineBtn = document.getElementById('refineEquipment');
    const refineCost = (window.__inventory && window.__inventory.calculateRefineCost) ? window.__inventory.calculateRefineCost(item.refine) : (item.refine + 1) * 100;
    refineBtn.innerHTML = `<i class="fa fa-diamond mr-2"></i>精炼 (💎${refineCost})`;

    document.getElementById('equipmentDetailModal').classList.remove('hidden');
  }

  function enhanceEquipment() {
    if (typeof selectedEquipment === 'undefined' || !selectedEquipment) return;
    if (window.__inventory && typeof window.__inventory.ensureEquipmentInstance === 'function') window.__inventory.ensureEquipmentInstance(selectedEquipment);
    ensureMaterials();
    const costGold = calculateEnhanceCost(selectedEquipment.level, selectedEquipment.rarity);
    const costStone = Math.max(1, Math.ceil((selectedEquipment.level || 1) / 4) * getRarityCostMult(selectedEquipment.rarity));
    if (gameData.player.gold < costGold) return alert('金币不足！');
    if ((gameData.player.materials.enhanceStone || 0) < costStone) return alert('强化石不足！');
    gameData.player.gold -= costGold;
    gameData.player.materials.enhanceStone -= costStone;
    const gain = Math.floor(55 * getRarityCostMult(selectedEquipment.rarity));
    const maxLevel = (window.__inventory && window.__inventory.getMaxEquipmentLevel) ? window.__inventory.getMaxEquipmentLevel(selectedEquipment.rarity) : 20;
    selectedEquipment.exp = (selectedEquipment.exp || 0) + gain;
    while ((selectedEquipment.level || 1) < maxLevel) {
      const need = (window.__inventory && window.__inventory.getEquipmentExpToNextLevel) ? window.__inventory.getEquipmentExpToNextLevel(selectedEquipment.level || 1, selectedEquipment.rarity) : 999999;
      if ((selectedEquipment.exp || 0) < need) break;
      selectedEquipment.exp -= need;
      selectedEquipment.level = (selectedEquipment.level || 1) + 1;
    }
    updateUI();
    showEquipmentDetail(selectedEquipment);
    if (typeof selectedCharacter !== 'undefined' && selectedCharacter) showCharacterDetail(selectedCharacter);
    saveGameProgress();
  }

  function refineEquipment() {
    if (typeof selectedEquipment === 'undefined' || !selectedEquipment) return;
    const cost = (window.__inventory && window.__inventory.calculateRefineCost) ? window.__inventory.calculateRefineCost(selectedEquipment.refine) : (selectedEquipment.refine + 1) * 100;
    if (gameData.player.gems < cost) {
      alert('钻石不足！');
      return;
    }
    gameData.player.gems -= cost;
    selectedEquipment.refine++;
    const secondaryKeys = ['critRate', 'dodgeRate', 'blockRate', 'dmgReduc', 'lifesteal', 'effectHit'];
    const key = secondaryKeys[Math.floor(Math.random() * secondaryKeys.length)];
    selectedEquipment.attributes[key] = (selectedEquipment.attributes[key] || 0) + 1;
    updateUI();
    showEquipmentDetail(selectedEquipment);
    if (typeof selectedCharacter !== 'undefined' && selectedCharacter) showCharacterDetail(selectedCharacter);
    saveGameProgress();
  }

  function updateInscriptionsList() {
    const inscriptionsList = document.getElementById('inscriptionsList');
    if (!inscriptionsList) return;
    inscriptionsList.innerHTML = '';

    const filterType = document.getElementById('inscriptionFilter').value;
    const sortBy = document.getElementById('inscriptionSort').value;

    let filteredInscriptions = [...gameData.inscriptions];
    if (filterType !== 'all') filteredInscriptions = filteredInscriptions.filter(ins => ins.type === filterType);

    filteredInscriptions.sort((a, b) => {
      if (sortBy === 'level') return b.level - a.level;
      if (sortBy === 'rarity') {
        const rarityOrder = { R: 1, SR: 2, SSR: 3, UR: 4, SUR: 5 };
        return rarityOrder[b.rarity] - rarityOrder[a.rarity];
      }
      return 0;
    });

    filteredInscriptions.forEach(ins => {
      if (window.__inventory && typeof window.__inventory.ensureInscriptionInstance === 'function') window.__inventory.ensureInscriptionInstance(ins);
      const cardElement = document.createElement('div');
      cardElement.className = `glass-effect rounded-lg overflow-hidden card-hover cursor-pointer rarity-border-${ins.rarity.toLowerCase()}`;
      cardElement.innerHTML = `
        <div class="p-3 flex flex-col items-center">
          <div class="w-16 h-16 mb-2">
            <img src="${ins.imageUrl}" alt="${ins.name}" class="w-full h-full object-contain">
          </div>
          <div class="flex items-center mb-1">
            <span class="text-rarity-${ins.rarity.toLowerCase()} font-bold">${ins.rarity}</span>
            <span class="ml-2 px-2 py-0.5 bg-gray-700 rounded text-xs">${getInscriptionTypeName(ins.type)}</span>
          </div>
          <h4 class="font-bold text-center text-sm mb-1">${ins.name}</h4>
          <div class="text-xs text-center text-gray-400 mb-2">Lv.${ins.level}</div>
          <div class="w-full bg-gray-700 rounded-full h-1 mb-2">
            <div class="bg-primary h-1 rounded-full" style="width: ${(ins.exp / calculateInscriptionExpToNextLevel(ins.level)) * 100}%"></div>
          </div>
          <div class="text-center text-xs">
            <span class="text-primary font-bold">${getAttributeName(Object.keys(ins.attributes)[0])}: ${ins.attributes[Object.keys(ins.attributes)[0]]}</span>
          </div>
        </div>
      `;
      cardElement.addEventListener('click', () => showInscriptionDetail(ins));
      inscriptionsList.appendChild(cardElement);
    });
  }

  function showInscriptionDetail(ins) {
    if (window.__inventory && typeof window.__inventory.ensureInscriptionInstance === 'function') window.__inventory.ensureInscriptionInstance(ins);
    selectedInscription = ins;
    document.getElementById('detailInscriptionName').textContent = ins.name;
    document.getElementById('detailInscriptionImage').innerHTML = `<img src="${ins.imageUrl}" alt="${ins.name}" class="w-full h-full object-contain">`;
    document.getElementById('detailInscriptionRarity').textContent = ins.rarity;
    document.getElementById('detailInscriptionRarity').className = `text-rarity-${ins.rarity.toLowerCase()} font-bold`;
    document.getElementById('detailInscriptionType').textContent = getInscriptionTypeName(ins.type);

    document.getElementById('detailInscriptionLevel').textContent = `${ins.level}/10`;
    document.getElementById('detailInscriptionExpBar').style.width = `${(ins.exp / calculateInscriptionExpToNextLevel(ins.level)) * 100}%`;

    document.querySelector('#detailInscriptionExpBar').parentNode.nextElementSibling.innerHTML = renderAttrSections(ins, 'inscription');
    document.getElementById('detailInscriptionSetEffect').textContent = `${ins.setEffect.pieces}个${ins.name.split('铭文')[0]}铭文: ${ins.setEffect.effect}`;
    document.getElementById('inscriptionDetailModal').classList.remove('hidden');
  }

  function upgradeInscription() {
    if (typeof selectedInscription === 'undefined' || !selectedInscription) return;
    if (selectedInscription.level >= 10) {
      alert('已达到最高等级！');
      return;
    }
    if (window.__inventory && typeof window.__inventory.ensureInscriptionInstance === 'function') window.__inventory.ensureInscriptionInstance(selectedInscription);
    ensureMaterials();

    const availableMaterials = gameData.inscriptions.filter(ins =>
      ins !== selectedInscription && ins.level <= selectedInscription.level
    );
    if (availableMaterials.length < 1) {
      alert('需要1个其他铭文作为升级材料！');
      return;
    }

    const materialIndex = gameData.inscriptions.findIndex(ins =>
      ins !== selectedInscription && ins.level <= selectedInscription.level
    );
    if (materialIndex !== -1) {
      const material = gameData.inscriptions[materialIndex];
      gameData.inscriptions.splice(materialIndex, 1);
      const expGain = (window.__inventory && window.__inventory.getInscriptionFeedExp) ? window.__inventory.getInscriptionFeedExp(material) : (50 * material.level);
      const dustCost = Math.max(1, Math.ceil(expGain / 45) * getRarityCostMult(selectedInscription.rarity));
      if ((gameData.player.materials.inscriptionDust || 0) < dustCost) {
        alert('铭文粉尘不足！');
        gameData.inscriptions.push(material);
        return;
      }
      gameData.player.materials.inscriptionDust -= dustCost;
      selectedInscription.exp += expGain;
      while (selectedInscription.exp >= calculateInscriptionExpToNextLevel(selectedInscription.level) && selectedInscription.level < 10) {
        selectedInscription.exp -= calculateInscriptionExpToNextLevel(selectedInscription.level);
        selectedInscription.level++;
      }
    }

    document.getElementById('detailInscriptionLevel').textContent = `${selectedInscription.level}/10`;
    document.getElementById('detailInscriptionExpBar').style.width = `${(selectedInscription.exp / calculateInscriptionExpToNextLevel(selectedInscription.level)) * 100}%`;

    document.querySelector('#detailInscriptionExpBar').parentNode.nextElementSibling.innerHTML = renderAttrSections(selectedInscription, 'inscription');
    updateInscriptionsList();
    saveGameProgress();
  }

  function embedInscription() {
    if (typeof selectedInscription === 'undefined' || !selectedInscription) return;
    if (typeof selectedCharacter === 'undefined' || !selectedCharacter) {
      switchPage('characters');
      alert('请先在养成界面选择一个角色，再执行铭文镶嵌。');
      return;
    }
    const useFirst = confirm('镶嵌到铭文槽位 1？\n取消则镶嵌到槽位 2。');
    const idx = useFirst ? 0 : 1;
    selectedCharacter.inscriptions[idx] = selectedInscription;
    saveGameProgress();
    updateUI();
    selectCharacterToCultivate(selectedCharacter);
    document.getElementById('inscriptionDetailModal').classList.add('hidden');
    alert('铭文镶嵌成功！');
  }

  const api = {
    updateEquipmentList,
    showEquipmentDetail,
    enhanceEquipment,
    refineEquipment,
    updateInscriptionsList,
    showInscriptionDetail,
    upgradeInscription,
    embedInscription
  };
  if (window.Game && window.Game.ui) window.Game.ui.inventory = api;
  window.__uiInventory = api;
})();
