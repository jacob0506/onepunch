(() => {
  function call(mod, fn, args, fallback) {
    try {
      if (mod && typeof mod[fn] === 'function') return mod[fn](...(args || []));
    } catch (_) {}
    return typeof fallback === 'function' ? fallback() : fallback;
  }

  window.updateCharacterSelectionBar = function updateCharacterSelectionBar() {
    return call(window.__cultivateUI, 'updateCharacterSelectionBar', arguments);
  };

  window.selectCharacterToCultivate = function selectCharacterToCultivate(char) {
    return call(window.__cultivateUI, 'selectCharacterToCultivate', arguments);
  };

  window.isCharacterInFormation = function isCharacterInFormation(charId) {
    return call(window.__cultivateUI, 'isCharacterInFormation', arguments, () => {
      if (typeof ensureFormation === 'function') ensureFormation();
      return (window.gameData && Array.isArray(gameData.formation)) ? gameData.formation.includes(charId) : false;
    });
  };

  window.renderCultivateFormationUI = function renderCultivateFormationUI() {
    return call(window.__cultivateUI, 'renderCultivateFormationUI', arguments);
  };

  window.toggleSelectedCharacterFormation = function toggleSelectedCharacterFormation() {
    return call(window.__cultivateUI, 'toggleSelectedCharacterFormation', arguments);
  };

  window.resetSelectedCharacter = function resetSelectedCharacter() {
    return call(window.__cultivateUI, 'resetSelectedCharacter', arguments);
  };

  window.showSkillPopup = function showSkillPopup(skill) {
    return call(window.__modalsUI, 'showSkillPopup', arguments);
  };

  window.showPassivePopup = function showPassivePopup(passiveText) {
    return call(window.__modalsUI, 'showPassivePopup', arguments);
  };

  window.openAwakenModal = function openAwakenModal(allowInfo) {
    return call(window.__modalsUI, 'openAwakenModal', arguments);
  };

  window.confirmAwaken = function confirmAwaken() {
    return call(window.__modalsUI, 'confirmAwaken', arguments);
  };

  window.showDetailedAttributes = function showDetailedAttributes() {
    return call(window.__modalsUI, 'showDetailedAttributes', arguments);
  };

  window.performGacha = function performGacha(count) {
    return call(window.__gachaUI, 'performGacha', arguments);
  };

  window.showGachaResults = function showGachaResults(results, gachaFragments) {
    return call(window.__gachaUI, 'showGachaResults', arguments);
  };

  window.updateEquipmentList = function updateEquipmentList() {
    return call(window.__uiInventory, 'updateEquipmentList', arguments);
  };

  window.showEquipmentDetail = function showEquipmentDetail(item) {
    return call(window.__uiInventory, 'showEquipmentDetail', arguments);
  };

  window.updateInscriptionsList = function updateInscriptionsList() {
    return call(window.__uiInventory, 'updateInscriptionsList', arguments);
  };

  window.showInscriptionDetail = function showInscriptionDetail(ins) {
    return call(window.__uiInventory, 'showInscriptionDetail', arguments);
  };

  window.upgradeInscription = function upgradeInscription() {
    return call(window.__uiInventory, 'upgradeInscription', arguments);
  };

  window.embedInscription = function embedInscription() {
    return call(window.__uiInventory, 'embedInscription', arguments);
  };

  window.updateStagesList = function updateStagesList() {
    return call(window.__stagesUI, 'updateStagesList', arguments);
  };

  window.goToStage = function goToStage(stageId) {
    return call(window.__stagesUI, 'goToStage', arguments, () => {
      if (typeof switchPage === 'function') switchPage('stages');
      setTimeout(() => {
        const el = document.getElementById(`stageCard_${stageId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 0);
    });
  };

  window.checkOfflineRewards = function checkOfflineRewards() {
    return call(window.__offlineUI, 'checkOfflineRewards', arguments);
  };

  window.claimOfflineRewards = function claimOfflineRewards() {
    return call(window.__offlineUI, 'claimOfflineRewards', arguments);
  };

  window.calculateTotalStats = function calculateTotalStats(char) {
    return call(window.__character, 'calculateTotalStats', arguments, () => ({ attack: 0, defense: 0, health: 0, speed: 0 }));
  };
  window.calculateCharacterAttack = function calculateCharacterAttack(char) {
    return call(window.__character, 'calculateCharacterAttack', arguments, () => window.calculateTotalStats(char).attack);
  };
  window.calculateCharacterDefense = function calculateCharacterDefense(char) {
    return call(window.__character, 'calculateCharacterDefense', arguments, () => window.calculateTotalStats(char).defense);
  };
  window.calculateCharacterHealth = function calculateCharacterHealth(char) {
    return call(window.__character, 'calculateCharacterHealth', arguments, () => window.calculateTotalStats(char).health);
  };
  window.calculateCharacterSpeed = function calculateCharacterSpeed(char) {
    return call(window.__character, 'calculateCharacterSpeed', arguments, () => window.calculateTotalStats(char).speed);
  };
  window.calculateCharacterPower = function calculateCharacterPower(char) {
    return call(window.__character, 'calculateCharacterPower', arguments, () => 0);
  };

  window.openItemPicker = function openItemPicker(slot, isIns) {
    return call(window.__itemPicker, 'openItemPicker', arguments);
  };
  window.equipItem = function equipItem(item) {
    return call(window.__itemPicker, 'equipItem', arguments);
  };
  window.unequipItem = function unequipItem() {
    return call(window.__itemPicker, 'unequipItem', arguments);
  };
  window.getSlotName = function getSlotName(slot) {
    return call(window.__itemPicker, 'getSlotName', arguments);
  };
  window.getStatName = function getStatName(key) {
    return call(window.__itemPicker, 'getStatName', arguments);
  };

  window.calculateEquipmentPower = function calculateEquipmentPower(item) {
    return call(window.__inventory, 'calculateEquipmentPower', arguments, () => 0);
  };
  window.calculateInscriptionExpToNextLevel = function calculateInscriptionExpToNextLevel(level) {
    return call(window.__inventory, 'calculateInscriptionExpToNextLevel', arguments, () => 0);
  };
  window.calculateEnhanceCost = function calculateEnhanceCost(level, rarity) {
    return call(window.__inventory, 'calculateEnhanceCost', arguments, () => 0);
  };
  window.getMaxEquipmentLevel = function getMaxEquipmentLevel(rarity) {
    return call(window.__inventory, 'getMaxEquipmentLevel', arguments, () => 20);
  };
  window.enhanceEquipment = function enhanceEquipment() {
    return call(window.__uiInventory, 'enhanceEquipment', arguments);
  };
  window.refineEquipment = function refineEquipment() {
    return call(window.__uiInventory, 'refineEquipment', arguments);
  };
})();

