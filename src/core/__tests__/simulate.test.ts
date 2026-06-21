import { describe, expect, it } from 'vitest';
// Pull from the barrel so the re-export module executes under coverage.
import { simulateGame, snapshot } from '../index';

describe('simulateGame', () => {
  it('is fully deterministic: same seed → identical final state', () => {
    const a = simulateGame({ playerNames: ['P1', 'P2'], seed: 42 });
    const b = simulateGame({ playerNames: ['P1', 'P2'], seed: 42 });
    expect(snapshot(a)).toEqual(snapshot(b));
    expect(a.log).toEqual(b.log);
  });

  it('reaches a win with a winner on the last cell (seed 42 golden game — gate 3)', () => {
    const s = simulateGame({ playerNames: ['P1', 'P2'], seed: 42 });
    expect(s.phase).toBe('WIN');
    expect(s.winner).not.toBeNull();
    expect(s.players[s.winner ?? 0]?.cell).toBe(100);
    // Golden snapshot — the running app must reproduce exactly this state (docs/VERIFICATION.md).
    expect(snapshot(s)).toEqual(GOLDEN_SEED_42);
  });

  it('different seeds usually produce different games', () => {
    const a = simulateGame({ playerNames: ['P1', 'P2'], seed: 1 });
    const b = simulateGame({ playerNames: ['P1', 'P2'], seed: 2 });
    expect(a.log).not.toEqual(b.log);
  });

  it('stops at maxRolls without a winner', () => {
    const s = simulateGame({ playerNames: ['P1', 'P2'], seed: 42 }, 1);
    expect(s.phase).toBe('AWAITING_ROLL');
    expect(s.winner).toBeNull();
  });

  it('completes with 4 players and capture enabled', () => {
    const s = simulateGame({
      playerNames: ['a', 'b', 'c', 'd'],
      seed: 7,
      ruleSet: { captureEnabled: true },
    });
    expect(s.phase).toBe('WIN');
  });
});

// Captured from the first verified run (see docs/VERIFICATION.md gate 3).
const GOLDEN_SEED_42 = {
  phase: 'WIN',
  winner: 0,
  cells: [100, 27],
  turnNumber: 46,
  rng: 2647648816,
  logLength: 144,
};
