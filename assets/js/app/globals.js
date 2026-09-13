(() => {
  const root = window;
  if (!root.Game) root.Game = {};
  const g = root.Game;
  if (!g.core) g.core = {};
  if (!g.data) g.data = {};
  if (!g.domain) g.domain = {};
  if (!g.battle) g.battle = {};
  if (!g.ui) g.ui = {};

  // 立绘白名单。改这里之前先跑 `node tools/check-assets.mjs` 校验文件名一致性。
  // 注意：文件名必须与 assets/sprites/ 下的真实文件名逐字一致（多余空格会导致 404）。
  const spriteFiles = [
    // ── 角色立绘 ──────────────────────────────────────────────
    // ── D1 新角色批次（2026-09-14，12 张） ──
    "永夜女帝·涅墨西斯.png",
    "苍蓝圣枪·艾莉娅.png",
    "森海守望·薇尔蒂.png",
    "熔岩巨盾·巴尔杜.png",
    "霜华舞姬·雪见.png",
    "雷狱审判·索尔.png",
    "沙海女王·塞赫美.png",
    "晨光牧师·薇薇安.png",
    "铁壁重装·冈瑟.png",
    "疾风箭手·希露.png",
    "赤瞳暗杀者·绯影.png",
    "狂澜斗士·凯恩.png",
    "万物之母·盖亚.png",
    "不灭龙皇·克罗诺斯.png",
    "修罗武姬·酒呑.png",
    "冥界引路人·哈迪.png",
    "圣歌侍从.png",
    "圣殿骑士·罗兰.png",
    "圣湮时王.png",
    "圣翼狮骑·希薇娅.png",
    "圣辉祭司·艾琳.png",
    "墨羽龙皇·红烨.png",
    "大地守卫·托尔.png",
    "天元龙女·孟依.png",
    "幻影猫娘·露露.png",
    "幽冥咒师.png",
    "幽焰炼金·希恩.png",
    "幽蝶梦使·伊芙.png",
    "时空猎人·克罗诺斯.png",
    "星如雨·夜.png",
    "星海歌姬·莉莉丝.png",
    "星镜蛇姬·奈雅.png",
    "晨曦之光·露西.png",
    "暗巷盗贼.png",
    "暗影刺客·劫.png",
    "月刃舞者.png",
    "机械先驱·维克托.png",
    "机械战姬·阿尔法.png",
    "极意剑圣·御田.png",
    "梅书·冬妍.png",
    "流光术师·栞.png",
    "深渊幽灵·赛恩.png",
    "灵魂收割者.png",
    "炼金术士·辛德拉.png",
    "炽羽指挥·阿尔.png",
    "烈焰魔导·莉娜.png",
    "烈阳祭司·阿蒙.png",
    "烬皇·绯莲.png",
    "熔岩巨兽·墨菲.png",
    "瑰羽·夜芙兰.png",
    "真理之手·米迪尔.png",
    "真视之钥·卡蜜拉.png",
    "神罚天使·加百列.png",
    "终焉神王境.png",
    "终焉神王常态.png",
    "翡翠龙女·依兰.png",
    "耶格龙神.png",
    "花千树・鲤.png",
    "荒原斩骑.png",
    "荒野战医·雷纳.png",
    "荒野猎人·柯琳.png",
    "虚空主宰·卡修斯.png",
    "虚空守门人·洛斯.png",
    "虚空行者·卡莎.png",
    "见习牧师.png",
    "雷霆领主·宙斯.png",
    "雷鸣祭司·莱妮.png",
    "霜冠巫女·澪.png",
    "鬼巫圣女·紫苑.png",
    "齿轮守望者.png",
    // ── AI 量产第一批（2026-09-11，美术圣经 A+B 流程）────────
    "月蚀猎手·薇.png",
    "海妖歌者·珊.png",
    "深渊咏者·赛拉.png",
    "星坠裁缝·芙萝.png",
    "熔火法相·墨炎.png",
    "机巧炮姬·零.png",
    "磐岩审判·托姆.png",
    "铁壁骑士·罗恩.png",
    // ── AI 量产第二批（2026-09-12，SR × 10）──────────────────
    "烈酒斗士.png",
    "暮影游侠.png",
    "寒潮法师.png",
    "沼泽毒刃.png",
    "岩甲卫士.png",
    "雷光使徒.png",
    "绿藤守护.png",
    "星尘术士.png",
    "赤焰枪兵.png",
    "银羽狙击.png",
    // ── AI 量产第三批（2026-09-12，R × 14）──────────────────
    "剑心.png",
    "铁拳学徒.png",
    "林间弓手.png",
    "盾卫新兵.png",
    "草药学徒.png",
    "火把投手.png",
    "寒霜侦察.png",
    "沙漠术士.png",
    "猎犬驯手.png",
    "雷砂工兵.png",
    "街头拳王.png",
    "阴影学徒.png",
    "铜甲守卫.png",
    "海港炮手.png",
    // ── AI 量产第四批（2026-09-12，SSR × 8，角色立绘至此全部补齐）──
    "风刃剑士·岚.png",
    "星环射手·洛.png",
    "雷铸先锋·赫.png",
    "龙纹武者·祁.png",
    "寒铁枪王·斐.png",
    "深林巨卫·柏.png",
    "雷影刺卫·赫兹.png",
    "冰狱审讯官·塞.png",
    // ── 高级角色立绘（jpg）───────────────────────────────────
    "花语守护·柚.jpg",
    "晨曦枪姬·露.jpg",
    "暗影刃舞·璃.jpg",
    "虚空学者·诺亚.jpg",
    "苍穹行者·伊诺.jpg",
    "赤月裁决·鸦.jpg",
    "潮汐守望·涟.jpg",
    // ── 通用敌人模板立绘（index.html 的 enemyTemplates）─────
    "幻影刺客.jpg",
    "禁术先知.jpg",
    "远古龙裔.jpg",
    // ── 通用敌人模板量产（2026-09-12，normal/hard/abyss 全补齐）──
    "史莱姆.png",
    "哥布林.png",
    "森林狼.png",
    "盗贼弓手.png",
    "黑暗精灵.png",
    "岩石傀儡.png",
    "黑暗法师.png",
    "重甲守卫.png",
    "深渊战将.png",
    "钢铁壁垒.png",
    "虚空裂隙者.png",
    "堕落圣使.png"
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
      const stem = String(file).replace(/\.(png|jpe?g|webp|gif|avif)$/i, '');
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
      // 本项目是离线优先的 PWA：远程图片（尤其是带 x-expires 的签名 URL）随时会失效，
      // 一旦失效就是破图而不是占位图。所以这里一律不采用远程立绘，直接退化为占位图。
      const cur = c.imageUrl && String(c.imageUrl).trim();
      const isRemote = /^https?:\/\//i.test(cur || '');
      if (!cur || isRemote) c.imageUrl = portraitPlaceholder(c.name, c.rarity);
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
