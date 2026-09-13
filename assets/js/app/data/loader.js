(() => {
  function getBustKey() {
    if (window.__assetBustKey) return window.__assetBustKey;
    const k = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    window.__assetBustKey = k;
    return k;
  }

  function withBust(url) {
    const bust = getBustKey();
    if (String(url).includes('?')) return `${url}&v=${encodeURIComponent(bust)}`;
    return `${url}?v=${encodeURIComponent(bust)}`;
  }

  async function fetchJson(url) {
    const primary = withBust(url);
    try {
      const res = await fetch(primary, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${primary} ${res.status}`);
      return await res.json();
    } catch (e) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url} ${res.status}`);
      return await res.json();
    }
  }

  async function loadAll() {
    const charactersJson = await fetchJson('assets/data/characters.json');
    if (window.__sprites && typeof window.__sprites.applyToCharacters === 'function') {
      window.__sprites.applyToCharacters(charactersJson && charactersJson.characters);
    }
    const itemsJson = await fetchJson('assets/data/items.json');
    const inscriptionsJson = await fetchJson('assets/data/inscriptions.json');
    const stagesJson = await fetchJson('assets/data/stages.json');
    const materialsJson = await fetchJson('assets/data/materials.json');
    // C6：羁绊数据（拿不到就是空羁绊，界面与战斗都当"无羁绊"处理，不崩）
    let bondsJson = null;
    try {
      bondsJson = await fetchJson('assets/data/bonds.json');
    } catch (e) {
      console.warn('[loader] bonds.json 加载失败，本次运行无羁绊', e && e.message);
    }
    // C7：日常副本配置（拿不到则 domain/daily.js 退回内置同值兜底）
    let dailiesJson = null;
    try {
      dailiesJson = await fetchJson('assets/data/dailies.json');
    } catch (e) {
      console.warn('[loader] dailies.json 加载失败，本次运行用内置副本配置', e && e.message);
    }
    // C8：成就定义（拿不到则 domain/achievements.js 退回内置精简兜底）
    let achievementsJson = null;
    try {
      achievementsJson = await fetchJson('assets/data/achievements.json');
    } catch (e) {
      console.warn('[loader] achievements.json 加载失败，本次运行用内置成就', e && e.message);
    }
    // C9：职业克制环（拿不到则 domain/counters.js 退回内置同值兜底 = 克制照常生效）
    let countersJson = null;
    try {
      countersJson = await fetchJson('assets/data/counters.json');
    } catch (e) {
      console.warn('[loader] counters.json 加载失败，本次运行用内置克制环', e && e.message);
    }
    return {
      charactersData: charactersJson.characters || [],
      equipmentData: itemsJson.items || [],
      inscriptionsData: inscriptionsJson.inscriptions || [],
      stagesData: stagesJson.stages || [],
      materialsData: materialsJson.materials || [],
      bondsData: bondsJson,
      dailiesData: dailiesJson,
      achievementsData: achievementsJson,
      countersData: countersJson
    };
  }

  const api = { loadAll };
  if (window.Game && window.Game.data) window.Game.data.loader = api;
  window.__loader = api;
})();
