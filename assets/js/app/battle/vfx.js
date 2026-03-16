(() => {
  function ensureStyles() {
    if (document.getElementById('battleVfxStyles')) return;
    const style = document.createElement('style');
    style.id = 'battleVfxStyles';
    style.textContent = `
      @keyframes battlePulseCrit { 0% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(248,113,113,0)); } 45% { transform: scale(1.08); filter: drop-shadow(0 0 10px rgba(248,113,113,0.55)); } 100% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(248,113,113,0)); } }
      @keyframes battlePulseGood { 0% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(52,211,153,0)); } 45% { transform: scale(1.06); filter: drop-shadow(0 0 10px rgba(52,211,153,0.45)); } 100% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(52,211,153,0)); } }
      @keyframes battleScreenShake { 0% { transform: translate3d(0,0,0); } 15% { transform: translate3d(-1px, 1px, 0); } 30% { transform: translate3d(2px, -1px, 0); } 45% { transform: translate3d(-2px, 0, 0); } 60% { transform: translate3d(2px, 1px, 0); } 75% { transform: translate3d(-1px, -1px, 0); } 100% { transform: translate3d(0,0,0); } }
      @keyframes battleFlashRed { 0% { box-shadow: inset 0 0 0 rgba(0,0,0,0); } 25% { box-shadow: inset 0 0 120px rgba(248,113,113,0.28); } 100% { box-shadow: inset 0 0 0 rgba(0,0,0,0); } }
      @keyframes battleFlashPurple { 0% { box-shadow: inset 0 0 0 rgba(0,0,0,0); } 25% { box-shadow: inset 0 0 120px rgba(168,85,247,0.26); } 100% { box-shadow: inset 0 0 0 rgba(0,0,0,0); } }
      @keyframes battleSlam { 0% { transform: translate3d(0,0,0) scale(1); } 35% { transform: translate3d(0, 1px, 0) scale(1.01); } 100% { transform: translate3d(0,0,0) scale(1); } }
      .battle-crit { display:inline-block; animation: battlePulseCrit 520ms ease-out 1; }
      .battle-good { display:inline-block; animation: battlePulseGood 520ms ease-out 1; }
      body.battle-shake { animation: battleScreenShake 260ms ease-out 1; }
      body.battle-flash-red { animation: battleFlashRed 420ms ease-out 1; }
      body.battle-flash-purple { animation: battleFlashPurple 520ms ease-out 1; }
      body.battle-slam { animation: battleSlam 260ms ease-out 1; }
    `;
    document.head.appendChild(style);
  }

  function retriggerBodyClass(cls, ms) {
    if (!document || !document.body) return;
    ensureStyles();
    document.body.classList.remove(cls);
    void document.body.offsetWidth;
    document.body.classList.add(cls);
    setTimeout(() => document.body.classList.remove(cls), ms || 360);
  }

  function play(type) {
    if (!type) return;
    if (type === 'crit') return retriggerBodyClass('battle-shake', 320);
    if (type === 'ultimate') return retriggerBodyClass('battle-flash-purple', 560);
    if (type === 'slam') return retriggerBodyClass('battle-slam', 320);
    if (type === 'danger') return retriggerBodyClass('battle-flash-red', 460);
  }

  function decorateLogHtml(html) {
    ensureStyles();
    let out = String(html || '');
    out = out
      .replace(/(造成)\s+(\d+)/g, `$1 <span class="text-red-400 font-black">$2</span>`)
      .replace(/(持续伤害)\s+(\d+)/g, `$1 <span class="text-red-400 font-black">$2</span>`)
      .replace(/(回复)\s+(\d+)/g, `$1 <span class="battle-good text-green-400 font-black">$2</span>`)
      .replace(/(治疗)\s+(\d+)/g, `$1 <span class="battle-good text-green-400 font-black">$2</span>`)
      .replace(/(护盾)\s+(\d+)/g, `$1 <span class="text-purple-300 font-black">$2</span>`)
      .replace(/(免疫)/g, `<span class="text-purple-300 font-black">$1</span>`)
      .replace(/(闪避)/g, `<span class="text-yellow-400 font-black">$1</span>`)
      .replace(/(暴击)/g, `<span class="battle-crit text-red-300 font-black">$1</span>`)
      .replace(/(格挡)/g, `<span class="text-amber-300 font-black">$1</span>`)
      .replace(/(复活)/g, `<span class="text-green-300 font-black">$1</span>`)
      .replace(/(不屈)/g, `<span class="text-yellow-300 font-black">$1</span>`)
      .replace(/(首领|阶段|献祭|龙吼|磁暴|虚空|审判|天穹|潮汐|熔核|星棱|神罚)/g, `<span class="text-amber-300 font-black">$1</span>`);
    return out;
  }

  function triggerFromLogHtml(html) {
    const s = String(html || '');
    if (s.includes('暴击')) play('crit');
    if (/(审判|神罚|终焉|天穹裂隙|星棱光束|海啸|熔核过载)/.test(s)) play('ultimate');
    if (/(真实伤害|斩杀|击穿)/.test(s)) play('danger');
  }

  const api = { ensureStyles, play, decorateLogHtml, triggerFromLogHtml };
  if (window.Game && window.Game.battle) window.Game.battle.vfx = api;
  window.__battleVfx = api;
})();
