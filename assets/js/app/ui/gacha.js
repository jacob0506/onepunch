(() => {
  // 占位图单一实现：globals.js 的 __sprites.portraitPlaceholder
  // （此前这里有一份与 globals.js **逐字相同**的 SVG 副本 —— 改配色只改一处会导致
  //   抽卡页与其它页面出现两种占位图）
  function portraitPlaceholder(char) {
    return window.__sprites.portraitPlaceholder(char && char.name, char && char.rarity);
  }

  function getPortraitUrl(char) {
    const url = char && char.imageUrl ? String(char.imageUrl) : '';
    if (url && url.trim()) return url;
    return portraitPlaceholder(char);
  }

  /** 组件库（B5）—— 抽卡结果卡片统一走 .ui-card 工厂，不再手拼 Tailwind 类。 */
  function getComponents() {
    if (window.Game && window.Game.ui && window.Game.ui.components) return window.Game.ui.components;
    return window.__uiComponents || null;
  }

  /** 组件库缺失时的极简兜底（保证抽卡结果不会静默不显示）。 */
  function fallbackCardHtml(char, imgUrl, frag) {
    const isFragment = frag > 0;
    return '<div class="ui-card" data-rarity="' + String(char.rarity || '').toLowerCase() + '">' +
      '<div class="ui-card__media">' +
      '<img class="ui-card__img ui-card__img--square' + (isFragment ? ' ui-card__img--dim' : '') + '"' +
      ' src="' + imgUrl + '" alt="">' +
      (isFragment ? '<div class="ui-card__overlay"><div class="ui-card__convert">' +
        '<span class="ui-card__convert-label">已拥有</span>' +
        '<span class="ui-card__convert-value">+' + frag + '</span>' +
        '<span class="ui-card__convert-hint">碎片转化</span></div></div>' : '') +
      '</div>' +
      '<div class="ui-card__body"><div class="ui-card__row">' +
      '<span class="ui-card__name">' + char.name + (isFragment ? '碎片' : '') + '</span>' +
      '</div></div></div>';
  }

  function showGachaResults(results, gachaFragments = {}) {
    const gachaCardsContainer = document.getElementById('gachaCards');
    if (!gachaCardsContainer) return;
    const C = getComponents();
    gachaCardsContainer.innerHTML = '';

    // B9 音效：按本次最高稀有度给提示音（SSR+ = epic，SR = rare，R = coin）
    if (window.Game && Game.audio && Array.isArray(results) && results.length) {
      const HI = ['SUR', 'UR', 'SSR'];
      const best = results.some(c => HI.includes(c.rarity)) ? 'epic'
        : results.some(c => c.rarity === 'SR') ? 'rare' : 'coin';
      Game.audio.sfx(best);
    }

    results.forEach((char, index) => {
      setTimeout(() => {
        const frag = Number(gachaFragments[char.id]) || 0;
        const isFragment = frag > 0;
        const imgUrl = getPortraitUrl(char);

        const html = C ? C.charCard({
          id: char.id,
          name: char.name + (isFragment ? '碎片' : ''),
          rarity: char.rarity,
          className: getClassName(char.class),
          classTone: char.class,
          img: imgUrl,
          square: true,
          dim: isFragment,
          pop: true,
          overlay: isFragment
            ? '<div class="ui-card__convert">' +
              '<span class="ui-card__convert-label">已拥有</span>' +
              '<span class="ui-card__convert-value">+' + frag + '</span>' +
              '<span class="ui-card__convert-hint">碎片转化</span>' +
              '</div>'
            : ''
        }) : fallbackCardHtml(char, imgUrl, frag);

        gachaCardsContainer.insertAdjacentHTML('beforeend', html);
        const cardElement = gachaCardsContainer.lastElementChild;
        const img = cardElement && cardElement.querySelector('img');
        if (img) {
          img.onerror = () => {
            img.onerror = null;
            img.src = portraitPlaceholder(char);
          };
        }

        if (index === results.length - 1) {
          const res = document.getElementById('gachaResult');
          if (res) res.classList.remove('hidden');
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
    // C8：新获得的角色立刻进图鉴（sync 幂等；这样收集率不用等切页/重启才更新）
    if (window.__codex && typeof window.__codex.sync === 'function') window.__codex.sync();
    saveGameProgress();
    updateUI();
    // C5：召唤次数计入今日目标（按实际出结果的张数，不是按钮次数）
    if (typeof window.bumpGoal === 'function') window.bumpGoal('gacha', results.length);
    if (typeof window.renderDailyGoals === 'function') window.renderDailyGoals();
    if (typeof window.refreshRedDots === 'function') window.refreshRedDots();
  }

  const api = { performGacha, showGachaResults };
  if (window.Game && window.Game.ui) window.Game.ui.gacha = api;
  window.__gachaUI = api;
})();
