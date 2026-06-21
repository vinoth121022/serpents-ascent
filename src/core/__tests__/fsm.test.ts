import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkWin,
  createGame,
  diceSettled,
  jumpResolved,
  nextTurn,
  setStrictMode,
  startRoll,
  tokenArrived,
} from '../state/fsm';
import type { GameConfig, GameState } from '../state/types';

afterEach(() => {
  setStrictMode(true);
  vi.restoreAllMocks();
});

function game(overrides: Partial<GameConfig> = {}): GameState {
  return createGame({ playerNames: ['P1', 'P2'], seed: 42, ...overrides });
}

/** Put a player on a cell (test helper — states are plain data). */
function withCell(state: GameState, player: number, cell: number): GameState {
  return { ...state, players: state.players.map((p) => (p.id === player ? { ...p, cell } : p)) };
}

/** Run one full turn through the FSM, asserting the canonical phase walk. */
function playTurn(state: GameState): GameState {
  let s = startRoll(state);
  expect(s.phase).toBe('DICE_ROLLING');
  s = diceSettled(s);
  expect(s.phase).toBe('TOKEN_MOVING');
  s = tokenArrived(s);
  if (s.phase === 'RESOLVING_JUMP') s = jumpResolved(s);
  expect(s.phase).toBe('CHECK_WIN');
  s = checkWin(s);
  if (s.phase === 'NEXT_TURN') s = nextTurn(s);
  return s;
}

describe('createGame', () => {
  it('rejects fewer than 2 or more than 4 players', () => {
    expect(() => createGame({ playerNames: ['solo'], seed: 1 })).toThrow(RangeError);
    expect(() => createGame({ playerNames: ['a', 'b', 'c', 'd', 'e'], seed: 1 })).toThrow(RangeError);
  });

  it('supports 2..4 players starting off-board with classic rules', () => {
    const g2 = game();
    expect(g2.players).toHaveLength(2);
    expect(g2.players.every((p) => p.cell === 0)).toBe(true);
    expect(g2.phase).toBe('AWAITING_ROLL');
    expect(g2.ruleSet.exactRollToWin).toBe(true);
    expect(g2.log).toEqual([{ type: 'GAME_STARTED', seed: 42, playerNames: ['P1', 'P2'] }]);

    const g4 = createGame({ playerNames: ['a', 'b', 'c', 'd'], seed: 1 });
    expect(g4.players).toHaveLength(4);
  });

  it('applies rule overrides and validates custom boards', () => {
    const g = game({ ruleSet: { captureEnabled: true } });
    expect(g.ruleSet.captureEnabled).toBe(true);
    expect(g.ruleSet.rollSixAgain).toBe(true); // untouched defaults preserved

    const custom = { size: 10, jumps: [{ from: 2, to: 90, kind: 'ladder' as const }] };
    expect(createGame({ playerNames: ['a', 'b'], seed: 1, board: custom }).board).toBe(custom);
    expect(() =>
      createGame({ playerNames: ['a', 'b'], seed: 1, board: { size: 10, jumps: [{ from: 100, to: 1, kind: 'snake' }] } }),
    ).toThrow(/invalid board/);
  });
});

describe('a plain turn', () => {
  it('walks the FSM and passes the turn', () => {
    const s = playTurn(game({ rollScript: [3] }));
    expect(s.players[0]?.cell).toBe(3);
    expect(s.current).toBe(1);
    expect(s.phase).toBe('AWAITING_ROLL');
    expect(s.turnNumber).toBe(2);
    expect(s.log.map((e) => e.type)).toEqual(['GAME_STARTED', 'ROLLED', 'MOVED', 'TURN_PASSED']);
  });

  it('records the serpentine path in the MOVED event', () => {
    let s = startRoll(game({ rollScript: [3] }));
    s = diceSettled(s);
    expect(s.turn.path).toEqual([1, 2, 3]);
    s = tokenArrived(s);
    const moved = s.log.find((e) => e.type === 'MOVED');
    expect(moved).toMatchObject({ from: 0, to: 3, path: [1, 2, 3], bounced: false });
  });
});

