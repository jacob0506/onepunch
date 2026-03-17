(() => {
  const root = window;
  if (!root.Game) root.Game = {};
  const g = root.Game;
  if (!g.core) g.core = {};
  if (!g.data) g.data = {};
  if (!g.domain) g.domain = {};
  if (!g.battle) g.battle = {};
  if (!g.ui) g.ui = {};

  const spriteFiles = [
    "万物之母·盖亚.png", "不灭龙皇·克罗诺斯.png", "修罗武姬·酒呑.png", "冥界引路人·哈迪.png", "圣歌侍从.png", "圣殿骑士·罗兰.png", "圣湮时王.png", "圣翼狮骑·希薇娅.png", "圣辉祭司·艾琳.png", "墨羽龙皇·红烨.png", "大地守卫·托尔.png", "天元龙女·孟依.png", "幻影猫娘·露露.png", "幽冥咒师.png", "幽焰炼金·希恩.png", "幽蝶梦使· 伊芙.png", "时空猎人·克罗诺斯.png", "星如雨·夜.png", "星海歌姬·莉莉丝.png", "星 镜蛇姬·奈雅.png", "晨曦之光·露西.png", "暗巷盗贼.png", "暗影刺客·劫.png", "月刃 舞者.png", "机械先驱·维克托.png", "机械战姬·阿尔法.png", "极意剑圣·御田.png", " 梅书·冬妍.png", "流光术师·栞.png", "深渊幽灵·塞恩.png", "灵魂收割者.png", "炼金术士·辛德拉.png", "炽羽指挥·阿尔.png", "烈焰魔导·莉娜.png", "烈阳祭司·阿蒙.png", "烬皇·绯莲.png", "熔岩巨兽·墨菲.png", "瑰羽·夜芙兰.png", "真理之手·米迪尔.png", "真视之钥·卡蜜拉.png", "神罚天使·加百列.png", "终焉神王境.png", "终焉神王常态.png", "翡翠龙女·依兰.png", "耶格龙神.png", "花千树・鲤.png", "荒原斩骑.png", "荒 野战医·雷纳.png", "荒野猎人·柯琳.png", "虚空主宰·卡修斯.png", "虚空守门人·洛斯.png", "虚空行者·卡莎.png", "见习牧师.png", "雷霆领主·宙斯.png", "雷鸣祭司·莱妮.png", "霜冠巫女·澪.png", "鬼巫圣女·紫苑.png", "齿轮守望者.png"
  ];

  function normalizeSpriteKey(s) {
    return String(s || '')
      .replace(/\s+/g, '')
      .replace(/[·•・]/g, '')
      .replace(/[“”"']/g, '')
      .replace(/[()（）【】\[\]{}]/g, '')
      .toLowerCase();
  }

  function portraitPlaceholder(name, rarity) {
    const r = String(rarity || 'R').toUpperCase();
    const n = String(name || '').replace(/\s+/g, '').slice(0, 8);
    const bg = r === 'SUR' ? '#a855f7' : (r === 'UR' ? '#f59e0b' : (r === 'SSR' ? '#fb7185' : (r === 'SR' ? '#60a5fa' : '#94a3b8')));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}" stop-opacity="0.35"/><stop offset="1" stop-color="#0b1220"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/><circle cx="256" cy="210" r="88" fill="${bg}" fill-opacity="0.28"/><text x="256" y="226" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="56" fill="#e5e7eb" font-weight="800">${r}</text><text x="256" y="352" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="28" fill="#cbd5e1" font-weight="700">${n || '未知'}</text><text x="256" y="392" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="18" fill="#94a3b8">立绘缺失</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  const spriteKeyToUrl = (() => {
    const m = new Map();
    spriteFiles.forEach(file => {
      const stem = String(file).replace(/\.png$/i, '');
      const key = normalizeSpriteKey(stem);
      if (!key) return;
      const url = encodeURI(`./assets/sprites/${file}`);
      if (!m.has(key)) m.set(key, url);
    });
    return m;
  })();

  function resolveSpriteUrlByName(name) {
    const raw = String(name || '');
    if (!raw) return '';
    const tryNames = [];
    tryNames.push(raw);
    tryNames.push(raw.replace(/·(精英|首领)$/g, ''));
    tryNames.push(raw.replace(/^塔主·/g, ''));
    tryNames.push(raw.replace(/·/g, ''));
    tryNames.push(raw.replace(/\s+/g, ''));
    tryNames.push(raw.split('·')[0]);
    tryNames.push(raw.split('·').slice(-1)[0]);
    for (const n of tryNames) {
      const key = normalizeSpriteKey(n);
      const hit = spriteKeyToUrl.get(key);
      if (hit) return hit;
    }
    const targetKey = normalizeSpriteKey(raw);
    if (!targetKey) return '';
    let best = '';
    let bestScore = 0;
    for (const [k, url] of spriteKeyToUrl.entries()) {
      if (!k) continue;
      const ok = k.includes(targetKey) || targetKey.includes(k);
      if (!ok) continue;
      const score = Math.min(k.length, targetKey.length);
      if (score > bestScore) {
        bestScore = score;
        best = url;
      }
    }
    return best || '';
  }

  function applyToCharacters(chars) {
    if (!Array.isArray(chars)) return;
    chars.forEach(c => {
      if (!c) return;
      const resolved = resolveSpriteUrlByName(c.name);
      if (resolved) {
        c.imageUrl = resolved;
        return;
      }
      const has = c.imageUrl && String(c.imageUrl).trim();
      if (!has) c.imageUrl = portraitPlaceholder(c.name, c.rarity);
    });
  }

  root.__sprites = {
    resolveSpriteUrlByName,
    portraitPlaceholder,
    applyToCharacters
  };

  try {
    const host = String(location && location.hostname ? location.hostname : '');
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if (isLocal && typeof navigator !== 'undefined' && navigator.serviceWorker && typeof navigator.serviceWorker.getRegistrations === 'function') {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        (regs || []).forEach((r) => {
          try { r.unregister(); } catch (_) {}
        });
      });
      if (window.caches && typeof window.caches.keys === 'function') {
        window.caches.keys().then((keys) => {
          (keys || []).forEach((k) => {
            try { window.caches.delete(k); } catch (_) {}
          });
        });
      }
    }
  } catch (_) {}
})();
