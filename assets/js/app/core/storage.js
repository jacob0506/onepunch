(() => {
  const KEY = 'cardGameData';
  const VERSION = 1;

  function normalizeLoadedData(data) {
    if (!data || typeof data !== 'object') return null;
    if (!data.player) data.player = {};
    if (!data.player.materials) data.player.materials = {};
    if (typeof data.player.materials.enhanceStone !== 'number') data.player.materials.enhanceStone = 0;
    if (typeof data.player.materials.inscriptionDust !== 'number') data.player.materials.inscriptionDust = 0;
    if (typeof data.player.materials.reforgeDust !== 'number') data.player.materials.reforgeDust = 0;
    if (typeof data.player.materials.lockCrystal !== 'number') data.player.materials.lockCrystal = 0;
    if (!data.tower || typeof data.tower !== 'object') data.tower = {};
    if (typeof data.tower.floor !== 'number') data.tower.floor = 1;
    if (typeof data.tower.bestFloor !== 'number') data.tower.bestFloor = 0;
    if (!data.fragments) data.fragments = {};
    if (!Array.isArray(data.characters)) data.characters = [];
    if (!Array.isArray(data.equipment)) data.equipment = [];
    if (!Array.isArray(data.inscriptions)) data.inscriptions = [];
    if (!Array.isArray(data.formation)) data.formation = [null, null, null, null, null, null];
    if (typeof data.currentStage !== 'string') data.currentStage = 'stage_001';
    if (!Array.isArray(data.ownedItems)) data.ownedItems = [];
    return data;
  }

  function migrate(data) {
    const d = normalizeLoadedData(data);
    if (!d) return null;
    if (typeof d.saveVersion !== 'number') d.saveVersion = 0;
    if (d.saveVersion < VERSION) {
      if (typeof d.lastLogin === 'number' && (!d.player || typeof d.player.lastLogin !== 'number')) {
        if (!d.player) d.player = {};
        d.player.lastLogin = d.lastLogin;
      }
      if (d.player && typeof d.player.lastLogin !== 'number') d.player.lastLogin = new Date().getTime();
      d.saveVersion = VERSION;
    }
    return d;
  }

  function load() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return migrate(parsed);
    } catch (_) {
      return null;
    }
  }

  function save(data) {
    const payload = migrate({ ...(data || {}) }) || null;
    if (!payload) return false;
    try {
      if (!payload.player) payload.player = {};
      payload.player.lastLogin = new Date().getTime();
      payload.saveVersion = VERSION;
      localStorage.setItem(KEY, JSON.stringify(payload));
      return true;
    } catch (_) {
      return false;
    }
  }

  function clear() {
    try {
      localStorage.removeItem(KEY);
      return true;
    } catch (_) {
      return false;
    }
  }

  const api = { KEY, VERSION, load, save, clear, migrate };
  if (window.Game && window.Game.core) window.Game.core.storage = api;
  window.__storage = api;
})();
