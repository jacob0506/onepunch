(() => {
  function showSkillPopup(skill) {
    document.getElementById('skillPopupName').textContent = skill.name;
    document.getElementById('skillPopupLevel').textContent = `等级: ${skill.level || 1}`;
    document.getElementById('skillPopupDesc').textContent = skill.description;
    document.getElementById('skillPopupCD').textContent = skill.cooldown;
    document.getElementById('skillDetailModal').classList.remove('hidden');
  }

  function showPassivePopup(passiveText) {
    const text = String(passiveText || '').trim();
    const parts = text.split('：');
    const name = parts.length > 1 ? parts[0] : '被动';
    const desc = parts.length > 1 ? parts.slice(1).join('：') : (text || '无');
    document.getElementById('skillPopupName').textContent = name;
    document.getElementById('skillPopupLevel').textContent = '类型: 被动';
    document.getElementById('skillPopupDesc').textContent = desc || '无';
    document.getElementById('skillPopupCD').textContent = '-';
    document.getElementById('skillDetailModal').classList.remove('hidden');
  }

  function showDetailedAttributes() {
    if (!selectedCharacter) return;
    const stats = calculateTotalStats(selectedCharacter);
    const listContainer = document.getElementById('detailedStatsList');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const statGroups = [
      { title: '基础属性', keys: ['attack', 'defense', 'health', 'speed'] },
      { title: '特殊属性', keys: ['critRate', 'critDmg', 'dodgeRate', 'blockRate', 'dmgReduc', 'lifesteal', 'effectHit'] }
    ];

    statGroups.forEach(group => {
      const groupTitle = document.createElement('div');
      groupTitle.className = 'text-[10px] text-gray-500 uppercase mt-3 mb-1 font-bold';
      groupTitle.textContent = group.title;
      listContainer.appendChild(groupTitle);

      group.keys.forEach(key => {
        const row = document.createElement('div');
        row.className = 'flex justify-between items-center py-1 border-b border-gray-800 text-xs';
        const isPercent = key.includes('Rate') || key.includes('Dmg') || key.includes('Reduc') || key.includes('Hit') || key.includes('lifesteal');
        const val = stats[key] || 0;
        const displayVal = isPercent ? `${val}%` : val.toLocaleString();
        row.innerHTML = `
          <span class="text-gray-400">${getStatName(key)}</span>
          <span class="font-bold text-white">${displayVal}</span>
        `;
        listContainer.appendChild(row);
      });
    });

    document.getElementById('attributeDetailModal').classList.remove('hidden');
  }

  function openAwakenModal(allowInfo = false) {
    if (!selectedCharacter) return;
    const char = selectedCharacter;
    if (char.rarity !== 'UR' && char.rarity !== 'SUR') return;
    const profile = getAwakenProfile(char);
    const cost = getAwakenCost(char);
    if (!profile) return;

    document.getElementById('awakenTitle').textContent = `${char.name} · ${profile.name}`;
    const bonusParts = [];
    Object.entries(profile.bonus || {}).forEach(([k, v]) => {
      const isPercent = k.includes('Rate') || k.includes('Reduc') || k.includes('Hit') || k.includes('Percent') || ['critRate', 'critDmg', 'dodgeRate', 'blockRate', 'dmgReduc', 'lifesteal', 'effectHit', 'tenacity', 'atkPercent', 'defPercent', 'hpPercent'].includes(k);
      bonusParts.push(`${getStatName(k)} +${v}${isPercent ? '%' : ''}`);
    });
    const extra = profile.passiveEffect ? `\n觉醒机制：${profile.passiveEffect}` : '';
    document.getElementById('awakenDesc').textContent = `${profile.desc}\n${bonusParts.join('，')}${extra}`;

    const costEl = document.getElementById('awakenCost');
    const confirmBtn = document.getElementById('awakenConfirmBtn');
    const showInfo = !!char.awakened || !cost || !allowInfo;
    if (showInfo) {
      if (costEl) {
        costEl.innerHTML = '';
        costEl.classList.add('hidden');
      }
      if (confirmBtn) confirmBtn.classList.add('hidden');
    } else {
      const ownedFrag = gameData.fragments[char.id] || 0;
      if (costEl) {
        costEl.classList.remove('hidden');
        costEl.innerHTML = `
          <div class="flex justify-between"><span>金币</span><span class="font-black ${gameData.player.gold >= cost.gold ? 'text-yellow-400' : 'text-red-400'}">${cost.gold.toLocaleString()}</span></div>
          <div class="flex justify-between"><span>钻石</span><span class="font-black ${gameData.player.gems >= cost.gems ? 'text-yellow-400' : 'text-red-400'}">${cost.gems.toLocaleString()}</span></div>
          <div class="flex justify-between"><span>碎片</span><span class="font-black ${ownedFrag >= cost.fragments ? 'text-yellow-400' : 'text-red-400'}">${ownedFrag}/${cost.fragments}</span></div>
        `;
      }
      if (confirmBtn) confirmBtn.classList.remove('hidden');
    }

    document.getElementById('awakenModal').classList.remove('hidden');
  }

  function confirmAwaken() {
    if (!selectedCharacter) return;
    const char = selectedCharacter;
    if (char.awakened) return;
    if (char.rarity !== 'UR' && char.rarity !== 'SUR') return;
    const profile = getAwakenProfile(char);
    const cost = getAwakenCost(char);
    if (!profile || !cost) return;

    const ownedFrag = gameData.fragments[char.id] || 0;
    if (gameData.player.gold < cost.gold) {
      alert('金币不足');
      return;
    }
    if (gameData.player.gems < cost.gems) {
      alert('钻石不足');
      return;
    }
    if (ownedFrag < cost.fragments) {
      alert('碎片不足');
      return;
    }
    const ok = confirm(`确认觉醒【${char.name}】？\n- 觉醒仅一次且永久生效\n- 消耗：金币${cost.gold}，钻石${cost.gems}，碎片${cost.fragments}`);
    if (!ok) return;

    gameData.player.gold -= cost.gold;
    gameData.player.gems -= cost.gems;
    gameData.fragments[char.id] = ownedFrag - cost.fragments;

    char.awakened = true;
    char.awakenedAt = Date.now();

    saveGameProgress();
    updateUI();
    selectCharacterToCultivate(char);
    document.getElementById('awakenModal').classList.add('hidden');
    alert(`觉醒完成：${profile.name}`);
  }

  const api = {
    showSkillPopup,
    showPassivePopup,
    showDetailedAttributes,
    openAwakenModal,
    confirmAwaken
  };
  if (window.Game && window.Game.ui) window.Game.ui.modals = api;
  window.__modalsUI = api;
})();

