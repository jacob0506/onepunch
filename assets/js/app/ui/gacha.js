(() => {
  function portraitPlaceholder(char) {
    const rarity = String((char && char.rarity) || 'R').toUpperCase();
    const name = String((char && char.name) || '').slice(0, 6);
    const bg = rarity === 'SUR' ? '#a855f7' : (rarity === 'UR' ? '#f59e0b' : (rarity === 'SSR' ? '#fb7185' : (rarity === 'SR' ? '#60a5fa' : '#94a3b8')));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}" stop-opacity="0.35"/><stop offset="1" stop-color="#0b1220"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/><circle cx="256" cy="210" r="88" fill="${bg}" fill-opacity="0.28"/><text x="256" y="226" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="56" fill="#e5e7eb" font-weight="800">${rarity}</text><text x="256" y="352" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="28" fill="#cbd5e1" font-weight="700">${name || '未知'}</text><text x="256" y="392" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="18" fill="#94a3b8">立绘缺失</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function getPortraitUrl(char) {
    const url = char && char.imageUrl ? String(char.imageUrl) : '';
    if (url && url.trim()) return url;
    return portraitPlaceholder(char);
  }

  function showGachaResults(results, gachaFragments = {}) {
    const gachaCardsContainer = document.getElementById('gachaCards');
    gachaCardsContainer.innerHTML = '';

    results.forEach((char, index) => {
      setTimeout(() => {
        const cardElement = document.createElement('div');
        const isFragment = gachaFragments[char.id] > 0;
        const imgUrl = getPortraitUrl(char);
        cardElement.className = `animate-bounce-in rarity-border-${char.rarity.toLowerCase()} rarity-bg-${char.rarity.toLowerCase()} rounded-lg overflow-hidden card-shadow relative`;

        cardElement.innerHTML = `
          <div class="relative ${isFragment ? 'opacity-70 grayscale' : ''}">
            <img src="${imgUrl}" alt="${char.name}" class="w-full aspect-square object-cover">
            <div class="absolute top-2 left-2 bg-black bg-opacity-70 rounded-full px-2 py-1 text-xs">
              <span class="text-rarity-${char.rarity.toLowerCase()} font-bold">${char.rarity}</span>
            </div>
            ${isFragment ? `
              <div class="absolute inset-0 flex items-center justify-center">
                <div class="bg-black bg-opacity-80 rounded-lg p-2 text-center border-2 border-primary">
                  <p class="text-xs text-primary font-bold">已拥有</p>
                  <p class="text-lg font-bold text-white">+${gachaFragments[char.id]}</p>
                  <p class="text-[10px] text-gray-400">碎片转化</p>
                </div>
              </div>
            ` : ''}
          </div>
          <div class="p-2">
            <h4 class="font-bold text-center">${char.name}${isFragment ? '碎片' : ''}</h4>
            <p class="text-xs text-center text-gray-400">${getClassName(char.class)}</p>
          </div>
        `;

        gachaCardsContainer.appendChild(cardElement);
        const img = cardElement.querySelector('img');
        if (img) {
          img.onerror = () => {
            img.onerror = null;
            img.src = portraitPlaceholder(char);
          };
        }

        if (index === results.length - 1) {
          document.getElementById('gachaResult').classList.remove('hidden');
        }
      }, index * 300);
    });
  }

  function performGacha(count) {
    const cost = count === 1 ? GAME_CONFIG.gachaCost.single : GAME_CONFIG.gachaCost.ten;
    if (gameData.player.gems < cost) {
      alert('钻石不足！');
      return;
    }

    gameData.player.gems -= cost;
    document.getElementById('playerGems').textContent = gameData.player.gems.toLocaleString();

    const results = [];
    let srOrAboveCount = 0;

    for (let i = 0; i < count; i++) {
      let rarity;
      const random = Math.random();

      if (count >= 10 && i === count - 1 && srOrAboveCount === 0) {
        rarity = Math.random() < 0.8 ? 'SR' : (Math.random() < 0.95 ? 'SSR' : (Math.random() < 0.99 ? 'UR' : 'SUR'));
      } else {
        if (random < GAME_CONFIG.rarityProbabilities.R) {
          rarity = 'R';
        } else if (random < GAME_CONFIG.rarityProbabilities.R + GAME_CONFIG.rarityProbabilities.SR) {
          rarity = 'SR';
          srOrAboveCount++;
        } else if (random < GAME_CONFIG.rarityProbabilities.R + GAME_CONFIG.rarityProbabilities.SR + GAME_CONFIG.rarityProbabilities.SSR) {
          rarity = 'SSR';
          srOrAboveCount++;
        } else if (random < GAME_CONFIG.rarityProbabilities.R + GAME_CONFIG.rarityProbabilities.SR + GAME_CONFIG.rarityProbabilities.SSR + GAME_CONFIG.rarityProbabilities.UR) {
          rarity = 'UR';
          srOrAboveCount++;
        } else {
          rarity = 'SUR';
          srOrAboveCount++;
        }
      }

      const availableCharacters = charactersData.filter(char => char.rarity === rarity);
      let finalAvailable = availableCharacters;
      let finalRarity = rarity;

      if (finalAvailable.length === 0) {
        const rarities = ['SUR', 'UR', 'SSR', 'SR', 'R'];
        const currentIndex = rarities.indexOf(rarity);
        for (let r = currentIndex + 1; r < rarities.length; r++) {
          const fallback = charactersData.filter(char => char.rarity === rarities[r]);
          if (fallback.length > 0) {
            finalAvailable = fallback;
            finalRarity = rarities[r];
            break;
          }
        }
      }

      if (finalAvailable.length === 0) continue;
      const selectedChar = finalAvailable[Math.floor(Math.random() * finalAvailable.length)];

      const charInstance = {
        ...JSON.parse(JSON.stringify(selectedChar)),
        rarity: finalRarity,
        level: 1,
        exp: 0,
        stars: 1,
        equipment: { weapon: null, armor: null, helmet: null, shoes: null, accessory: null },
        inscriptions: [null, null]
      };

      if (charInstance.skills && Array.isArray(charInstance.skills)) {
        charInstance.skills.forEach(skill => {
          skill.level = 1;
        });
      } else {
        charInstance.skills = [];
      }

      results.push(charInstance);
    }

    const gachaFragments = {};
    results.forEach(char => {
      const isOwned = gameData.characters.some(owned => owned.id === char.id);
      if (isOwned) {
        const yieldCount = GAME_CONFIG.fragmentYield[char.rarity] || 5;
        gameData.fragments[char.id] = (gameData.fragments[char.id] || 0) + yieldCount;
        gachaFragments[char.id] = (gachaFragments[char.id] || 0) + yieldCount;
      } else {
        gameData.characters.push(char);
      }
    });

    showGachaResults(results, gachaFragments);
    saveGameProgress();
    updateUI();
  }

  const api = { performGacha, showGachaResults };
  if (window.Game && window.Game.ui) window.Game.ui.gacha = api;
  window.__gachaUI = api;
})();
