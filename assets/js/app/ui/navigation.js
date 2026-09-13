(() => {
  function switchPage(target) {
    // B9：页面切换 → 回主城 BGM（战斗页由 scene.js 自己切战斗 BGM，战斗关闭时也会切回 city）
    if (window.Game && Game.audio) Game.audio.setBgm('city');
    document.querySelectorAll('.page').forEach(page => {
      if (page.id === target) {
        page.classList.remove('hidden');
        if (target === 'characters') page.classList.add('flex');
      } else {
        page.classList.add('hidden');
        page.classList.remove('flex');
      }
    });

    document.querySelectorAll('.footer-btn').forEach(btn => {
      if (btn.getAttribute('data-target') === target) {
        btn.classList.add('text-primary');
      } else {
        btn.classList.remove('text-primary');
      }
    });

    if (target === 'characters') {
      if (typeof updateCharacterSelectionBar === 'function') updateCharacterSelectionBar();
      if (typeof gameData !== 'undefined' && gameData.characters && gameData.characters.length > 0) {
        const charToSelect = (typeof selectedCharacter !== 'undefined' && selectedCharacter) ? selectedCharacter : gameData.characters[0];
        if (typeof selectCharacterToCultivate === 'function') selectCharacterToCultivate(charToSelect);
      }
    } else if (target === 'stages') {
      if (typeof updateStagesList === 'function') updateStagesList();
    } else if (target === 'codex') {
      // C8：图鉴页每次进入都重渲（收集率/成就进度是当前状态的函数，现算最准）
      if (typeof window.renderCodexPage === 'function') window.renderCodexPage();
    }

    window.scrollTo(0, 0);
  }

  const api = { switchPage };
  if (window.Game && window.Game.ui) window.Game.ui.navigation = api;
  window.__navigation = api;
})();

