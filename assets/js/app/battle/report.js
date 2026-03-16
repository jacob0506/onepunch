(() => {
  function getEscapeHtml() {
    if (typeof escapeHtml === 'function') return escapeHtml;
    if (window.Game && window.Game.core && window.Game.core.format && typeof window.Game.core.format.escapeHtml === 'function') {
      return window.Game.core.format.escapeHtml;
    }
    return (str) => String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeRegExp(s) {
    if (typeof window.escapeRegExp === 'function') return window.escapeRegExp(s);
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildBattleLogs(params) {
    const escapeHtmlFn = getEscapeHtml();
    const rawFeed = Array.isArray(params && params.feed) ? params.feed : [];
    const players = Array.isArray(params && params.players) ? params.players : [];
    const enemies = Array.isArray(params && params.enemies) ? params.enemies : [];
    const stageName = params && params.stageName ? String(params.stageName) : '';
    const isWin = !!(params && params.isWin);

    const playerNames = new Set(players.map(u => String(u.displayName || u.name || '')).filter(Boolean));
    const enemyNames = new Set(enemies.map(u => String(u.displayName || u.name || '')).filter(Boolean));

    const wrapName = (html, name, cls) => {
      const safe = escapeHtmlFn(name);
      if (!safe) return html;
      return html.replace(new RegExp(escapeRegExp(safe), 'g'), `<span class="${cls} font-bold">${safe}</span>`);
    };

    const formatLine = (line) => {
      let html = escapeHtmlFn(line);
      [...playerNames].sort((a, b) => b.length - a.length).forEach(n => { html = wrapName(html, n, 'text-blue-300'); });
      [...enemyNames].sort((a, b) => b.length - a.length).forEach(n => { html = wrapName(html, n, 'text-red-300'); });

      html = html
        .replace(/(造成)\s+(\d+)/g, `$1 <span class="text-red-400 font-black">$2</span>`)
        .replace(/(持续伤害)\s+(\d+)/g, `$1 <span class="text-red-400 font-black">$2</span>`)
        .replace(/(回复)\s+(\d+)/g, `$1 <span class="text-green-400 font-black">$2</span>`)
        .replace(/(治疗)\s+(\d+)/g, `$1 <span class="text-green-400 font-black">$2</span>`)
        .replace(/(护盾)\s+(\d+)/g, `$1 <span class="text-purple-300 font-black">$2</span>`)
        .replace(/(能量)([+-])(\d+)/g, `$1$2<span class="text-blue-200 font-black">$3</span>`)
        .replace(/(免疫)/g, `<span class="text-purple-300 font-black">$1</span>`)
        .replace(/(闪避)/g, `<span class="text-yellow-400 font-black">$1</span>`)
        .replace(/(暴击)/g, `<span class="text-red-300 font-black">$1</span>`)
        .replace(/(格挡)/g, `<span class="text-amber-300 font-black">$1</span>`)
        .replace(/(复活)/g, `<span class="text-green-300 font-black">$1</span>`)
        .replace(/(不屈)/g, `<span class="text-yellow-300 font-black">$1</span>`)
        .replace(/(极限力场|生命链接|雨花共鸣|蓦然回首)/g, `<span class="text-amber-300 font-black">$1</span>`);
      return `<div class="text-gray-200 text-xs font-mono leading-5">${html}</div>`;
    };

    const isKey = (line) => /(已倒下|复活|不屈|极限力场|生命链接|雨花共鸣|蓦然回首|斩杀|免疫|闪避)/.test(line);
    const header = `<div class="text-primary font-bold">--- 战斗开始: ${escapeHtmlFn(stageName)} ---</div>`;
    const footer = `<div class="mt-2 font-bold ${isWin ? 'text-green-400' : 'text-red-400'}">--- 战斗结束: ${isWin ? '胜利' : '失败'} ---</div>`;

    const stripFeedPrefix = (line) => String(line || '').replace(/^\[[^\]]+\]\s*/, '');
    const roundMarker = (line) => typeof line === 'string' && /^回合开始/.test(stripFeedPrefix(line));
    const parseRoundNo = (line) => {
      if (typeof line !== 'string') return null;
      const m = stripFeedPrefix(line).match(/第\s*(\d+)\s*回合/);
      if (!m) return null;
      const n = parseInt(m[1], 10);
      return Number.isFinite(n) ? n : null;
    };

    let feed = rawFeed;
    if (feed.length > 1400) {
      let markers = 0;
      let start = Math.max(0, feed.length - 1400);
      for (let i = feed.length - 1; i >= 0; i--) {
        if (roundMarker(feed[i])) {
          markers += 1;
          if (markers >= 12) {
            start = i;
            break;
          }
        }
      }
      feed = feed.slice(start);
    }

    const roundBlocks = [];
    let currentRound = { r: parseRoundNo(feed.find(roundMarker)) || 1, lines: [] };
    feed.forEach(line => {
      if (typeof line !== 'string') return;
      if (roundMarker(line) && currentRound.lines.length) {
        roundBlocks.push(currentRound);
        currentRound = { r: parseRoundNo(line) || (currentRound.r + 1), lines: [] };
      }
      currentRound.lines.push(line);
    });
    if (currentRound.lines.length) roundBlocks.push(currentRound);

    const detailsHtml = roundBlocks.map(block => {
      const keyCount = block.lines.reduce((n, l) => n + (isKey(l) ? 1 : 0), 0);
      const open = block.r <= 2 ? ' open' : '';
      const title = keyCount > 0 ? `第 ${block.r} 回合（关键 ${keyCount}）` : `第 ${block.r} 回合`;
      const body = block.lines.map(formatLine).join('');
      return `<details${open} class="mb-2"><summary class="cursor-pointer text-gray-300 font-bold">${title}</summary><div class="pl-3 mt-2 space-y-1">${body}</div></details>`;
    }).join('');

    return [header, detailsHtml, footer];
  }

  const api = { buildBattleLogs };
  if (window.Game && window.Game.battle) window.Game.battle.report = api;
  window.__battleReport = api;
})();
