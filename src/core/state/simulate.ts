import { checkWin, createGame, diceSettled, jumpResolved, nextTurn, startRoll, tokenArrived } from './fsm';
import type { GameConfig, GameState } from './types';

/**
 * Run a full game headlessly through the real reducers — used by tests,
 * replays, and the gate-3 determinism verification. seed + config in,
 * identical final state out, every time, on any runtime.
 */
export function simulateGame(config: GameConfig, maxRolls = 10000): GameState {
  let state = createGame(config);
  let rolls = 0;
  while (state.phase !== 'WIN' && rolls < maxRolls) {
    rolls += 1;
    state = startRoll(state);
    state = diceSettled(state);
    state = tokenArrived(state);
    if (state.phase === 'RESOLVING_JUMP') state = jumpResolved(state);
    state = checkWin(state);
    if (state.phase === 'NEXT_TURN') state = nextTurn(state);
  }
  return state;
}

/** Compact, comparison-friendly snapshot of a finished (or in-flight) game. */
export function snapshot(state: GameState): {
  phase: string;
  winner: number | null;
  cells: number[];
  turnNumber: number;
  rng: number;
  logLength: number;
} {
  return {
    phase: state.phase,
    winner: state.winner,
    cells: state.players.map((p) => p.cell),
    turnNumber: state.turnNumber,
    rng: state.rng,
    logLength: state.log.length,
  };
}
