import { useEffect } from 'react';
import { Vector3 } from 'three';
import { cellToWorld, must } from '../core';
import { useStore } from '../store';
import { soundBus } from '../ui/sound/SoundBus';
import type { Choreographer } from './pieces/choreographer';
import { registry } from './registry';

/**
 * Subscribes to FSM phase changes and dispatches animation work. Animations
 * report completion via callbacks that advance the FSM — the engine is a
 * visualization of decisions core/ has already made.
 */
export function GameDriver({ choreographer }: { choreographer: Choreographer }) {
  useEffect(
    () =>
      useStore.subscribe((state, prev) => {
        if (state.game.phase === prev.game.phase && state.game === prev.game) return;
        const { game, instantMode } = state;

        if (game.phase === 'TOKEN_MOVING' && prev.game.phase !== 'TOKEN_MOVING') {
          if (instantMode || game.turn.path.length === 0) {
            queueMicrotask(() => useStore.getState().onTokenArrived());
            return;
          }
          const token = registry.tokens[game.current];
          if (token === null || token === undefined) {
            queueMicrotask(() => useStore.getState().onTokenArrived());
            return;
          }
          choreographer.planMove(game, token, () => useStore.getState().onTokenArrived());
        }

        if (game.phase === 'RESOLVING_JUMP' && prev.game.phase !== 'RESOLVING_JUMP') {
          if (instantMode) {
            queueMicrotask(() => useStore.getState().onJumpResolved());
            return;
          }
          const token = registry.tokens[game.current];
          const jump = game.turn.jump;
          if (token === null || token === undefined || jump === null) {
            queueMicrotask(() => useStore.getState().onJumpResolved());
            return;
          }
          if (jump.kind === 'ladder') {
            choreographer.planLadder(game, jump, token, () => useStore.getState().onJumpResolved());
          } else {
            useStore.getState().pulseVignette(); // red screen-edge pulse (spec §9)
            choreographer.planSnake(game, jump, token, () => useStore.getState().onJumpResolved());
          }
        }

        if (game.phase === 'WIN' && prev.game.phase !== 'WIN') {
          const winner = must(game.players[game.winner ?? 0]);
          const { x, z } = winner.cell === 0 ? { x: 0, z: 0 } : cellToWorld(winner.cell);
          if (!instantMode) {
            registry.fx?.confetti(new Vector3(x, 1.2, z));
            soundBus.play('win');
          }
        }
      }),
    [choreographer],
  );

  return null;
}
