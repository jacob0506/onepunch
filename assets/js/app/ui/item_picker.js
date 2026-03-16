(() => {
  function openItemPicker(slot, isIns) {
    if (typeof selectedCharacter === 'undefined' || !selectedCharacter) return;
    selectedSlot = slot;
    isSelectingInscription = isIns;

    const pickerModal = document.getElementById('itemPickerModal');
    const listContainer = document.getElementById('itemPickerList');
    const title = document.getElementById('itemPickerTitle');
    if (!pickerModal || !listContainer || !title) return;

    title.textContent = isIns ? `选择铭文 (槽位 ${slot + 1})` : `选择装备 (${getSlotName(slot)})`;
    listContainer.innerHTML = '';

    const items = isIns ? gameData.inscriptions : gameData.equipment;
    const filteredItems = isIns ? items : items.filter(item => item.type === slot);

    const availableItems = filteredItems.filter(item => {
      const isEquippedByAnyone = gameData.characters.some(char => {
        if (isIns) return char.inscriptions.some(i => i && i.instanceId === item.instanceId);
        return Object.values(char.equipments).some(e => e && e.instanceId === item.instanceId);
      });
      let isEquippedByCurrentCharacter = false;
      if (isIns) {
        isEquippedByCurrentCharacter = selectedCharacter.inscriptions[slot] && selectedCharacter.inscriptions[slot].instanceId === item.instanceId;
      } else {
        isEquippedByCurrentCharacter = selectedCharacter.equipments[slot] && selectedCharacter.equipments[slot].instanceId === item.instanceId;
      }
      return !isEquippedByAnyone || isEquippedByCurrentCharacter;
    });

    if (availableItems.length === 0) {
      listContainer.innerHTML = '<div class="text-center text-gray-500 py-4">暂无可用物品</div>';
    } else {
      availableItems.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700 hover:border-primary cursor-pointer transition-colors';

        let attrText = '';
        for (const [key, val] of Object.entries(item.attributes)) {
          attrText += `<span class="mr-2">${getStatName(key)}+${val}${key.includes('Rate') || key.includes('Reduc') || key.includes('Hit') || key.includes('Percent') ? '%' : ''}</span>`;
        }

        itemEl.innerHTML = `
          <div class="flex items-center">
            <img src="${item.imageUrl}" class="w-10 h-10 object-contain mr-3 p-1 border border-${item.rarity.toLowerCase()} rounded">
            <div>
              <h4 class="font-bold text-sm text-rarity-${item.rarity.toLowerCase()}">${item.name} <span class="text-xs text-gray-500 ml-1">Lv.${item.level || 1}</span></h4>
              <div class="text-[10px] text-gray-400 mt-1 flex flex-wrap">${attrText}</div>
            </div>
          </div>
          <button class="px-3 py-1 bg-primary text-white text-xs rounded font-bold">装备</button>
        `;
        itemEl.onclick = () => equipItem(item);
        listContainer.appendChild(itemEl);
      });
    }

    pickerModal.classList.remove('hidden');
  }

  function equipItem(item) {
    if (typeof selectedCharacter === 'undefined' || !selectedCharacter || typeof selectedSlot === 'undefined' || selectedSlot === null) return;
    if (isSelectingInscription) selectedCharacter.inscriptions[selectedSlot] = item;
    else selectedCharacter.equipments[selectedSlot] = item;
    document.getElementById('itemPickerModal').classList.add('hidden');
    selectCharacterToCultivate(selectedCharacter);
    updateUI();
    saveGameProgress();
  }

  function unequipItem() {
    if (typeof selectedCharacter === 'undefined' || !selectedCharacter || typeof selectedSlot === 'undefined' || selectedSlot === null) return;
    if (isSelectingInscription) selectedCharacter.inscriptions[selectedSlot] = null;
    else selectedCharacter.equipments[selectedSlot] = null;
    document.getElementById('itemPickerModal').classList.add('hidden');
    selectCharacterToCultivate(selectedCharacter);
    updateUI();
    saveGameProgress();
  }

  function getSlotName(slot) {
    const names = { weapon: '武器', armor: '防具', helmet: '头盔', shoes: '鞋子', accessory: '饰品' };
    return names[slot] || slot;
  }

  function getStatName(key) {
    const names = {
      attack: '攻击力', defense: '防御力', health: '生命值', speed: '速度',
      atkPercent: '攻击加成', defPercent: '防御加成', hpPercent: '生命加成',
      critRate: '暴击率', critDmg: '暴击伤害', blockRate: '格挡率', dodgeRate: '闪避率',
      dmgReduc: '免伤率', lifesteal: '吸血率', effectHit: '效果命中',
      penetration: '无视防御', tenacity: '韧性'
    };
    return names[key] || key;
  }

  const api = { openItemPicker, equipItem, unequipItem, getSlotName, getStatName };
  if (window.Game && window.Game.ui) window.Game.ui.itemPicker = api;
  window.__itemPicker = api;
})();
