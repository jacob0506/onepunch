(() => {
  function ensureAllInstances() {
    if (!gameData) return;
    let changed = false;
    if (window.__inventory && typeof window.__inventory.ensureEquipmentInstance === 'function' && Array.isArray(gameData.equipment)) {
      gameData.equipment.forEach(it => {
        if (!it) return;
        const had = Array.isArray(it.extraKeys) ? it.extraKeys.length : 0;
        const hadBase = it.baseAttributes && Object.keys(it.baseAttributes).length > 0;
        window.__inventory.ensureEquipmentInstance(it);
        const now = Array.isArray(it.extraKeys) ? it.extraKeys.length : 0;
        const nowBase = it.baseAttributes && Object.keys(it.baseAttributes).length > 0;
        if ((had === 0 && now > 0) || (!hadBase && nowBase)) changed = true;
      });
    }
    if (window.__inventory && typeof window.__inventory.ensureInscriptionInstance === 'function' && Array.isArray(gameData.inscriptions)) {
      gameData.inscriptions.forEach(it => {
        if (!it) return;
        const had = Array.isArray(it.extraKeys) ? it.extraKeys.length : 0;
        const hadBase = it.baseAttributes && Object.keys(it.baseAttributes).length > 0;
        window.__inventory.ensureInscriptionInstance(it);
        const now = Array.isArray(it.extraKeys) ? it.extraKeys.length : 0;
        const nowBase = it.baseAttributes && Object.keys(it.baseAttributes).length > 0;
        if ((had === 0 && now > 0) || (!hadBase && nowBase)) changed = true;
      });
    }
    if (changed && typeof saveGameProgress === 'function') saveGameProgress();
  }

  function findEquippedOwner(item, kind) {
    if (!item || !gameData || !Array.isArray(gameData.characters)) return null;
    const instId = item.instanceId;
    for (const c of gameData.characters) {
      if (!c) continue;
      if (kind === 'inscription') {
        const list = Array.isArray(c.inscriptions) ? c.inscriptions : [];
        const idx = list.findIndex(x => x && x.instanceId === instId);
        if (idx >= 0) return { char: c, slot: idx };
      } else {
        const eq = c.equipments || {};
        for (const [slot, v] of Object.entries(eq)) {
          if (v && v.instanceId === instId) return { char: c, slot };
        }
      }
    }
    return null;
  }

  function isSelectedCharacterEquipped(item, kind) {
    if (!item || typeof selectedCharacter === 'undefined' || !selectedCharacter) return null;
    const instId = item.instanceId;
    if (kind === 'inscription') {
      const list = Array.isArray(selectedCharacter.inscriptions) ? selectedCharacter.inscriptions : [];
      const idx = list.findIndex(x => x && x.instanceId === instId);
      return idx >= 0 ? idx : null;
    }
    const eq = selectedCharacter.equipments || {};
    for (const [slot, v] of Object.entries(eq)) {
      if (v && v.instanceId === instId) return slot;
    }
    return null;
  }

  function isPercentAttr(key) {
    return key.includes('Rate') || key.includes('Reduc') || key.includes('Hit') || key.includes('Percent') || ['atkPercent', 'defPercent', 'hpPercent', 'critDmg', 'penetration', 'tenacity'].includes(key);
  }

  function formatAttrValue(key, val, leveledBonus) {
    const raw = typeof val === 'number' ? val : 0;
    const v = leveledBonus ? Math.floor(raw * leveledBonus) : raw;
    return `${v}${isPercentAttr(key) ? '%' : ''}`;
  }

  function getRarityClass(rarity) {
    const r = String(rarity || 'R').toLowerCase();
    return `text-rarity-${r}`;
  }

  function getEquipmentTypeName(type) {
    if (typeof window.getEquipmentTypeName === 'function') return window.getEquipmentTypeName(type);
    const map = { weapon: '武器', armor: '防具', helmet: '头盔', shoes: '鞋子', accessory: '饰品' };
    return map[type] || type;
  }

  function getInscriptionTypeName(type) {
    if (typeof window.getInscriptionTypeName === 'function') return window.getInscriptionTypeName(type);
    return type;
  }

  function getStatNameSafe(key) {
    if (typeof getStatName === 'function') {
      const n = getStatName(key);
      if (n) return n;
    }
    const names = { attack: '攻击力', defense: '防御力', health: '生命值', speed: '速度', atkPercent: '攻击加成', defPercent: '防御加成', hpPercent: '生命加成', critRate: '暴击率', critDmg: '暴击伤害', dodgeRate: '闪避率', blockRate: '格挡率', dmgReduc: '免伤率', lifesteal: '吸血率', effectHit: '效果命中', penetration: '穿透', tenacity: '韧性' };
    return names[key] || key;
  }

  function byRarityRank(r) {
    const order = { R: 1, SR: 2, SSR: 3, UR: 4, SUR: 5 };
    return order[r] || 0;
  }

  function findMaterialEquipment(excludeInstanceId) {
    if (!gameData || !Array.isArray(gameData.equipment)) return null;
    const candidates = gameData.equipment.filter(it => it && it.instanceId !== excludeInstanceId && !findEquippedOwner(it, 'equipment'));
    candidates.sort((a, b) => {
      const ar = byRarityRank(a.rarity);
      const br = byRarityRank(b.rarity);
      if (ar !== br) return ar - br;
      const al = a.level || 1;
      const bl = b.level || 1;
      if (al !== bl) return al - bl;
      return (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN');
    });
    return candidates[0] || null;
  }

  function findMaterialInscription(excludeInstanceId) {
    if (!gameData || !Array.isArray(gameData.inscriptions)) return null;
    const candidates = gameData.inscriptions.filter(it => it && it.instanceId !== excludeInstanceId && !findEquippedOwner(it, 'inscription'));
    candidates.sort((a, b) => {
      const ar = byRarityRank(a.rarity);
      const br = byRarityRank(b.rarity);
      if (ar !== br) return ar - br;
      const al = a.level || 1;
      const bl = b.level || 1;
      if (al !== bl) return al - bl;
      return (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN');
    });
    return candidates[0] || null;
  }

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

  function applyEquipmentUpgrade(target, material) {
    if (!target) return false;
    const maxLevel = (window.__inventory && window.__inventory.getMaxEquipmentLevel) ? window.__inventory.getMaxEquipmentLevel(target.rarity) : 20;
    if ((target.level || 1) >= maxLevel) return false;
    const gain = material
      ? ((window.__inventory && window.__inventory.getEquipmentFeedExp) ? window.__inventory.getEquipmentFeedExp(material) : 40)
      : 100;
    const goldCost = Math.max(0, Math.floor(gain * 2.2));
    const stoneCost = Math.max(1, Math.ceil(gain / 55) * getRarityCostMult(target.rarity));
    ensureMaterials();
    if (gameData.player.gold < goldCost) {
      alert('金币不足');
      return false;
    }
    if ((gameData.player.materials.enhanceStone || 0) < stoneCost) {
      alert('强化石不足');
      return false;
    }
    gameData.player.gold -= goldCost;
    gameData.player.materials.enhanceStone -= stoneCost;

    target.exp = (target.exp || 0) + gain;
    while ((target.level || 1) < maxLevel) {
      const need = (window.__inventory && window.__inventory.getEquipmentExpToNextLevel) ? window.__inventory.getEquipmentExpToNextLevel(target.level || 1, target.rarity) : 999999;
      if ((target.exp || 0) < need) break;
      target.exp -= need;
      target.level = (target.level || 1) + 1;
    }
    return { gain, goldCost, stoneCost };
  }

  function applyInscriptionUpgrade(target, material) {
    if (!target) return false;
    if ((target.level || 1) >= 10) return false;
    const gain = material
      ? ((window.__inventory && window.__inventory.getInscriptionFeedExp) ? window.__inventory.getInscriptionFeedExp(material) : 35)
      : 45;
    const dustCost = Math.max(1, Math.ceil(gain / 45) * getRarityCostMult(target.rarity));
    ensureMaterials();
    if ((gameData.player.materials.inscriptionDust || 0) < dustCost) {
      alert('铭文粉尘不足');
      return false;
    }
    gameData.player.materials.inscriptionDust -= dustCost;
    target.exp = (target.exp || 0) + gain;
    while ((target.level || 1) < 10) {
      const need = (window.__inventory && window.__inventory.calculateInscriptionExpToNextLevel) ? window.__inventory.calculateInscriptionExpToNextLevel(target.level || 1) : 999999;
      if ((target.exp || 0) < need) break;
      target.exp -= need;
      target.level = (target.level || 1) + 1;
    }
    return { gain, dustCost };
  }

  function getModalEls() {
    return {
      modal: document.getElementById('backpackModal'),
      tabs: document.querySelectorAll('[data-backpack-tab]'),
      title: document.getElementById('backpackTitle'),
      list: document.getElementById('backpackList'),
      detail: document.getElementById('backpackDetail'),
      close: document.getElementById('closeBackpackModal')
    };
  }

  const state = { tab: 'equipment', selectedId: null, selectedKind: null };

  function open(kind = 'equipment') {
    const els = getModalEls();
    if (!els.modal) return;
    ensureAllInstances();
    state.tab = kind === 'inscription' ? 'inscription' : 'equipment';
    state.selectedId = null;
    state.selectedKind = null;
    els.modal.classList.remove('hidden');
    render();
  }

  function close() {
    const els = getModalEls();
    if (!els.modal) return;
    els.modal.classList.add('hidden');
  }

  function setTab(kind) {
    state.tab = kind;
    state.selectedId = null;
    state.selectedKind = null;
    render();
  }

  function renderList() {
    const els = getModalEls();
    if (!els.list) return;
    els.list.innerHTML = '';

    if (state.tab === 'equipment') {
      const list = Array.isArray(gameData.equipment) ? gameData.equipment : [];
      if (list.length === 0) {
        els.list.innerHTML = `<div class="text-gray-500 text-sm text-center py-8">暂无装备</div>`;
        return;
      }
      const sorted = [...list];
      sorted.sort((a, b) => {
        const ar = byRarityRank(a.rarity);
        const br = byRarityRank(b.rarity);
        if (ar !== br) return br - ar;
        const al = a.level || 1;
        const bl = b.level || 1;
        if (al !== bl) return bl - al;
        return (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN');
      });
      sorted.forEach(item => {
        if (window.__inventory && typeof window.__inventory.ensureEquipmentInstance === 'function') window.__inventory.ensureEquipmentInstance(item);
        const owner = findEquippedOwner(item, 'equipment');
        const equippedBadge = owner ? `<span class="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-black/50 border border-gray-700 text-gray-300">已装备</span>` : '';
        const row = document.createElement('button');
        row.type = 'button';
        row.className = `w-full text-left p-3 rounded-xl border ${state.selectedId === item.instanceId ? 'border-primary bg-black/40' : 'border-gray-800 bg-black/20 hover:bg-black/35'} flex items-center gap-3`;
        const img = item.imageUrl ? `<img src="${item.imageUrl}" class="w-10 h-10 object-contain rounded bg-black/30 border border-gray-800" data-img="1">` : `<div class="w-10 h-10 rounded bg-black/30 border border-gray-800 flex items-center justify-center"><i class="fa fa-cube text-gray-500"></i></div>`;
        row.innerHTML = `
          ${img}
          <div class="min-w-0 flex-1">
            <div class="flex items-center">
              <div class="font-black truncate ${getRarityClass(item.rarity)}">${item.name || '装备'}</div>
              ${equippedBadge}
            </div>
            <div class="text-[10px] text-gray-400 mt-1 flex items-center justify-between">
              <span>${getEquipmentTypeName(item.type)} · Lv.${item.level || 1}</span>
              <span>词条 ${(Array.isArray(item.extraKeys) ? item.extraKeys.length : 0)}</span>
            </div>
          </div>
        `;
        row.onclick = () => {
          state.selectedId = item.instanceId;
          state.selectedKind = 'equipment';
          render();
        };
        els.list.appendChild(row);
      });
    } else {
      const list = Array.isArray(gameData.inscriptions) ? gameData.inscriptions : [];
      if (list.length === 0) {
        els.list.innerHTML = `<div class="text-gray-500 text-sm text-center py-8">暂无铭文</div>`;
        return;
      }
      const sorted = [...list];
      sorted.sort((a, b) => {
        const ar = byRarityRank(a.rarity);
        const br = byRarityRank(b.rarity);
        if (ar !== br) return br - ar;
        const al = a.level || 1;
        const bl = b.level || 1;
        if (al !== bl) return bl - al;
        return (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN');
      });
      sorted.forEach(item => {
        if (window.__inventory && typeof window.__inventory.ensureInscriptionInstance === 'function') window.__inventory.ensureInscriptionInstance(item);
        const owner = findEquippedOwner(item, 'inscription');
        const equippedBadge = owner ? `<span class="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-black/50 border border-gray-700 text-gray-300">已镶嵌</span>` : '';
        const row = document.createElement('button');
        row.type = 'button';
        row.className = `w-full text-left p-3 rounded-xl border ${state.selectedId === item.instanceId ? 'border-primary bg-black/40' : 'border-gray-800 bg-black/20 hover:bg-black/35'} flex items-center gap-3`;
        const img = item.imageUrl ? `<img src="${item.imageUrl}" class="w-10 h-10 object-contain rounded-full bg-black/30 border border-gray-800" data-img="1">` : `<div class="w-10 h-10 rounded-full bg-black/30 border border-gray-800 flex items-center justify-center"><i class="fa fa-gem text-gray-500"></i></div>`;
        row.innerHTML = `
          ${img}
          <div class="min-w-0 flex-1">
            <div class="flex items-center">
              <div class="font-black truncate ${getRarityClass(item.rarity)}">${item.name || '铭文'}</div>
              ${equippedBadge}
            </div>
            <div class="text-[10px] text-gray-400 mt-1 flex items-center justify-between">
              <span>${getInscriptionTypeName(item.type)} · Lv.${item.level || 1}</span>
              <span>词条 ${(Array.isArray(item.extraKeys) ? item.extraKeys.length : 0)}</span>
            </div>
          </div>
        `;
        row.onclick = () => {
          state.selectedId = item.instanceId;
          state.selectedKind = 'inscription';
          render();
        };
        els.list.appendChild(row);
      });
    }

    els.list.querySelectorAll('img[data-img]').forEach(img => {
      img.onerror = () => {
        const wrap = document.createElement('div');
        wrap.className = img.className.includes('rounded-full')
          ? 'w-10 h-10 rounded-full bg-black/30 border border-gray-800 flex items-center justify-center'
          : 'w-10 h-10 rounded bg-black/30 border border-gray-800 flex items-center justify-center';
        wrap.innerHTML = `<i class="fa fa-image text-gray-600"></i>`;
        img.replaceWith(wrap);
      };
    });
  }

  function renderDetail() {
    const els = getModalEls();
    if (!els.detail) return;
    els.detail.innerHTML = '';

    const kind = state.selectedKind;
    if (!kind || !state.selectedId) {
      els.detail.innerHTML = `<div class="text-gray-500 text-sm text-center py-10">点击左侧物品查看详情</div>`;
      return;
    }

    const list = kind === 'equipment' ? (Array.isArray(gameData.equipment) ? gameData.equipment : []) : (Array.isArray(gameData.inscriptions) ? gameData.inscriptions : []);
    const item = list.find(x => x && x.instanceId === state.selectedId);
    if (!item) {
      els.detail.innerHTML = `<div class="text-gray-500 text-sm text-center py-10">物品不存在</div>`;
      return;
    }

    if (kind === 'equipment' && window.__inventory && typeof window.__inventory.ensureEquipmentInstance === 'function') window.__inventory.ensureEquipmentInstance(item);
    if (kind === 'inscription' && window.__inventory && typeof window.__inventory.ensureInscriptionInstance === 'function') window.__inventory.ensureInscriptionInstance(item);

    const equippedSlot = isSelectedCharacterEquipped(item, kind === 'inscription' ? 'inscription' : 'equipment');
    const owner = findEquippedOwner(item, kind === 'inscription' ? 'inscription' : 'equipment');
    const ownedBySelected = !!(owner && typeof selectedCharacter !== 'undefined' && selectedCharacter && owner.char && owner.char.instanceId === selectedCharacter.instanceId);
    const blockedByOther = !!(owner && !ownedBySelected);

    const header = document.createElement('div');
    header.className = 'bg-black/20 border border-gray-800 rounded-xl p-4';
    const imgWrap = document.createElement('div');
    imgWrap.className = 'w-16 h-16 rounded-xl bg-black/30 border border-gray-800 flex items-center justify-center overflow-hidden flex-shrink-0';
    if (item.imageUrl) {
      const img = document.createElement('img');
      img.src = item.imageUrl;
      img.className = kind === 'inscription' ? 'w-full h-full object-contain' : 'w-full h-full object-contain';
      img.onerror = () => { imgWrap.innerHTML = `<i class="fa fa-image text-gray-600 text-xl"></i>`; };
      imgWrap.appendChild(img);
    } else {
      imgWrap.innerHTML = kind === 'inscription' ? `<i class="fa fa-gem text-gray-600 text-xl"></i>` : `<i class="fa fa-cube text-gray-600 text-xl"></i>`;
    }

    const meta = document.createElement('div');
    meta.className = 'min-w-0 flex-1';
    const subtitle = kind === 'equipment' ? `${getEquipmentTypeName(item.type)} · Lv.${item.level || 1}` : `${getInscriptionTypeName(item.type)} · Lv.${item.level || 1}`;
    const setTag = kind === 'equipment' ? (item.setTag || '') : '';
    const setName = setTag === 'wind' ? '疾风' : (setTag === 'shadow' ? '暗影' : (setTag === 'dragon' ? '龙裔' : (setTag === 'void' ? '虚空' : (setTag === 'slaughter' ? '屠戮' : (setTag === 'sanctuary' ? '圣域' : '')))));
    meta.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <div class="font-black text-lg truncate ${getRarityClass(item.rarity)}">${item.name || (kind === 'equipment' ? '装备' : '铭文')}</div>
        <div class="text-[10px] px-2 py-1 rounded-full bg-black/40 border border-gray-700 text-gray-300">${item.rarity || ''}</div>
      </div>
      <div class="text-xs text-gray-400 mt-1">${subtitle}</div>
      ${setName ? `<div class="text-[10px] text-gray-500 mt-1">套装：<span class="text-gray-300 font-black">${setName}</span>（2/4件共鸣）</div>` : ''}
    `;

    const headRow = document.createElement('div');
    headRow.className = 'flex items-center gap-4';
    headRow.appendChild(imgWrap);
    headRow.appendChild(meta);
    header.appendChild(headRow);

    const progress = document.createElement('div');
    progress.className = 'mt-3';
    if (kind === 'equipment') {
      const maxLevel = (window.__inventory && window.__inventory.getMaxEquipmentLevel) ? window.__inventory.getMaxEquipmentLevel(item.rarity) : 20;
      const expNeed = (window.__inventory && window.__inventory.getEquipmentExpToNextLevel) ? window.__inventory.getEquipmentExpToNextLevel(item.level || 1, item.rarity) : 0;
      const pct = expNeed > 0 ? Math.max(0, Math.min(100, Math.floor(((item.exp || 0) / expNeed) * 100))) : 0;
      progress.innerHTML = `
        <div class="flex justify-between text-[10px] text-gray-400 mb-1">
          <span>经验</span><span>${item.level || 1}/${maxLevel} · ${(item.exp || 0)}/${expNeed}</span>
        </div>
        <div class="w-full h-2 rounded-full bg-gray-900 border border-gray-800 overflow-hidden">
          <div class="h-full bg-primary" style="width:${pct}%"></div>
        </div>
      `;
    } else {
      const expNeed = (window.__inventory && window.__inventory.calculateInscriptionExpToNextLevel) ? window.__inventory.calculateInscriptionExpToNextLevel(item.level || 1) : 0;
      const pct = expNeed > 0 ? Math.max(0, Math.min(100, Math.floor(((item.exp || 0) / expNeed) * 100))) : 0;
      progress.innerHTML = `
        <div class="flex justify-between text-[10px] text-gray-400 mb-1">
          <span>经验</span><span>${item.level || 1}/10 · ${(item.exp || 0)}/${expNeed}</span>
        </div>
        <div class="w-full h-2 rounded-full bg-gray-900 border border-gray-800 overflow-hidden">
          <div class="h-full bg-primary" style="width:${pct}%"></div>
        </div>
      `;
    }
    header.appendChild(progress);
    els.detail.appendChild(header);

    ensureMaterials();
    const matsBar = document.createElement('div');
    matsBar.className = 'mt-3 grid grid-cols-2 gap-2';
    const m1 = getMaterialMeta('enhanceStone');
    const m2 = getMaterialMeta('inscriptionDust');
    const m3 = getMaterialMeta('reforgeDust');
    const m4 = getMaterialMeta('lockCrystal');
    const card = (meta, count) => {
      const wrap = document.createElement('div');
      wrap.className = 'flex items-center gap-2 bg-black/20 border border-gray-800 rounded-xl px-3 py-2';
      const icon = meta.iconUrl
        ? `<img src="${meta.iconUrl}" class="w-6 h-6 object-contain" data-img="1">`
        : `<i class="fa fa-cube text-gray-500"></i>`;
      wrap.innerHTML = `
        ${icon}
        <div class="min-w-0 flex-1">
          <div class="text-xs font-black text-white truncate">${meta.name}</div>
          <div class="text-[10px] text-gray-400">持有 <span class="text-primary font-black">${count}</span></div>
        </div>
      `;
      wrap.querySelectorAll('img[data-img]').forEach(img => {
        img.onerror = () => { img.replaceWith(Object.assign(document.createElement('i'), { className: 'fa fa-cube text-gray-500' })); };
      });
      return wrap;
    };
    matsBar.appendChild(card(m1, gameData.player.materials.enhanceStone || 0));
    matsBar.appendChild(card(m2, gameData.player.materials.inscriptionDust || 0));
    matsBar.appendChild(card(m3, gameData.player.materials.reforgeDust || 0));
    matsBar.appendChild(card(m4, gameData.player.materials.lockCrystal || 0));
    els.detail.appendChild(matsBar);

    const attrsBox = document.createElement('div');
    attrsBox.className = 'mt-3 bg-black/20 border border-gray-800 rounded-xl p-4';
    let base = item.baseAttributes || {};
    let extra = item.extraAttributes || {};
    if ((!base || Object.keys(base).length === 0) && typeof item.id === 'string') {
      const templates = kind === 'equipment'
        ? ((typeof equipmentData !== 'undefined' && Array.isArray(equipmentData)) ? equipmentData : [])
        : ((typeof inscriptionsData !== 'undefined' && Array.isArray(inscriptionsData)) ? inscriptionsData : []);
      const tpl = Array.isArray(templates) ? templates.find(t => t && t.id === item.id) : null;
      if (tpl && tpl.attributes && typeof tpl.attributes === 'object') base = tpl.attributes;
      const baseKeys = new Set(Object.keys(base || {}));
      const attrs = item.attributes && typeof item.attributes === 'object' ? item.attributes : {};
      const derivedExtra = {};
      Object.entries(attrs).forEach(([k, v]) => {
        if (!baseKeys.has(k)) derivedExtra[k] = v;
      });
      if (!extra || Object.keys(extra).length === 0) extra = derivedExtra;
    }
    const leveledBonus = kind === 'inscription'
      ? (1 + ((item.level || 1) - 1) * 0.2)
      : (1 + ((item.level || 1) - 1) * 0.1);

    const toNum = (v) => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string') {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };

    const baseRows = Object.entries(base).map(([k, v]) => [k, toNum(v)]).filter(([, v]) => typeof v === 'number' && v !== 0).map(([k, v]) => {
      return `<div class="flex justify-between items-center py-1 border-b border-gray-800 text-xs">
        <span class="text-gray-400">${getStatNameSafe(k)}</span>
        <span class="font-black text-white">${formatAttrValue(k, v, leveledBonus)}</span>
      </div>`;
    }).join('');
    const extraRows = Object.entries(extra).map(([k, v]) => [k, toNum(v)]).filter(([, v]) => typeof v === 'number' && v !== 0).map(([k, v]) => {
      return `<div class="flex justify-between items-center py-1 border-b border-gray-800 text-xs">
        <span class="text-gray-400">${getStatNameSafe(k)}</span>
        <span class="font-black text-primary">${formatAttrValue(k, v, leveledBonus)}</span>
      </div>`;
    }).join('');

    attrsBox.innerHTML = `
      <div class="text-[10px] text-gray-500 font-black uppercase mb-2">基础属性</div>
      <div class="space-y-0">${baseRows || `<div class="text-gray-500 text-xs">无</div>`}</div>
      <div class="mt-4 text-[10px] text-gray-500 font-black uppercase mb-2">随机词条</div>
      <div class="space-y-0">${extraRows || `<div class="text-gray-500 text-xs">无</div>`}</div>
    `;
    els.detail.appendChild(attrsBox);

    const reforgeBox = document.createElement('div');
    reforgeBox.className = 'mt-3 bg-black/20 border border-gray-800 rounded-xl p-4';
    const keys = Array.isArray(item.extraKeys) ? item.extraKeys.filter(k => typeof k === 'string') : [];
    if (!Array.isArray(item.lockedKeys)) item.lockedKeys = [];
    item.lockedKeys = item.lockedKeys.filter(k => keys.includes(k));

    const rarity = String(item.rarity || 'R');
    const lockCap = (window.__inventory && typeof window.__inventory.getMaxReforgeLockCount === 'function')
      ? window.__inventory.getMaxReforgeLockCount(rarity, keys.length)
      : Math.max(0, Math.min(rarity === 'SUR' ? 3 : (rarity === 'UR' ? 2 : (rarity === 'SSR' ? 2 : (rarity === 'SR' ? 1 : 0))), Math.max(0, keys.length - 1)));
    const maxLocked = Math.min(lockCap, keys.length);
    if (item.lockedKeys.length > maxLocked) item.lockedKeys = item.lockedKeys.slice(0, maxLocked);
    const cost = (window.__inventory && typeof window.__inventory.getReforgeCost === 'function')
      ? window.__inventory.getReforgeCost(item.rarity, item.lockedKeys.length, keys.length)
      : { gold: 0, reforgeDust: 0, lockCrystal: 0 };
    const dustMeta = getMaterialMeta('reforgeDust');
    const lockMeta = getMaterialMeta('lockCrystal');
    reforgeBox.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="text-[10px] text-gray-500 font-black uppercase">词条重铸</div>
        <div class="text-[10px] text-gray-400">可锁定 ${maxLocked} 条</div>
      </div>
      <div class="mt-2 flex flex-wrap gap-2" id="reforgeChips"></div>
      <div class="mt-3 grid grid-cols-2 gap-2">
        <button id="reforgeBtn" class="py-2 rounded-lg font-black text-xs bg-gray-900 border border-gray-700 hover:bg-gray-800 disabled:opacity-50">重铸</button>
        <button id="clearLockBtn" class="py-2 rounded-lg font-black text-xs bg-gray-900 border border-gray-700 hover:bg-gray-800 disabled:opacity-50">清空锁定</button>
      </div>
      <div class="mt-2 text-[10px] text-gray-500">消耗：💰${cost.gold} · ${dustMeta.name} ${cost.reforgeDust}${cost.lockCrystal > 0 ? ` · ${lockMeta.name} ${cost.lockCrystal}` : ''}</div>
    `;
    const chipsWrap = reforgeBox.querySelector('#reforgeChips');
    if (!chipsWrap || keys.length === 0) {
      reforgeBox.querySelector('#reforgeBtn').disabled = true;
      reforgeBox.querySelector('#clearLockBtn').disabled = true;
      if (chipsWrap) chipsWrap.innerHTML = `<div class="text-gray-500 text-xs">该物品没有随机词条</div>`;
    } else {
      const renderChips = () => {
        chipsWrap.innerHTML = '';
        keys.forEach(k => {
          const locked = item.lockedKeys.includes(k);
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `px-3 py-1.5 rounded-full border text-xs font-black ${locked ? 'bg-amber-900/30 border-amber-600 text-amber-200' : 'bg-black/20 border-gray-700 text-gray-200 hover:bg-black/35'}`;
          btn.textContent = `${locked ? '锁定' : '可锁'} ${getStatNameSafe(k)}`;
          btn.onclick = () => {
            if (locked) {
              item.lockedKeys = item.lockedKeys.filter(x => x !== k);
            } else {
              if (item.lockedKeys.length >= maxLocked) return;
              item.lockedKeys = [...item.lockedKeys, k];
            }
            if (typeof saveGameProgress === 'function') saveGameProgress();
            render();
          };
          chipsWrap.appendChild(btn);
        });
      };
      renderChips();

      const clearBtn = reforgeBox.querySelector('#clearLockBtn');
      clearBtn.onclick = () => {
        item.lockedKeys = [];
        if (typeof saveGameProgress === 'function') saveGameProgress();
        render();
      };

      const reforgeBtn = reforgeBox.querySelector('#reforgeBtn');
      reforgeBtn.onclick = () => {
        ensureMaterials();
        const costNow = (window.__inventory && typeof window.__inventory.getReforgeCost === 'function')
          ? window.__inventory.getReforgeCost(item.rarity, item.lockedKeys.length, keys.length)
          : { gold: 0, reforgeDust: 0, lockCrystal: 0 };
        const mats = gameData.player.materials || {};
        if ((gameData.player.gold || 0) < costNow.gold) return alert('金币不足');
        if ((mats.reforgeDust || 0) < costNow.reforgeDust) return alert('重铸粉尘不足');
        if ((mats.lockCrystal || 0) < costNow.lockCrystal) return alert('锁定核心不足');
        const ok = confirm(`确认重铸随机词条？\n锁定：${item.lockedKeys.length}/${maxLocked}\n消耗：💰${costNow.gold} · ${dustMeta.name} ${costNow.reforgeDust}${costNow.lockCrystal > 0 ? ` · ${lockMeta.name} ${costNow.lockCrystal}` : ''}`);
        if (!ok) return;
        gameData.player.gold -= costNow.gold;
        gameData.player.materials.reforgeDust -= costNow.reforgeDust;
        if (costNow.lockCrystal > 0) gameData.player.materials.lockCrystal -= costNow.lockCrystal;
        if (kind === 'equipment') {
          if (window.__inventory && typeof window.__inventory.reforgeEquipmentAffixes === 'function') {
            window.__inventory.reforgeEquipmentAffixes(item, item.lockedKeys);
          }
        } else {
          if (window.__inventory && typeof window.__inventory.reforgeInscriptionAffixes === 'function') {
            window.__inventory.reforgeInscriptionAffixes(item, item.lockedKeys);
          }
        }
        if (typeof saveGameProgress === 'function') saveGameProgress();
        if (typeof updateUI === 'function') updateUI();
        if (hasSelectedChar && typeof selectCharacterToCultivate === 'function') selectCharacterToCultivate(selectedCharacter);
        render();
      };
    }
    els.detail.appendChild(reforgeBox);

    const actionBox = document.createElement('div');
    actionBox.className = 'mt-3 bg-black/20 border border-gray-800 rounded-xl p-4';
    const btnRow = document.createElement('div');
    btnRow.className = 'grid grid-cols-2 gap-2';

    const equipBtn = document.createElement('button');
    equipBtn.className = 'py-2 rounded-lg font-black text-xs bg-primary hover:bg-opacity-90 disabled:opacity-50';
    const unequipBtn = document.createElement('button');
    unequipBtn.className = 'py-2 rounded-lg font-black text-xs bg-red-900 hover:bg-red-800 text-red-100 disabled:opacity-50';
    const upgradeBtn = document.createElement('button');
    upgradeBtn.className = 'py-2 rounded-lg font-black text-xs bg-gray-900 border border-gray-700 hover:bg-gray-800 disabled:opacity-50';
    const dismantleBtn = document.createElement('button');
    dismantleBtn.className = 'py-2 rounded-lg font-black text-xs bg-gray-900 border border-gray-700 hover:bg-gray-800 disabled:opacity-50';

    const hasSelectedChar = typeof selectedCharacter !== 'undefined' && !!selectedCharacter;
    if (!hasSelectedChar) {
      equipBtn.disabled = true;
      unequipBtn.disabled = true;
      equipBtn.textContent = '请选择角色';
      unequipBtn.textContent = '卸下';
    } else if (blockedByOther) {
      equipBtn.disabled = true;
      equipBtn.textContent = `已被 ${owner.char.name} 装备`;
      unequipBtn.disabled = true;
      unequipBtn.textContent = '卸下';
    } else if (equippedSlot !== null) {
      equipBtn.disabled = true;
      equipBtn.textContent = '已装备';
      unequipBtn.disabled = false;
      unequipBtn.textContent = '卸下';
    } else {
      equipBtn.disabled = false;
      equipBtn.textContent = kind === 'inscription' ? '镶嵌' : '装备';
      unequipBtn.disabled = true;
      unequipBtn.textContent = '卸下';
    }

    equipBtn.onclick = () => {
      if (!hasSelectedChar) {
        switchPage('characters');
        alert('请先在养成界面选择一个角色');
        return;
      }
      if (blockedByOther) return;
      if (kind === 'equipment') {
        const slot = item.type;
        const current = selectedCharacter.equipments ? selectedCharacter.equipments[slot] : null;
        if (current && current.instanceId !== item.instanceId) {
          const ok = confirm(`替换${getEquipmentTypeName(slot)}？\n当前：${current.name}\n新的：${item.name}`);
          if (!ok) return;
        }
        if (!selectedCharacter.equipments) selectedCharacter.equipments = { weapon: null, armor: null, helmet: null, shoes: null, accessory: null };
        selectedCharacter.equipments[slot] = item;
      } else {
        const list = Array.isArray(selectedCharacter.inscriptions) ? selectedCharacter.inscriptions : [null, null];
        const empty = list.findIndex(x => !x);
        let idx = empty >= 0 ? empty : 0;
        if (empty < 0) {
          const useFirst = confirm('镶嵌到铭文槽位 1？\n取消则镶嵌到槽位 2。');
          idx = useFirst ? 0 : 1;
        }
        list[idx] = item;
        selectedCharacter.inscriptions = list;
      }
      if (typeof saveGameProgress === 'function') saveGameProgress();
      if (typeof updateUI === 'function') updateUI();
      if (typeof selectCharacterToCultivate === 'function') selectCharacterToCultivate(selectedCharacter);
      render();
    };

    unequipBtn.onclick = () => {
      if (!hasSelectedChar) return;
      if (kind === 'equipment' && typeof equippedSlot === 'string') {
        selectedCharacter.equipments[equippedSlot] = null;
      }
      if (kind === 'inscription' && typeof equippedSlot === 'number') {
        selectedCharacter.inscriptions[equippedSlot] = null;
      }
      if (typeof saveGameProgress === 'function') saveGameProgress();
      if (typeof updateUI === 'function') updateUI();
      if (typeof selectCharacterToCultivate === 'function') selectCharacterToCultivate(selectedCharacter);
      render();
    };

    upgradeBtn.textContent = '升级';
    upgradeBtn.onclick = () => {
      ensureMaterials();
      if (kind === 'equipment') {
        const maxLevel = (window.__inventory && window.__inventory.getMaxEquipmentLevel) ? window.__inventory.getMaxEquipmentLevel(item.rarity) : 20;
        if ((item.level || 1) >= maxLevel) {
          alert('已达到最高等级');
          return;
        }
        const material = findMaterialEquipment(item.instanceId);
        const gain = material ? ((window.__inventory && window.__inventory.getEquipmentFeedExp) ? window.__inventory.getEquipmentFeedExp(material) : 0) : 100;
        const goldCost = Math.max(0, Math.floor(gain * 2.2));
        const stoneCost = Math.max(1, Math.ceil(gain / 55) * getRarityCostMult(item.rarity));
        const mMeta = getMaterialMeta('enhanceStone');
        const ownedStone = gameData.player.materials.enhanceStone || 0;
        const tip = material
          ? `消耗装备作为材料并升级？\n材料：${material.name} Lv.${material.level || 1}（${material.rarity}）`
          : `使用材料强化并升级？\n材料：${mMeta.name}`;
        const ok = confirm(`${tip}\n获得经验：+${gain}\n金币消耗：${goldCost}\n${mMeta.name}：${ownedStone}/${stoneCost}`);
        if (!ok) return;
        const res = applyEquipmentUpgrade(item, material);
        if (!res) return;
        if (material) gameData.equipment = gameData.equipment.filter(x => x && x.instanceId !== material.instanceId);
      } else {
        if ((item.level || 1) >= 10) {
          alert('已达到最高等级');
          return;
        }
        const material = findMaterialInscription(item.instanceId);
        const gain = material ? ((window.__inventory && window.__inventory.getInscriptionFeedExp) ? window.__inventory.getInscriptionFeedExp(material) : 0) : 45;
        const dustCost = Math.max(1, Math.ceil(gain / 45) * getRarityCostMult(item.rarity));
        const mMeta = getMaterialMeta('inscriptionDust');
        const ownedDust = gameData.player.materials.inscriptionDust || 0;
        const tip = material
          ? `消耗铭文作为材料并升级？\n材料：${material.name} Lv.${material.level || 1}（${material.rarity}）`
          : `使用材料升级？\n材料：${mMeta.name}`;
        const ok = confirm(`${tip}\n获得经验：+${gain}\n${mMeta.name}：${ownedDust}/${dustCost}`);
        if (!ok) return;
        const res = applyInscriptionUpgrade(item, material);
        if (!res) return;
        if (material) gameData.inscriptions = gameData.inscriptions.filter(x => x && x.instanceId !== material.instanceId);
      }

      if (typeof saveGameProgress === 'function') saveGameProgress();
      if (typeof updateUI === 'function') updateUI();
      render();
    };

    dismantleBtn.textContent = '分解';
    dismantleBtn.onclick = () => {
      const ok = confirm(`确定分解【${item.name}】？\n分解将永久失去该物品。`);
      if (!ok) return;
      ensureMaterials();
      if (kind === 'equipment') {
        const ownerNow = findEquippedOwner(item, 'equipment');
        if (ownerNow) {
          alert('该装备已被角色装备，无法分解');
          return;
        }
        const feed = (window.__inventory && window.__inventory.getEquipmentFeedExp) ? window.__inventory.getEquipmentFeedExp(item) : 0;
        const refund = Math.max(1, Math.ceil(feed / 120));
        gameData.player.materials.enhanceStone = (gameData.player.materials.enhanceStone || 0) + refund;
        gameData.equipment = (Array.isArray(gameData.equipment) ? gameData.equipment : []).filter(x => x && x.instanceId !== item.instanceId);
      } else {
        const ownerNow = findEquippedOwner(item, 'inscription');
        if (ownerNow) {
          alert('该铭文已被角色镶嵌，无法分解');
          return;
        }
        const feed = (window.__inventory && window.__inventory.getInscriptionFeedExp) ? window.__inventory.getInscriptionFeedExp(item) : 0;
        const refund = Math.max(1, Math.ceil(feed / 110));
        gameData.player.materials.inscriptionDust = (gameData.player.materials.inscriptionDust || 0) + refund;
        gameData.inscriptions = (Array.isArray(gameData.inscriptions) ? gameData.inscriptions : []).filter(x => x && x.instanceId !== item.instanceId);
      }
      state.selectedId = null;
      state.selectedKind = null;
      if (typeof saveGameProgress === 'function') saveGameProgress();
      if (typeof updateUI === 'function') updateUI();
      render();
    };

    btnRow.appendChild(equipBtn);
    btnRow.appendChild(unequipBtn);
    actionBox.appendChild(btnRow);

    const bottomRow = document.createElement('div');
    bottomRow.className = 'grid grid-cols-2 gap-2 mt-2';
    bottomRow.appendChild(upgradeBtn);
    bottomRow.appendChild(dismantleBtn);
    actionBox.appendChild(bottomRow);

    els.detail.appendChild(actionBox);
  }

  function render() {
    const els = getModalEls();
    if (els.title) els.title.textContent = state.tab === 'equipment' ? '背包 · 装备' : '背包 · 铭文';
    els.tabs.forEach(btn => {
      const t = btn.getAttribute('data-backpack-tab');
      const active = t === state.tab;
      btn.className = `px-3 py-2 rounded-lg border text-xs font-black ${active ? 'bg-primary/20 border-primary text-primary' : 'bg-gray-900 border-gray-700 text-white hover:bg-gray-800'}`;
    });
    renderList();
    renderDetail();
  }

  function bind() {
    const els = getModalEls();
    if (!els.modal) return;
    if (els.close) els.close.onclick = () => close();
    els.tabs.forEach(btn => {
      btn.onclick = () => setTab(btn.getAttribute('data-backpack-tab'));
    });
    const bg = document.getElementById('backpackModalBg');
    if (bg) bg.onclick = () => close();

    const btn = document.getElementById('cultivateBackpackBtn');
    if (btn) btn.onclick = () => open('equipment');
  }

  const api = { open, close };
  if (window.Game && window.Game.ui) window.Game.ui.backpack = api;
  window.__backpackUI = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
