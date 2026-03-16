(() => {
  function checkOfflineRewards() {
    const lastLogin = gameData.player.lastLogin || 0;
    const offlineHours = (window.__progression && window.__progression.getOfflineHours)
      ? window.__progression.getOfflineHours(lastLogin)
      : Math.floor((new Date().getTime() - lastLogin) / (1000 * 60 * 60));

    if (offlineHours > 0) {
      const offlineGold = offlineHours * GAME_CONFIG.offlineRewardRate.gold;
      document.getElementById('offlineRewards').innerHTML = `<i class="fa fa-coins mr-1"></i>${offlineGold.toLocaleString()}`;
    } else {
      document.getElementById('offlineRewards').innerHTML = `<i class="fa fa-coins mr-1"></i>0`;
      document.getElementById('claimOfflineRewards').classList.add('opacity-50');
      document.getElementById('claimOfflineRewards').disabled = true;
    }
  }

  function claimOfflineRewards() {
    const lastLogin = gameData.player.lastLogin || 0;
    const offlineHours = (window.__progression && window.__progression.getOfflineHours)
      ? window.__progression.getOfflineHours(lastLogin)
      : Math.floor((new Date().getTime() - lastLogin) / (1000 * 60 * 60));

    if (offlineHours > 0) {
      const rewards = (window.__progression && window.__progression.getOfflineRewards)
        ? window.__progression.getOfflineRewards(offlineHours)
        : { gold: offlineHours * GAME_CONFIG.offlineRewardRate.gold, exp: offlineHours * GAME_CONFIG.offlineRewardRate.exp };
      const offlineGold = rewards.gold;
      const offlineExp = rewards.exp;

      gameData.player.gold += offlineGold;
      gameData.player.exp += offlineExp;
      gameData.player.lastLogin = new Date().getTime();

      if (typeof checkPlayerLevelUp === 'function') checkPlayerLevelUp();

      document.getElementById('playerGold').textContent = gameData.player.gold.toLocaleString();
      document.getElementById('offlineRewards').innerHTML = `<i class="fa fa-coins mr-1"></i>0`;
      document.getElementById('claimOfflineRewards').classList.add('opacity-50');
      document.getElementById('claimOfflineRewards').disabled = true;

      if (typeof saveGameProgress === 'function') saveGameProgress();

      alert(`获得离线收益：\n金币: ${offlineGold}\n经验: ${offlineExp}`);
    }
  }

  const api = { checkOfflineRewards, claimOfflineRewards };
  if (window.Game && window.Game.ui) window.Game.ui.offline = api;
  window.__offlineUI = api;
})();
