(() => {
  function updateCharacterSelectionBar() {
    const bar = document.getElementById('characterSelectionBar');
    if (!bar) return;
    bar.innerHTML = '';

    const filterEl = document.getElementById('characterFilter');
    const filter = filterEl ? filterEl.value : 'all';
    const filtered = filter === 'all' ? gameData.characters : gameData.characters.filter(c => c.rarity === filter);
    ensureFormation();
    const formationIds = new Set((gameData.formation || []).filter(Boolean));
    const rarityOrder = { R: 1, SR: 2, SSR: 3, UR: 4, SUR: 5 };
    const sorted = [...filtered].sort((a, b) => {
      const aIn = formationIds.has(a.id) ? 1 : 0;
      const bIn = formationIds.has(b.id) ? 1 : 0;
      if (aIn !== bIn) return bIn - aIn;

      const ar = rarityOrder[a.rarity] || 0;
      const br = rarityOrder[b.rarity] || 0;
      if (ar !== br) return br - ar;

      const ap = calculateCharacterPower(a);
      const bp = calculateCharacterPower(b);
      if (ap !== bp) return bp - ap;

      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN');
    });

    sorted.forEach(char => {
      const item = document.createElement('div');
      const isActive = selectedCharacter && selectedCharacter.instanceId === char.instanceId;
      item.className = `flex-shrink-0 w-16 h-16 rounded-lg border-2 cursor-pointer transition-all snap-start overflow-hidden relative ${isActive ? 'border-primary scale-110 z-10' : 'border-gray-800 opacity-70 hover:opacity-100'}`;
      item.setAttribute('data-instance-id', String(char.instanceId || ''));
      item.innerHTML = `
        <img src="${char.imageUrl}" class="w-full h-full object-cover">
        <div class="absolute top-1 right-1 bg-black bg-opacity-70 rounded-full px-1.5 py-0.5 text-[8px] font-black text-white">Lv.${char.level || 1}</div>
        <div class="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-[8px] text-center font-bold text-rarity-${char.rarity.toLowerCase()}">
          ${char.rarity}
        </div>
      `;
      item.onclick = () => selectCharacterToCultivate(char);
      bar.appendChild(item);
    });
  }

  function selectCharacterToCultivate(char) {
    selectedCharacter = char;
    const stats = calculateTotalStats(char);
    const powerValue = calculateCharacterPower(char);

    const portraitContainer = document.getElementById('cultivateBigImage') ? document.getElementById('cultivateBigImage').parentElement : null;
    if (portraitContainer) {
      portraitContainer.className = portraitContainer.className.replace(/portrait-frame-\w+/g, '');
      portraitContainer.classList.add(`portrait-frame-${char.rarity.toLowerCase()}`);
    }

    const nameEl = document.getElementById('cultivateName');
    if (nameEl) nameEl.textContent = char.name;

    const rarityEl = document.getElementById('cultivateRarity');
    if (rarityEl) {
      rarityEl.textContent = char.rarity;
      rarityEl.className = `text-xl font-black mb-4 tracking-widest text-rarity-${char.rarity.toLowerCase()}`;
    }

    const levelEl = document.getElementById('cultivateLevel');
    if (levelEl) levelEl.textContent = `Lv.${char.level || 1}`;

    const powerEl = document.querySelector('#cultivatePower div:last-child');
    if (powerEl) powerEl.textContent = powerValue.toLocaleString();

    const factionEl = document.getElementById('cultivateFaction');
    if (factionEl) factionEl.textContent = char.faction || '未知';

    const classEl = document.getElementById('cultivateClass');
    if (classEl) classEl.textContent = getClassName(char.class);

    const nameMobile = document.getElementById('cultivateNameMobile');
    if (nameMobile) nameMobile.textContent = char.name;

    const rarityLarge = document.getElementById('cultivateRarityLarge');
    if (rarityLarge) {
      rarityLarge.textContent = char.rarity;
      rarityLarge.className = `text-6xl font-black italic tracking-tighter mb-2 drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] ${char.rarity === 'SUR' ? 'sur-text' : (char.rarity === 'UR' ? 'ur-text' : (char.rarity === 'SSR' ? 'gold-text' : 'text-white'))}`;
    }

    const starsLarge = document.getElementById('cultivateStarsLarge');
    if (starsLarge) starsLarge.innerHTML = getStarsHtml(char.stars);

    const powerMobile = document.getElementById('cultivatePowerMobile');
    if (powerMobile) powerMobile.textContent = powerValue.toLocaleString();

    const levelMobile = document.getElementById('cultivateLevelMobile');
    if (levelMobile) levelMobile.textContent = `Lv.${char.level || 1}`;

    const classMobile = document.getElementById('cultivateClassMobile');
    if (classMobile) classMobile.textContent = getClassName(char.class);

    const factionMobile = document.getElementById('cultivateFactionMobile');
    if (factionMobile) factionMobile.textContent = char.faction || '未知';

    const rarityRank = { R: 1, SR: 2, SSR: 3, UR: 4, SUR: 5 };
    const awakenBtn = document.getElementById('awakenBtn');
    if (awakenBtn) {
      if (rarityRank[char.rarity] >= 4) awakenBtn.classList.remove('hidden');
      else awakenBtn.classList.add('hidden');
      const awakened = !!char.awakened;
      awakenBtn.disabled = false;
      awakenBtn.classList.toggle('opacity-60', awakened);
      awakenBtn.innerHTML = awakened ? '<i class="fa fa-check mr-1 text-yellow-500"></i>已觉醒' : '<i class="fa fa-fire mr-1 text-yellow-500"></i>觉醒';
    }

    const skillsContainer = document.getElementById('cultivateSkills');
    if (skillsContainer) {
      skillsContainer.innerHTML = '';
      (char.skills || []).forEach((skill, idx) => {
        const skillIcon = document.createElement('div');
        skillIcon.className = 'w-10 h-10 bg-gray-800 rounded border border-gray-700 flex items-center justify-center cursor-pointer hover:border-primary transition-all relative group';
        skillIcon.innerHTML = `
          <img src="./assets/icon/sinusoidal-beam.svg" class="w-5 h-5 opacity-70 group-hover:opacity-100" alt="技能">
          <div class="absolute -top-1 -right-1 bg-primary text-[8px] px-1 rounded">Lv.${skill.level || 1}</div>
        `;
        skillIcon.onclick = () => showSkillPopup(skill);
        skillsContainer.appendChild(skillIcon);
      });

      const passiveIcon = document.createElement('div');
      const hasPassive = !!(char.passive && String(char.passive).trim());
      passiveIcon.className = `w-10 h-10 bg-gray-800 rounded border border-gray-700 flex items-center justify-center transition-all relative group ${hasPassive ? 'cursor-pointer hover:border-purple-500' : 'opacity-50 cursor-not-allowed'}`;
      passiveIcon.innerHTML = `
        <img src="./assets/icon/rogue.svg" class="w-5 h-5 opacity-70 ${hasPassive ? 'group-hover:opacity-100' : ''}" alt="被动">
        <div class="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-[8px] text-center font-black text-purple-300">被动</div>
      `;
      if (hasPassive) passiveIcon.onclick = () => showPassivePopup(getCharacterPassivePreviewText(char));
      skillsContainer.appendChild(passiveIcon);
    }

    const statsContainer = document.getElementById('cultivateStats');
    if (statsContainer) {
      statsContainer.innerHTML = `
        <div class="flex justify-between border-b border-gray-800 pb-1"><span>攻击力</span><span class="font-bold text-red-400">${stats.attack}</span></div>
        <div class="flex justify-between border-b border-gray-800 pb-1"><span>防御力</span><span class="font-bold text-blue-400">${stats.defense}</span></div>
        <div class="flex justify-between border-b border-gray-800 pb-1"><span>生命值</span><span class="font-bold text-green-400">${stats.health}</span></div>
        <div class="flex justify-between border-b border-gray-800 pb-1"><span>速度</span><span class="font-bold text-yellow-400">${stats.speed}</span></div>
      `;
    }

    const bigImageEl = document.getElementById('cultivateBigImage');
    if (bigImageEl) {
      bigImageEl.innerHTML = `<img src="${char.imageUrl}" class="max-h-full max-w-full object-contain portrait-static pointer-events-none">`;
    }

    document.querySelectorAll('.cultivate-slot').forEach(slotEl => {
      const slotType = slotEl.getAttribute('data-slot');
      if (!slotType) return;
      if (slotType.startsWith('ins-')) {
        const idx = parseInt(slotType.split('-')[1]);
        const ins = char.inscriptions[idx];
        if (ins) slotEl.innerHTML = `<img src="${ins.imageUrl}" class="w-full h-full object-contain rounded-full border border-purple-500 p-1">`;
        else slotEl.innerHTML = `<i class="fa fa-gem text-purple-950"></i>`;
        slotEl.onclick = () => openItemPicker(idx, true);
      } else {
        const item = char.equipments[slotType];
        if (item) slotEl.innerHTML = `<img src="${item.imageUrl}" class="w-full h-full object-contain rounded border border-${item.rarity.toLowerCase()} p-1">`;
        else {
          const icons = { weapon: 'gavel', armor: 'shield', helmet: 'user-secret', shoes: 'paw', accessory: 'sun-o' };
          slotEl.innerHTML = `<i class="fa fa-${icons[slotType]} text-gray-700"></i>`;
        }
        slotEl.onclick = () => openItemPicker(slotType, false);
      }
    });

    document.querySelectorAll('#characterSelectionBar > div').forEach(el => {
      const id = el.getAttribute('data-instance-id');
      const isThis = selectedCharacter && String(selectedCharacter.instanceId || '') === String(id || '');
      if (isThis) {
        el.classList.add('border-primary', 'scale-110', 'z-10');
        el.classList.remove('border-gray-800', 'opacity-70');
      } else {
        el.classList.remove('border-primary', 'scale-110', 'z-10');
        el.classList.add('border-gray-800', 'opacity-70');
      }
    });

    renderCultivateFormationUI();
  }

  function isCharacterInFormation(charId) {
    ensureFormation();
    return gameData.formation.includes(charId);
  }

  function renderCultivateFormationUI() {
    ensureFormation();
    const slotsEl = document.getElementById('cultivateFormationSlots');
    const hintEl = document.getElementById('cultivateFormationHint');
    const toggleBtn = document.getElementById('toggleFormationBtn');
    if (!slotsEl || !hintEl || !toggleBtn) return;

    const ids = gameData.formation;
    slotsEl.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const id = ids[i];
      const char = id ? gameData.characters.find(c => c.id === id) : null;
      const slot = document.createElement('button');
      slot.className = 'h-9 w-9 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center overflow-hidden';
      if (char) {
        slot.innerHTML = `<img src="${char.imageUrl}" class="w-full h-full object-cover">`;
        slot.onclick = () => {
          gameData.formation[i] = null;
          saveGameProgress();
          renderCultivateFormationUI();
        };
      } else {
        slot.innerHTML = `<i class="fa fa-plus text-gray-600 text-xs"></i>`;
      }
      slotsEl.appendChild(slot);
    }

    const activeCount = ids.filter(Boolean).length;
    hintEl.textContent = `已上阵 ${activeCount}/6（点击已上阵头像可移除）`;

    if (!selectedCharacter) {
      toggleBtn.textContent = '加入上阵';
      toggleBtn.disabled = true;
      toggleBtn.classList.add('opacity-60', 'cursor-not-allowed');
      return;
    }
    toggleBtn.disabled = false;
    toggleBtn.classList.remove('opacity-60', 'cursor-not-allowed');
    toggleBtn.textContent = isCharacterInFormation(selectedCharacter.id) ? '移除上阵' : '加入上阵';
  }

  function toggleSelectedCharacterFormation() {
    if (!selectedCharacter) return;
    ensureFormation();
    const id = selectedCharacter.id;
    const idx = gameData.formation.findIndex(x => x === id);
    if (idx >= 0) {
      gameData.formation[idx] = null;
    } else {
      const empty = gameData.formation.findIndex(x => !x);
      if (empty === -1) {
        alert('上阵已满（最多6人）');
        return;
      }
      gameData.formation[empty] = id;
    }
    saveGameProgress();
    renderCultivateFormationUI();
  }

  function resetSelectedCharacter() {
    if (!selectedCharacter) return;
    const char = selectedCharacter;
    const levelRefund = char.goldSpentOnLevelUps || 0;
    const skillsRefund = (char.skills || []).reduce((sum, s) => sum + (s.goldSpentOnUpgrades || 0), 0);
    const refund = levelRefund + skillsRefund;

    const ok = confirm(`确定还原【${char.name}】？\n- 等级/经验重置为 1级\n- 技能等级重置为 1级\n- 卸下装备与铭文（物品不会丢失）\n- 保留星级不变\n- 返还金币：${refund.toLocaleString()}`);
    if (!ok) return;

    gameData.player.gold += refund;
    char.level = 1;
    char.exp = 0;
    char.goldSpentOnLevelUps = 0;

    const master = charactersData ? charactersData.find(c => c.id === char.id) : null;
    if (master && Array.isArray(master.skills)) {
      char.skills = master.skills.map(s => ({
        ...JSON.parse(JSON.stringify(s)),
        level: 1,
        goldSpentOnUpgrades: 0,
        effects: Array.isArray(s.effects) ? s.effects : inferSkillEffects(s)
      }));
    } else {
      (char.skills || []).forEach(s => {
        s.level = 1;
        s.goldSpentOnUpgrades = 0;
      });
    }

    char.equipments = { weapon: null, armor: null, helmet: null, shoes: null, accessory: null };
    char.inscriptions = [null, null];

    saveGameProgress();
    updateUI();
    selectCharacterToCultivate(char);
    alert(`还原完成，已返还金币 ${refund.toLocaleString()}`);
  }

  const api = {
    updateCharacterSelectionBar,
    selectCharacterToCultivate,
    isCharacterInFormation,
    renderCultivateFormationUI,
    toggleSelectedCharacterFormation,
    resetSelectedCharacter
  };
  if (window.Game && window.Game.ui) window.Game.ui.cultivate = api;
  window.__cultivateUI = api;
})();
