(() => {
  function switchPage(target) {
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
    }

    window.scrollTo(0, 0);
  }

  const api = { switchPage };
  if (window.Game && window.Game.ui) window.Game.ui.navigation = api;
  window.__navigation = api;
})();

