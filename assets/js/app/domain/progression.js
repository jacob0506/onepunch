(() => {
  function calculateExpToNextLevel(level) {
    return 100 * Math.pow(1.5, (level || 1) - 1);
  }

  function calculatePlayerExpToNextLevel(level) {
    return 1000 * Math.pow(2, (level || 1) - 1);
  }

  function checkPlayerLevelUp(state, config) {
    const gameData = state || window.gameData;
    const GAME_CONFIG = config || window.GAME_CONFIG;
    if (!gameData || !gameData.player) return;
    while (gameData.player.exp >= calculatePlayerExpToNextLevel(gameData.player.level)) {
      gameData.player.exp -= calculatePlayerExpToNextLevel(gameData.player.level);
      gameData.player.level++;
      gameData.player.gems += 100;
    }
  }

  function checkCharacterLevelUp(char, config) {
    const GAME_CONFIG = config || window.GAME_CONFIG;
    if (!char) return;
    const MAX_GLOBAL_LEVEL = (GAME_CONFIG && GAME_CONFIG.maxLevel) || 150;
    let maxLevel = 15 + (char.stars * 15);
    if (char.stars >= ((GAME_CONFIG && GAME_CONFIG.maxStars) || 8)) maxLevel = MAX_GLOBAL_LEVEL;
    while (char.level < maxLevel) {
      const expToNextLevel = calculateExpToNextLevel(char.level);
      if (char.exp < expToNextLevel) break;
      char.exp -= expToNextLevel;
      char.level++;
      (char.skills || []).forEach(skill => {
        if (Math.random() < 0.3) skill.level++;
      });
    }
  }

  function getOfflineHours(lastLoginMs, nowMs) {
    const last = lastLoginMs || 0;
    const now = nowMs || new Date().getTime();
    return Math.floor((now - last) / (1000 * 60 * 60));
  }

  function getOfflineRewards(offlineHours, config) {
    const GAME_CONFIG = config || window.GAME_CONFIG;
    const hours = Math.max(0, offlineHours || 0);
    const rate = (GAME_CONFIG && GAME_CONFIG.offlineRewardRate) || { gold: 0, exp: 0 };
    return {
      gold: hours * (rate.gold || 0),
      exp: hours * (rate.exp || 0)
    };
  }

  function ensurePlayerMaterials(gameData) {
    const gd = gameData || window.gameData;
    if (!gd || !gd.player) return;
    if (!gd.player.materials) gd.player.materials = {};
    if (typeof gd.player.materials.enhanceStone !== 'number') gd.player.materials.enhanceStone = 0;
    if (typeof gd.player.materials.inscriptionDust !== 'number') gd.player.materials.inscriptionDust = 0;
    if (typeof gd.player.materials.reforgeDust !== 'number') gd.player.materials.reforgeDust = 0;
    if (typeof gd.player.materials.lockCrystal !== 'number') gd.player.materials.lockCrystal = 0;
  }

  function applyMaterialsDelta(delta, gameData) {
    const gd = gameData || window.gameData;
    if (!gd || !gd.player) return;
    ensurePlayerMaterials(gd);
    if (!delta || typeof delta !== 'object') return;
    Object.entries(delta).forEach(([k, v]) => {
      const n = typeof v === 'number' ? v : parseFloat(v);
      if (!Number.isFinite(n) || n === 0) return;
      gd.player.materials[k] = (gd.player.materials[k] || 0) + n;
      if (gd.player.materials[k] < 0) gd.player.materials[k] = 0;
    });
  }

  const api = {
    calculateExpToNextLevel,
    calculatePlayerExpToNextLevel,
    checkPlayerLevelUp,
    checkCharacterLevelUp,
    getOfflineHours,
    getOfflineRewards,
    ensurePlayerMaterials,
    applyMaterialsDelta
  };
  if (window.Game && window.Game.domain) window.Game.domain.progression = api;
  window.__progression = api;
})();
