/**
 * B9 音频引擎（程序化合成，零音频资产）—— 全项目音频唯一入口。
 *
 * 设计：
 *  · SFX 用 Web Audio（osc/noise + envelope）现场合成，不加载任何音频文件
 *    → 没有 mp3/ogg 需要登记 SW，也永远不会有"音频 404 / 破音"这类问题。
 *  · BGM 是 16 步音序器（lookahead scheduler），主城 / 战斗两首，音量刻意压低。
 *  · 自动播策略：AudioContext 懒创建 + 首次任意 click 时 resume（浏览器要求用户手势）。
 *  · 静音持久化在独立 localStorage 键（wb_audio_muted），不动存档结构。
 *  · 按钮点击音用 document 级 capture 委托，一处埋点覆盖全部按钮，业务零侵入。
 *  · 所有对外播放入口都做了"引擎缺失/未解锁静默跳过"，业务侧调用不需要 try/catch。
 *
 * 对外契约（Game.audio / window.__audio）：
 *  sfx(name)         播放音效：click/coin/hit/crit/skill/levelup/rare/epic/victory/defeat
 *  setBgm(name|null) 切 BGM：'city' | 'battle' | null（停止）
 *  setMuted(bool)    静音开关（持久化；静音即停 BGM）
 *  toggleMuted()     翻转静音，返回当前 muted
 *  state()           测试快照 { muted, bgm, sfxCount, ctxState }
 */