describe('jump resolution', () => {
  it('climbs a ladder (4 → 14) through RESOLVING_JUMP', () => {
    let s = startRoll(game({ rollScript: [4] }));
    s = diceSettled(s);
    s = tokenArrived(s);
    expect(s.phase).toBe('RESOLVING_JUMP');
    expect(s.turn.jump).toEqual({ from: 4, to: 14, kind: 'ladder' });
    expect(s.players[0]?.cell).toBe(4); // landed but not yet jumped
    s = jumpResolved(s);
    expect(s.players[0]?.cell).toBe(14);
    expect(s.log.at(-1)).toEqual({ type: 'JUMPED', player: 0, kind: 'ladder', from: 4, to: 14 });
  });

  it('slides down a snake (16 → 6)', () => {
    let s = withCell(game({ rollScript: [6] }), 0, 10);
    // Note: a scripted 6 also grants an extra turn — irrelevant to the jump itself.
    s = startRoll(s);
    s = diceSettled(s);
    s = tokenArrived(s);
    expect(s.phase).toBe('RESOLVING_JUMP');
    s = jumpResolved(s);
    expect(s.players[0]?.cell).toBe(6);
    expect(s.log.at(-1)).toEqual({ type: 'JUMPED', player: 0, kind: 'snake', from: 16, to: 6 });
  });
});

describe('endgame rules', () => {
  it('bounces back on overshoot (98 + 5 → 97)', () => {
    let s = withCell(game({ rollScript: [5] }), 0, 98);
    s = startRoll(s);
    s = diceSettled(s);
    expect(s.turn.path).toEqual([99, 100, 99, 98, 97]);
    expect(s.turn.bounced).toBe(true);
    s = tokenArrived(s);
    expect(s.players[0]?.cell).toBe(97);
    expect(s.phase).toBe('CHECK_WIN');
  });

  it('wins on an exact landing (94 + 6 → 100)', () => {
    let s = withCell(game({ rollScript: [6] }), 0, 94);
    s = startRoll(s);
    s = diceSettled(s);
    s = tokenArrived(s);
    expect(s.phase).toBe('CHECK_WIN'); // no jump exists from 100 (validated)
    s = checkWin(s);
    expect(s.phase).toBe('WIN');
    expect(s.winner).toBe(0);
    expect(s.log.at(-1)).toEqual({ type: 'WON', player: 0 });
  });

  it('clamps to 100 and wins when exact-roll-to-win is off', () => {
    let s = withCell(game({ rollScript: [5], ruleSet: { exactRollToWin: false } }), 0, 98);
    s = playTurn(s);
    expect(s.phase).toBe('WIN');
    expect(s.players[0]?.cell).toBe(100);
  });

  it('stays put on overshoot when bounce is off', () => {
    let s = withCell(game({ rollScript: [5], ruleSet: { bounceOnOvershoot: false } }), 0, 98);
    s = playTurn(s);
    expect(s.players[0]?.cell).toBe(98);
    expect(s.phase).toBe('AWAITING_ROLL');
    expect(s.current).toBe(1); // no MOVED event, turn passed
    expect(s.log.some((e) => e.type === 'MOVED')).toBe(false);
  });
});

describe('six-chain rule', () => {
  it('grants extra turns for a 6, then forfeits the third consecutive 6', () => {
    let s = game({ rollScript: [6, 6, 6, 2] });

    s = playTurn(s); // first 6: 0 → 6
    expect(s.players[0]?.cell).toBe(6);
    expect(s.current).toBe(0); // goes again
    expect(s.sixChain).toBe(1);
    expect(s.log.at(-1)).toEqual({ type: 'EXTRA_TURN', player: 0 });

    s = playTurn(s); // second 6: 6 → 12
    expect(s.players[0]?.cell).toBe(12);
    expect(s.current).toBe(0);
    expect(s.sixChain).toBe(2);

    s = playTurn(s); // third 6: forfeited, no movement, turn passes
    expect(s.players[0]?.cell).toBe(12);
    expect(s.current).toBe(1);
    expect(s.sixChain).toBe(0);
    expect(s.log.some((e) => e.type === 'SIX_FORFEIT')).toBe(true);

    s = playTurn(s); // P2 rolls 2 normally
    expect(s.players[1]?.cell).toBe(2);
  });

  it('treats every 6 as a plain roll when roll-six-again is off', () => {
    let s = game({ rollScript: [6], ruleSet: { rollSixAgain: false } });
    s = playTurn(s);
    expect(s.players[0]?.cell).toBe(6);
    expect(s.current).toBe(1);
    expect(s.log.some((e) => e.type === 'EXTRA_TURN')).toBe(false);
  });
});

