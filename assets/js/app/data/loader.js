(() => {
  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    return await res.json();
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