(() => {
  'use strict';

  const LS_KEY = 'wb_audio_muted';
  const SFX_NAMES = ['click', 'coin', 'hit', 'crit', 'skill', 'levelup', 'rare', 'epic', 'victory', 'defeat'];

  let ctx = null;            // AudioContext（懒创建）
  let master = null;         // 主增益
  let muted = false;
  try { muted = localStorage.getItem(LS_KEY) === '1'; } catch (e) { /* 隐私模式等 */ }

  let sfxCount = 0;
  let bgm = null;            // 'city' | 'battle' | null
  let bgmTimer = null;       // scheduler 句柄
  let bgmStep = 0;
  let bgmNextTime = 0;       // 下一拍的 AudioContext 时间
  let bgmGain = null;        // BGM 专用增益（淡入淡出）

  let lastHitAt = 0;         // hit/crit 节流（战斗里一帧多次命中会爆音）

  function ensureCtx() {
    if (muted) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.9;
        master.connect(ctx.destination);
        bgmGain = ctx.createGain();
        bgmGain.gain.value = 0;
        bgmGain.connect(master);
      } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* ignore */ } }
    return ctx;
  }

  // ── SFX 合成基元 ──────────────────────────────────────────────
  // ⚠️ 音频内部一律用独立 PRNG，禁止碰 Math.random —— A5 数值快照依赖
  // Math.random 调用序列的确定性（noise 缓冲一次要吃几千个随机数，
  // 会把战斗 RNG 流整体挪动，表现为快照"无缘无故" DIFF）。
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const audioRnd = mulberry32(0xA0D10);

  function tone(type, f0, f1, dur, vol, when) {
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterHz) {
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (audioRnd() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterHz || 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  function arp(notes, type, vol, step) {
    notes.forEach((f, i) => tone(type, f, f, step * 0.9, vol, i * step));
  }

  const SFX = {
    click:   () => tone('triangle', 620, 880, 0.05, 0.07),
    coin:    () => { tone('square', 920, 920, 0.06, 0.05); tone('square', 1380, 1380, 0.09, 0.05, 0.06); },
    hit:     () => noise(0.07, 0.16, 850),
    crit:    () => { noise(0.12, 0.22, 1400); tone('square', 220, 90, 0.12, 0.12); },
    skill:   () => { tone('sawtooth', 300, 950, 0.16, 0.09); noise(0.1, 0.08, 2200); },
    levelup: () => arp([523, 659, 784], 'triangle', 0.09, 0.09),
    rare:    () => arp([659, 784, 988, 1319], 'sine', 0.1, 0.09),
    epic:    () => { arp([659, 831, 988, 1319, 1661], 'sine', 0.11, 0.1); arp([659, 831, 988, 1319, 1661], 'triangle', 0.05, 0.1); },
    victory: () => arp([523, 659, 784, 1047], 'triangle', 0.1, 0.12),
    defeat:  () => arp([392, 330, 262], 'triangle', 0.09, 0.16)
  };

  function sfx(name) {
    if (muted || !SFX[name]) return false;
    // 战斗一帧可能多次命中 → hit/crit 节流 60ms，防止爆音
    const now = Date.now();
    if ((name === 'hit' || name === 'crit')) {
      if (now - lastHitAt < 60) return false;
      lastHitAt = now;
    }
    if (!ensureCtx()) return false;
    try { SFX[name](); sfxCount++; return true; } catch (e) { return false; }
  }

  // ── BGM 音序器 ────────────────────────────────────────────────
  // 16 步循环；每步 { b: 低音频率, n: [琶音频率...] }，null = 休止。
  const N = (m, o = 4) => 440 * Math.pow(2, (m - 9) / 12 + (o - 4)); // 半音(m:0-11, A4=9)
  const CITY = { bpm: 72, vol: 0.035, steps: buildCity() };
  const BATTLE = { bpm: 116, vol: 0.045, steps: buildBattle() };

  function buildCity() { // C 大调温和琶音，C - Am - F - G
    const seq = [];
    const bars = [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]];
    bars.forEach(bar => {
      seq.push({ b: N(bar[0], 3), n: [N(bar[0])], });
      seq.push({ b: null, n: [N(bar[1])] });
      seq.push({ b: null, n: [N(bar[2])] });
      seq.push({ b: null, n: [N(bar[1])] });
    });
    return seq;
  }
  function buildBattle() { // A 小调紧张低音 + 半音逼近
    const seq = [];
    const roots = [9, 9, 8, 10]; // A A G# B（低八度）
    roots.forEach(r => {
      for (let i = 0; i < 4; i++) {
        seq.push({ b: N(r, 2), n: i % 2 === 0 ? [N(r + 12)] : null });
      }
    });
    return seq;
  }

  function bgmStepFn() {
    if (!ctx || !bgmGain) return;
    const track = bgm === 'city' ? CITY : bgm === 'battle' ? BATTLE : null;
    if (!track) return;
    const spb = 60 / track.bpm / 2; // 8 分音符
    while (bgmNextTime < ctx.currentTime + 0.3) {
      const step = track.steps[bgmStep % track.steps.length];
      const t = Math.max(bgmNextTime, ctx.currentTime + 0.02);
      if (step.b) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = step.b;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(track.vol * 1.6, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 0.95);
        o.connect(g); g.connect(bgmGain);
        o.start(t); o.stop(t + spb);
      }
      (step.n || []).forEach(f => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(track.vol, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 1.4);
        o.connect(g); g.connect(bgmGain);
        o.start(t); o.stop(t + spb * 1.6);
      });
      bgmNextTime += spb;
      bgmStep++;
    }
  }

  function setBgm(name) {
    if (name === bgm) return bgm;
    bgm = muted ? null : (name || null);
    if (!ctx || !bgmGain) return bgm;
    if (bgm) {
      // 重置音序器游标，淡入
      bgmGain.gain.cancelScheduledValues(ctx.currentTime);
      bgmGain.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
      if (!bgmTimer) {
        bgmNextTime = ctx.currentTime + 0.05;
        bgmTimer = setInterval(bgmStepFn, 100);
      }
    } else {
      bgmGain.gain.cancelScheduledValues(ctx.currentTime);
      bgmGain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    }
    return bgm;
  }

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(LS_KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (muted) {
      setBgm(null);
    } else if (bgm === null && lastWantedBgm) {
      setBgm(lastWantedBgm); // 解除静音后恢复想要的曲子
    }
    syncBtn();
    return muted;
  }

  let lastWantedBgm = null;
  const _setBgm = setBgm;
  setBgm = function (name) { if (name) lastWantedBgm = name; return _setBgm(name); };

  function toggleMuted() { return setMuted(!muted); }

  function state() {
    return {
      muted, bgm, sfxCount,
      ctxState: ctx ? ctx.state : 'none',
      names: SFX_NAMES.slice()
    };
  }

  // ── UI：header 静音按钮 + 全局手势解锁 + 按钮点击音 ───────────
  function syncBtn() {
    const btn = document.getElementById('audioToggleBtn');
    if (!btn) return;
    const icon = btn.querySelector('i');
    if (icon) icon.className = muted ? 'fa fa-volume-off' : 'fa fa-volume-up';
    btn.title = muted ? '开启声音' : '静音';
  }

  function bindUi() {
    const btn = document.getElementById('audioToggleBtn');
    if (btn && !btn.__audioBound) {
      btn.__audioBound = true;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMuted();
      });
    }
    syncBtn();
  }

  // capture 阶段：任何按钮点击 → 手势解锁 + 按钮音（被 stopPropagation 也拦不到）
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('.ui-btn, button') : null;
    if (btn && btn.id === 'audioToggleBtn') return; // 静音键自己不响（避免"关声音还响一声"）
    if (btn) sfx('click');
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindUi);
  } else {
    bindUi();
  }

  // ── 对外暴露（A3 契约：Game.audio；工具直读 window.__audio）──
  const api = { sfx, setBgm, setMuted, toggleMuted, state, SFX_NAMES: SFX_NAMES.slice() };
  window.Game = window.Game || {};
  Game.audio = api;
  window.__audio = api;
})();
