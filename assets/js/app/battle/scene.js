(() => {
  function battleSceneDebugStep() {
    if (!battleSceneDebugState) return;
    if (battleSceneDebugState.auto) {
      battleSceneDebugStepOnce();
      return;
    }
    let guard = 0;
    while (battleSceneDebugState && !battleSceneDebugState.awaitingTarget && guard < 200) {
      guard += 1;
      battleSceneDebugStepOnce();
      if (!battleSceneDebugState) return;
      if (battleSceneDebugState.awaitingTarget) return;
      if (aliveCount(battleSceneDebugState.player) === 0 || aliveCount(battleSceneDebugState.enemies) === 0) return;
    }
  }

  function resolveBattleSceneDebugPlayerAction(targetSide, targetIndex) {
    if (!battleSceneDebugState || !battleSceneDebugState.awaitingTarget) return;
    const pending = battleSceneDebugState.awaitingTarget;
    const actor = battleSceneDebugState.player[pending.actorIndex];
    const list = targetSide === 'player' ? battleSceneDebugState.player : battleSceneDebugState.enemies;
    const target = list[targetIndex];
    if (!actor || actor.currentHp <= 0 || !target || target.currentHp <= 0) {
      battleSceneDebugState.awaitingTarget = null;
      renderBattleSceneDebug();
      return;
    }
    if (pending.actionType === 'basic') {
      if (targetSide !== 'enemy') return;
      const frontAlive = (battleSceneDebugState.enemies || []).filter(u => u && u.currentHp > 0 && (u.position || 'front') === 'front');
      if (frontAlive.length > 0 && (target.position || 'front') !== 'front') {
        if (typeof pushBattleSceneDebugFeed === 'function') pushBattleSceneDebugFeed('普攻只能攻击敌方前排');
        renderBattleSceneDebug();
        return;
      }
      const mult =
        actor.class === 'assassin' ? 1.1 :
        actor.class === 'warrior' ? 1.0 :
        actor.class === 'archer' ? 1.0 :
        actor.class === 'mage' ? 1.0 :
        1.0;
      battleSceneDebugApplyHit(actor, target, mult, '普攻', { ccOnce: { used: false } });
      setBattleSceneDebugHitFx('enemy', targetIndex);
    } else if (pending.actionType === 'skill' && typeof pending.skillIndex === 'number') {
      const ok = battleSceneDebugApplySkill(actor, 'player', pending.skillIndex, targetSide, targetIndex);
      if (ok) setBattleSceneDebugHitFx(targetSide, targetIndex);
    }
    battleSceneDebugTickAfterAction(actor);
    battleSceneDebugState.awaitingTarget = null;
    battleSceneDebugState.turnCursor += 1;
    renderBattleSceneDebug();
    if (aliveCount(battleSceneDebugState.player) === 0 || aliveCount(battleSceneDebugState.enemies) === 0) {
      battleSceneDebugFinish(aliveCount(battleSceneDebugState.player) > 0);
    }
    if (battleSceneDebugState && !battleSceneDebugState.auto && !battleSceneDebugState.awaitingTarget) {
      setTimeout(() => battleSceneDebugStep(), 0);
    }
  }

  function toggleBattleSceneDebugRun() {
    if (!battleSceneDebugState) return;
    battleSceneDebugState.running = !battleSceneDebugState.running;
    battleSceneDebugSyncControls();
    if (!battleSceneDebugState.running) return;
    runBattleSceneDebugLoop();
  }

  function runBattleSceneDebugLoop() {
    if (!battleSceneDebugState || !battleSceneDebugState.running) return;
    if (battleSceneDebugState.awaitingTarget) {
      battleSceneDebugState.running = false;
      battleSceneDebugSyncControls();
      return;
    }
    battleSceneDebugStep();
    const delay = Math.max(80, Math.floor(420 / (battleSceneDebugState.speed || 2)));
    setTimeout(() => runBattleSceneDebugLoop(), delay);
  }

  const api = {
    battleSceneDebugStep,
    resolveBattleSceneDebugPlayerAction,
    toggleBattleSceneDebugRun,
    runBattleSceneDebugLoop
  };
  if (window.Game && window.Game.battle) window.Game.battle.scene = api;
  window.__battleScene = api;
})();