describe('capture rule', () => {
  it('is off by default — opponents share a cell peacefully', () => {
    let s = withCell(game({ rollScript: [5] }), 1, 5);
    s = playTurn(s);
    expect(s.players[0]?.cell).toBe(5);
    expect(s.players[1]?.cell).toBe(5);
  });

  it('sends an opponent back to start on a direct landing', () => {
    let s = withCell(game({ rollScript: [5], ruleSet: { captureEnabled: true } }), 1, 5);
    s = playTurn(s);
    expect(s.players[0]?.cell).toBe(5);
    expect(s.players[1]?.cell).toBe(0);
    expect(s.log.some((e) => e.type === 'CAPTURED' && e.victim === 1 && e.cell === 5)).toBe(true);
  });

  it('captures at a jump destination too', () => {
    let s = withCell(game({ rollScript: [4], ruleSet: { captureEnabled: true } }), 1, 14);
    s = playTurn(s); // P1: 0 → 4 → ladder → 14, capturing P2
    expect(s.players[0]?.cell).toBe(14);
    expect(s.players[1]?.cell).toBe(0);
  });

  it('never captures at the start cell or the winning cell', () => {
    // Start cell: a forfeited third six leaves P1 on 0 while P2 is also on 0.
    let s = game({ rollScript: [6], ruleSet: { captureEnabled: true } });
    s = { ...s, sixChain: 2 };
    s = playTurn(s);
    expect(s.players[1]?.cell).toBe(0);
    expect(s.log.some((e) => e.type === 'CAPTURED')).toBe(false);

    // Winning cell: landing on 100 wins; capture logic must skip it by cell value.
    let w = withCell(game({ rollScript: [6], ruleSet: { captureEnabled: true } }), 0, 94);
    w = playTurn(w);
    expect(w.phase).toBe('WIN');
    expect(w.log.some((e) => e.type === 'CAPTURED')).toBe(false);
  });
});

describe('roll script', () => {
  it('falls back to the seeded PRNG when the script is exhausted', () => {
    let s = game({ rollScript: [2] });
    s = playTurn(s); // scripted 2
    expect(s.players[0]?.cell).toBe(2);
    const rngBefore = s.rng;
    s = startRoll(s); // PRNG draw
    const rolled = s.log.at(-1);
    expect(rolled?.type).toBe('ROLLED');
    if (rolled?.type === 'ROLLED') {
      expect(rolled.value).toBeGreaterThanOrEqual(1);
      expect(rolled.value).toBeLessThanOrEqual(6);
    }
    expect(s.rng).not.toBe(rngBefore);
  });
});

describe('illegal transitions', () => {
  it('throw in strict mode', () => {
    const s = game(); // AWAITING_ROLL
    expect(() => diceSettled(s)).toThrow(/illegal transition: diceSettled/);
    expect(() => startRoll({ ...s, phase: 'WIN' })).toThrow(/illegal transition: startRoll/);
  });

  it('no-op with console.error in prod mode — every reducer', () => {
    setStrictMode(false);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const s = { ...game(), phase: 'WIN' as const };
    expect(startRoll(s)).toBe(s);
    expect(diceSettled(s)).toBe(s);
    expect(tokenArrived(s)).toBe(s);
    expect(jumpResolved(s)).toBe(s);
    expect(checkWin(s)).toBe(s);
    expect(nextTurn(s)).toBe(s);
    expect(spy).toHaveBeenCalledTimes(6);
  });
});

describe('turn rotation', () => {
  it('wraps around the player list', () => {
    let s = createGame({ playerNames: ['a', 'b', 'c'], seed: 9, rollScript: [1, 1, 1] });
    s = playTurn(s);
    expect(s.current).toBe(1);
    s = playTurn(s);
    expect(s.current).toBe(2);
    s = playTurn(s);
    expect(s.current).toBe(0);
    expect(s.turnNumber).toBe(4);
  });
});
