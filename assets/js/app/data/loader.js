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
    const itemsJson = await fetchJson('assets/data/items.json');
    const inscriptionsJson = await fetchJson('assets/data/inscriptions.json');
    const stagesJson = await fetchJson('assets/data/stages.json');
    const materialsJson = await fetchJson('assets/data/materials.json');
    return {
      charactersData: charactersJson.characters || [],
      equipmentData: itemsJson.items || [],
      inscriptionsData: inscriptionsJson.inscriptions || [],
      stagesData: stagesJson.stages || [],
      materialsData: materialsJson.materials || []
    };
  }

  const api = { loadAll };
  if (window.Game && window.Game.data) window.Game.data.loader = api;
  window.__loader = api;
})();
