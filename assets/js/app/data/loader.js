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
    // A4：全局配置（GAME_CONFIG / BATTLE_SCENE_CONFIG）—— 拿不到则 core/config.js 用内置同值兜底
    let configJson = null;
    try {
      configJson = await fetchJson('assets/data/config.json');
    } catch (e) {
      console.warn('[loader] config.json 加载失败，本次运行用内置配置', e && e.message);
    }
    // A4：觉醒档案（拿不到则 core/config.js 退回内置同值档案）
    let awakenJson = null;
    try {
      awakenJson = await fetchJson('assets/data/awaken_profiles.json');
    } catch (e) {
      console.warn('[loader] awaken_profiles.json 加载失败，本次运行用内置觉醒档案', e && e.message);
    }
    // C11：新手引导步骤（拿不到则 domain/tutorial.js 退回内置同值步骤）
    let tutorialJson = null;
    try {
      tutorialJson = await fetchJson('assets/data/tutorial.json');
    } catch (e) {
      console.warn('[loader] tutorial.json 加载失败，本次运行用内置引导步骤', e && e.message);
    }
    // E1：肉鸽远征（拿不到则 domain/expedition.js 退回内置同值兜底）
    let expeditionJson = null;
    try {
      expeditionJson = await fetchJson('assets/data/expedition.json');
    } catch (e) {
      console.warn('[loader] expedition.json 加载失败，本次运行用内置远征配置', e && e.message);
    }
    // E3：周期挑战（拿不到则 domain/challenge.js 退回内置同值兜底）
    let challengeJson = null;
    try {
      challengeJson = await fetchJson('assets/data/challenge.json');
    } catch (e) {
      console.warn('[loader] challenge.json 加载失败，本次运行用内置周期挑战配置', e && e.message);
    }
    // E4：多队远征（拿不到则 domain/squads.js 退回内置同值兜底）
    let squadsJson = null;
    try {
      squadsJson = await fetchJson('assets/data/squads.json');
    } catch (e) {
      console.warn('[loader] squads.json 加载失败，本次运行用内置多队远征配置', e && e.message);
    }
    // E7：派驻探险（拿不到则 domain/dispatch.js 退回内置同值兜底）
    let dispatchJson = null;
    try {
      dispatchJson = await fetchJson('assets/data/dispatch.json');
    } catch (e) {
      console.warn('[loader] dispatch.json 加载失败，本次运行用内置派驻配置', e && e.message);
    }
    // E8：镜像竞技场（拿不到则 domain/arena.js 退回内置同值兜底）
    let arenaJson = null;
    try {
      arenaJson = await fetchJson('assets/data/arena.json');
    } catch (e) {
      console.warn('[loader] arena.json 加载失败，本次运行用内置竞技场配置', e && e.message);
    }
    // E6：赛季活动循环（拿不到则 domain/season.js 退化为"无内容赛季"，不报错）
    let seasonJson = null;
    try {
      seasonJson = await fetchJson('assets/data/season.json');
    } catch (e) {
      console.warn('[loader] season.json 加载失败，本次运行用内置赛季兜底', e && e.message);
    }
    // E5：好感数值（拿不到则 domain/favor.js 用内置同值曲线兜底）
    let favorJson = null;
    try {
      favorJson = await fetchJson('assets/data/favor.json');
    } catch (e) {
      console.warn('[loader] favor.json 加载失败，本次运行用内置好感曲线', e && e.message);
    }
    // E5：角色档案剧情（拿不到则全员退化为"由阵营+职业组合的通用档案"，不空白）
    let storiesJson = null;
    try {
      storiesJson = await fetchJson('assets/data/stories.json');
    } catch (e) {
      console.warn('[loader] stories.json 加载失败，本次运行无专属剧情', e && e.message);
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
      countersData: countersJson,
      tutorialData: tutorialJson,
      expeditionData: expeditionJson,
      challengeData: challengeJson,
      squadsData: squadsJson,
      dispatchData: dispatchJson,
      arenaData: arenaJson,
      seasonData: seasonJson,
      favorData: favorJson,
      storiesData: storiesJson,
      configData: configJson,
      awakenProfilesData: awakenJson
    };
  }

  const api = { loadAll };
  if (window.Game && window.Game.data) window.Game.data.loader = api;
  window.__loader = api;
})();
